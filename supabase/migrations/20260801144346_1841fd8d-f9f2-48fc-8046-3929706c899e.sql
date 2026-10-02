-- Helpers
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_moderator_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'));
$$;

-- staff = quem pode acessar backstage (admin, moderador, produtor)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','moderator','organizer'));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_moderator_or_admin(_user_id)
     OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.created_by = _user_id);
$$;

-- Trigger de novo usuário: papel conforme tipo de conta
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE user_count INT; chosen public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    chosen := 'admin';
  ELSIF COALESCE(NEW.raw_user_meta_data->>'account_type','cliente') IN ('produtor','organizer','producer') THEN
    chosen := 'organizer';
  ELSE
    chosen := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- user_roles: leitura própria; escrita apenas via servidor (service_role)
DROP POLICY IF EXISTS "roles admin write" ON public.user_roles;
DROP POLICY IF EXISTS "roles staff read" ON public.user_roles;
DROP POLICY IF EXISTS "roles self read" ON public.user_roles;
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- profiles: admin/moderador podem ler
DROP POLICY IF EXISTS "profiles staff read" ON public.profiles;
CREATE POLICY "profiles staff read" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_moderator_or_admin(auth.uid()));

-- events
DROP POLICY IF EXISTS "events staff write" ON public.events;
DROP POLICY IF EXISTS "events staff read all" ON public.events;
CREATE POLICY "events staff read all" ON public.events FOR SELECT TO authenticated
  USING (public.is_moderator_or_admin(auth.uid()) OR created_by = auth.uid());
CREATE POLICY "events owner insert" ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND (created_by = auth.uid() OR public.is_moderator_or_admin(auth.uid())));
CREATE POLICY "events owner update" ON public.events FOR UPDATE TO authenticated
  USING (public.is_moderator_or_admin(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (public.is_moderator_or_admin(auth.uid()) OR created_by = auth.uid());
CREATE POLICY "events owner delete" ON public.events FOR DELETE TO authenticated
  USING (public.is_moderator_or_admin(auth.uid()) OR created_by = auth.uid());

-- ticket_batches
DROP POLICY IF EXISTS "batches staff write" ON public.ticket_batches;
CREATE POLICY "batches manage" ON public.ticket_batches FOR ALL TO authenticated
  USING (public.can_manage_event(auth.uid(), event_id))
  WITH CHECK (public.can_manage_event(auth.uid(), event_id));

-- coupons
DROP POLICY IF EXISTS "coupons staff all" ON public.coupons;
CREATE POLICY "coupons manage" ON public.coupons FOR ALL TO authenticated
  USING (public.can_manage_event(auth.uid(), event_id))
  WITH CHECK (public.can_manage_event(auth.uid(), event_id));

-- orders
DROP POLICY IF EXISTS "orders staff read" ON public.orders;
CREATE POLICY "orders staff read" ON public.orders FOR SELECT TO authenticated
  USING (public.can_manage_event(auth.uid(), event_id));

-- order_items
DROP POLICY IF EXISTS "items staff read" ON public.order_items;
CREATE POLICY "items staff read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
                 AND public.can_manage_event(auth.uid(), o.event_id)));

-- tickets
DROP POLICY IF EXISTS "tickets staff read" ON public.tickets;
DROP POLICY IF EXISTS "tickets staff update" ON public.tickets;
CREATE POLICY "tickets staff read" ON public.tickets FOR SELECT TO authenticated
  USING (public.can_manage_event(auth.uid(), event_id));
CREATE POLICY "tickets staff update" ON public.tickets FOR UPDATE TO authenticated
  USING (public.can_manage_event(auth.uid(), event_id))
  WITH CHECK (public.can_manage_event(auth.uid(), event_id));

-- check-in respeita a posse do evento
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_code uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ticket RECORD; v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name
    INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.code = p_code
    FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.can_manage_event(v_user, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in',
      'checked_in_at', v_ticket.checked_in_at, 'holder_name', v_ticket.holder_name,
      'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
  END IF;
  IF v_ticket.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancelled');
  END IF;
  UPDATE public.tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = v_user
    WHERE id = v_ticket.id;
  RETURN jsonb_build_object('ok', true, 'holder_name', v_ticket.holder_name,
    'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
END $$;
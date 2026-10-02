CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION private.is_moderator_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'));
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator','organizer'));
$$;

CREATE OR REPLACE FUNCTION private.can_manage_event(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_moderator_or_admin(_user_id)
     OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.created_by = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.can_manage_event_path(_user_id uuid, _path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN
    v_id := (string_to_array(_path, '/'))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN private.can_manage_event(_user_id, v_id);
END $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_moderator_or_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_event_path(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_moderator_or_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_event(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_event_path(uuid, text) TO authenticated, service_role;

-- Recreate policies using the private helpers
DROP POLICY IF EXISTS "coupons staff delete" ON public.coupons;
CREATE POLICY "coupons staff delete" ON public.coupons FOR DELETE TO authenticated USING (private.can_manage_event(auth.uid(), event_id));
DROP POLICY IF EXISTS "coupons staff insert" ON public.coupons;
CREATE POLICY "coupons staff insert" ON public.coupons FOR INSERT TO authenticated WITH CHECK (private.can_manage_event(auth.uid(), event_id));
DROP POLICY IF EXISTS "coupons staff select" ON public.coupons;
CREATE POLICY "coupons staff select" ON public.coupons FOR SELECT TO authenticated USING (private.can_manage_event(auth.uid(), event_id));
DROP POLICY IF EXISTS "coupons staff update" ON public.coupons;
CREATE POLICY "coupons staff update" ON public.coupons FOR UPDATE TO authenticated USING (private.can_manage_event(auth.uid(), event_id)) WITH CHECK (private.can_manage_event(auth.uid(), event_id));

DROP POLICY IF EXISTS "events admin delete" ON public.events;
CREATE POLICY "events admin delete" ON public.events FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "events owner insert" ON public.events;
CREATE POLICY "events owner insert" ON public.events FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()) AND ((created_by = auth.uid()) OR private.is_moderator_or_admin(auth.uid())));
DROP POLICY IF EXISTS "events owner update" ON public.events;
CREATE POLICY "events owner update" ON public.events FOR UPDATE TO authenticated USING (private.is_moderator_or_admin(auth.uid()) OR (created_by = auth.uid())) WITH CHECK (private.is_moderator_or_admin(auth.uid()) OR (created_by = auth.uid()));
DROP POLICY IF EXISTS "events staff read all" ON public.events;
CREATE POLICY "events staff read all" ON public.events FOR SELECT TO authenticated USING (private.is_moderator_or_admin(auth.uid()) OR (created_by = auth.uid()));

DROP POLICY IF EXISTS "items staff read" ON public.order_items;
CREATE POLICY "items staff read" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND private.can_manage_event(auth.uid(), o.event_id)));

DROP POLICY IF EXISTS "orders staff read" ON public.orders;
CREATE POLICY "orders staff read" ON public.orders FOR SELECT TO authenticated USING (private.can_manage_event(auth.uid(), event_id));

DROP POLICY IF EXISTS "payment settings admin read" ON public.payment_settings;
CREATE POLICY "payment settings admin read" ON public.payment_settings FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "payment settings admin update" ON public.payment_settings;
CREATE POLICY "payment settings admin update" ON public.payment_settings FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "platform settings admin update" ON public.platform_settings;
CREATE POLICY "platform settings admin update" ON public.platform_settings FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles staff read" ON public.profiles;
CREATE POLICY "profiles staff read" ON public.profiles FOR SELECT TO authenticated USING (private.is_moderator_or_admin(auth.uid()));

DROP POLICY IF EXISTS "webhook events admin read" ON public.stripe_webhook_events;
CREATE POLICY "webhook events admin read" ON public.stripe_webhook_events FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "batches manage" ON public.ticket_batches;
CREATE POLICY "batches manage" ON public.ticket_batches FOR ALL TO authenticated USING (private.can_manage_event(auth.uid(), event_id)) WITH CHECK (private.can_manage_event(auth.uid(), event_id));

DROP POLICY IF EXISTS "tickets staff read" ON public.tickets;
CREATE POLICY "tickets staff read" ON public.tickets FOR SELECT TO authenticated USING (private.can_manage_event(auth.uid(), event_id));
DROP POLICY IF EXISTS "tickets staff update" ON public.tickets;
CREATE POLICY "tickets staff update" ON public.tickets FOR UPDATE TO authenticated USING (private.can_manage_event(auth.uid(), event_id)) WITH CHECK (private.can_manage_event(auth.uid(), event_id));

DROP POLICY IF EXISTS "event covers staff delete" ON storage.objects;
CREATE POLICY "event covers staff delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'event-covers' AND private.can_manage_event_path(auth.uid(), name));
DROP POLICY IF EXISTS "event covers staff insert" ON storage.objects;
CREATE POLICY "event covers staff insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'event-covers' AND private.can_manage_event_path(auth.uid(), name));
DROP POLICY IF EXISTS "event covers staff read" ON storage.objects;
CREATE POLICY "event covers staff read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'event-covers' AND private.can_manage_event_path(auth.uid(), name));
DROP POLICY IF EXISTS "event covers staff update" ON storage.objects;
CREATE POLICY "event covers staff update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'event-covers' AND private.can_manage_event_path(auth.uid(), name)) WITH CHECK (bucket_id = 'event-covers' AND private.can_manage_event_path(auth.uid(), name));

-- Point server-only RPCs at the private helpers
CREATE OR REPLACE FUNCTION public.cancel_event_srv(p_actor uuid, p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tickets int;
BEGIN
  IF p_actor IS NULL OR NOT private.can_manage_event(p_actor, p_event_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.events SET status = 'cancelled', updated_by = p_actor WHERE id = p_event_id;
  UPDATE public.ticket_batches SET active = false WHERE event_id = p_event_id;
  WITH upd AS (
    UPDATE public.tickets SET status = 'cancelled'
    WHERE event_id = p_event_id AND status = 'valid' RETURNING 1
  ) SELECT count(*) INTO v_tickets FROM upd;
  RETURN jsonb_build_object('ok', true, 'tickets_cancelled', v_tickets);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_ticket_srv(p_actor uuid, p_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT private.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  END IF;
  IF v_ticket.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  UPDATE public.tickets SET status = 'cancelled' WHERE id = p_ticket_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.check_in_ticket_srv(p_actor uuid, p_code uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.code = p_code FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT private.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in',
      'checked_in_at', v_ticket.checked_in_at, 'holder_name', v_ticket.holder_name,
      'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
  END IF;
  IF v_ticket.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'cancelled'); END IF;
  UPDATE public.tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = p_actor
    WHERE id = v_ticket.id;
  RETURN jsonb_build_object('ok', true, 'holder_name', v_ticket.holder_name,
    'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
END $$;

CREATE OR REPLACE FUNCTION public.check_in_ticket_token_srv(p_actor uuid, p_token text, p_event_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.secure_token = trim(p_token) FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT private.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_event_id IS NOT NULL AND v_ticket.event_id <> p_event_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_event');
  END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in',
      'checked_in_at', v_ticket.checked_in_at, 'holder_name', v_ticket.holder_name,
      'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
  END IF;
  IF v_ticket.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_ticket.status::text);
  END IF;
  UPDATE public.tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = p_actor
    WHERE id = v_ticket.id;
  RETURN jsonb_build_object('ok', true, 'holder_name', v_ticket.holder_name,
    'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
END $$;

CREATE OR REPLACE FUNCTION public.choose_account_type_srv(p_actor uuid, p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role public.app_role;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_type NOT IN ('participante','produtor') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF private.is_moderator_or_admin(p_actor) THEN
    INSERT INTO public.profiles (id, account_type_chosen) VALUES (p_actor, true)
      ON CONFLICT (id) DO UPDATE SET account_type_chosen = true;
    RETURN;
  END IF;
  v_role := CASE WHEN p_type = 'produtor' THEN 'organizer'::public.app_role ELSE 'user'::public.app_role END;
  DELETE FROM public.user_roles WHERE user_id = p_actor AND role IN ('user','organizer') AND role <> v_role;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_actor, v_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, account_type_chosen) VALUES (p_actor, true)
    ON CONFLICT (id) DO UPDATE SET account_type_chosen = true;
END $$;

CREATE OR REPLACE FUNCTION public.issue_courtesy_tickets_srv(p_actor uuid, p_event_id uuid, p_user_id uuid, p_batch_id uuid, p_quantity integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_batch RECORD; v_event RECORD; v_order_id uuid; v_item_id uuid;
  v_name text; v_email text; v_available int; i int;
BEGIN
  IF p_actor IS NULL OR NOT private.is_admin(p_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  SELECT * INTO v_batch FROM public.ticket_batches WHERE id = p_batch_id AND event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  v_available := v_batch.quantity - v_batch.sold - v_batch.reserved;
  IF p_quantity > v_available THEN RAISE EXCEPTION 'sold_out'; END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = p_user_id;
  UPDATE public.ticket_batches SET sold = sold + p_quantity WHERE id = p_batch_id;
  INSERT INTO public.orders (user_id, event_id, status, buyer_name, buyer_email, commission_rate,
                             subtotal_cents, discount_cents, fee_cents, total_cents, currency, paid_at, is_courtesy)
  VALUES (p_user_id, p_event_id, 'paid', COALESCE(v_name, v_email), v_email, 0, 0, 0, 0, 0, 'BRL', now(), true)
  RETURNING id INTO v_order_id;
  INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price_cents, base_price_cents,
                                  fee_cents, ticket_name_snapshot, total_cents)
  VALUES (v_order_id, p_batch_id, p_quantity, 0, 0, 0, v_batch.name || ' (cortesia)', 0)
  RETURNING id INTO v_item_id;
  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.tickets (order_id, order_item_id, batch_id, event_id, owner_user_id, holder_name, holder_email)
    VALUES (v_order_id, v_item_id, p_batch_id, p_event_id, p_user_id, COALESCE(v_name, v_email), v_email);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'quantity', p_quantity, 'email', v_email);
END $$;

CREATE OR REPLACE FUNCTION public.issue_external_paid_tickets_srv(p_actor uuid, p_event_id uuid, p_user_id uuid, p_batch_id uuid, p_quantity integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_batch RECORD; v_event RECORD; v_order_id uuid; v_item_id uuid;
  v_name text; v_email text; v_confirmed timestamptz; v_available int; i int;
  v_unit int; v_total int;
BEGIN
  IF p_actor IS NULL OR NOT private.is_admin(p_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
  SELECT * INTO v_batch FROM public.ticket_batches WHERE id = p_batch_id AND event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  v_available := v_batch.quantity - v_batch.sold - v_batch.reserved;
  IF p_quantity > v_available THEN RAISE EXCEPTION 'sold_out'; END IF;
  SELECT u.email, u.email_confirmed_at INTO v_email, v_confirmed FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_confirmed IS NULL THEN RAISE EXCEPTION 'email_not_verified'; END IF;
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = p_user_id;

  v_unit := v_batch.price_cents;
  v_total := v_unit * p_quantity;

  UPDATE public.ticket_batches SET sold = sold + p_quantity WHERE id = p_batch_id;
  INSERT INTO public.orders (user_id, event_id, status, buyer_name, buyer_email, commission_rate,
                             subtotal_cents, discount_cents, fee_cents, total_cents, currency, paid_at, is_courtesy)
  VALUES (p_user_id, p_event_id, 'paid', COALESCE(v_name, v_email), v_email, 0, v_total, 0, 0, v_total, 'BRL', now(), false)
  RETURNING id INTO v_order_id;
  INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price_cents, base_price_cents,
                                  fee_cents, ticket_name_snapshot, total_cents)
  VALUES (v_order_id, p_batch_id, p_quantity, v_unit, v_unit, 0, v_batch.name || ' (pago externamente)', v_total)
  RETURNING id INTO v_item_id;
  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.tickets (order_id, order_item_id, batch_id, event_id, owner_user_id, holder_name, holder_email)
    VALUES (v_order_id, v_item_id, p_batch_id, p_event_id, p_user_id, COALESCE(v_name, v_email), v_email);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'quantity', p_quantity, 'email', v_email, 'total_cents', v_total);
END $$;

-- Remove the client-callable copies from the exposed schema
DROP FUNCTION IF EXISTS public.can_manage_event_path(uuid, text);
DROP FUNCTION IF EXISTS public.can_manage_event(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.is_moderator_or_admin(uuid);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
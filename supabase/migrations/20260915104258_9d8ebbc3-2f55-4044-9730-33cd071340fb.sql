-- Move privileged RPCs behind server-only entry points: the actor is verified in
-- the TanStack server function and passed explicitly; only service_role may execute.

CREATE OR REPLACE FUNCTION public.choose_account_type_srv(p_actor uuid, p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_role public.app_role;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_type NOT IN ('participante','produtor') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF public.is_moderator_or_admin(p_actor) THEN
    INSERT INTO public.profiles (id, account_type_chosen) VALUES (p_actor, true)
      ON CONFLICT (id) DO UPDATE SET account_type_chosen = true;
    RETURN;
  END IF;
  v_role := CASE WHEN p_type = 'produtor' THEN 'organizer'::public.app_role ELSE 'user'::public.app_role END;
  DELETE FROM public.user_roles WHERE user_id = p_actor AND role IN ('user','organizer') AND role <> v_role;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_actor, v_role) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, account_type_chosen) VALUES (p_actor, true)
    ON CONFLICT (id) DO UPDATE SET account_type_chosen = true;
END $function$;

CREATE OR REPLACE FUNCTION public.check_in_ticket_srv(p_actor uuid, p_code uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.code = p_code FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.check_in_ticket_token_srv(p_actor uuid, p_token text, p_event_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.secure_token = trim(p_token) FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_event_srv(p_actor uuid, p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_tickets int;
BEGIN
  IF p_actor IS NULL OR NOT public.can_manage_event(p_actor, p_event_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.events SET status = 'cancelled', updated_by = p_actor WHERE id = p_event_id;
  UPDATE public.ticket_batches SET active = false WHERE event_id = p_event_id;
  WITH upd AS (
    UPDATE public.tickets SET status = 'cancelled'
    WHERE event_id = p_event_id AND status = 'valid' RETURNING 1
  ) SELECT count(*) INTO v_tickets FROM upd;
  RETURN jsonb_build_object('ok', true, 'tickets_cancelled', v_tickets);
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_ticket_srv(p_actor uuid, p_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  END IF;
  IF v_ticket.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  UPDATE public.tickets SET status = 'cancelled' WHERE id = p_ticket_id;
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.issue_courtesy_tickets_srv(p_actor uuid, p_event_id uuid, p_user_id uuid, p_batch_id uuid, p_quantity integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_batch RECORD; v_event RECORD; v_order_id uuid; v_item_id uuid;
  v_name text; v_email text; v_available int; i int;
BEGIN
  IF p_actor IS NULL OR NOT public.is_admin(p_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
END $function$;

-- server-only grants
REVOKE ALL ON FUNCTION public.choose_account_type_srv(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_in_ticket_srv(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_in_ticket_token_srv(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_event_srv(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_ticket_srv(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_courtesy_tickets_srv(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.choose_account_type_srv(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_in_ticket_srv(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_in_ticket_token_srv(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event_srv(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_ticket_srv(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_courtesy_tickets_srv(uuid, uuid, uuid, uuid, integer) TO service_role;

-- remove the client-callable versions
DROP FUNCTION IF EXISTS public.choose_account_type(text);
DROP FUNCTION IF EXISTS public.check_in_ticket(uuid);
DROP FUNCTION IF EXISTS public.check_in_ticket_token(text, uuid);
DROP FUNCTION IF EXISTS public.cancel_event(uuid);
DROP FUNCTION IF EXISTS public.cancel_ticket(uuid);
DROP FUNCTION IF EXISTS public.issue_courtesy_tickets(uuid, uuid, uuid, integer);
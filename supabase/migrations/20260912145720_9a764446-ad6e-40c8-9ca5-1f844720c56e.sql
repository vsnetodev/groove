ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_courtesy boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cancel_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_tickets int;
BEGIN
  IF v_user IS NULL OR NOT public.can_manage_event(v_user, p_event_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.events SET status = 'cancelled', updated_by = v_user WHERE id = p_event_id;
  UPDATE public.ticket_batches SET active = false WHERE event_id = p_event_id;

  WITH upd AS (
    UPDATE public.tickets SET status = 'cancelled'
    WHERE event_id = p_event_id AND status = 'valid'
    RETURNING 1
  ) SELECT count(*) INTO v_tickets FROM upd;

  RETURN jsonb_build_object('ok', true, 'tickets_cancelled', v_tickets);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_ticket RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.can_manage_event(v_user, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  END IF;
  IF v_ticket.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  UPDATE public.tickets SET status = 'cancelled' WHERE id = p_ticket_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.issue_courtesy_tickets(
  p_event_id uuid,
  p_user_id uuid,
  p_batch_id uuid,
  p_quantity int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch RECORD;
  v_event RECORD;
  v_order_id uuid;
  v_item_id uuid;
  v_name text;
  v_email text;
  v_available int;
  i int;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;

  SELECT * INTO v_batch FROM public.ticket_batches
    WHERE id = p_batch_id AND event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;

  v_available := v_batch.quantity - v_batch.sold - v_batch.reserved;
  IF p_quantity > v_available THEN RAISE EXCEPTION 'sold_out'; END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = p_user_id;

  UPDATE public.ticket_batches SET sold = sold + p_quantity WHERE id = p_batch_id;

  INSERT INTO public.orders (user_id, event_id, status, buyer_name, buyer_email, commission_rate,
                             subtotal_cents, discount_cents, fee_cents, total_cents, currency,
                             paid_at, is_courtesy)
  VALUES (p_user_id, p_event_id, 'paid', COALESCE(v_name, v_email), v_email, 0,
          0, 0, 0, 0, 'BRL', now(), true)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price_cents, base_price_cents,
                                  fee_cents, ticket_name_snapshot, total_cents)
  VALUES (v_order_id, p_batch_id, p_quantity, 0, 0, 0, v_batch.name || ' (cortesia)', 0)
  RETURNING id INTO v_item_id;

  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.tickets (order_id, order_item_id, batch_id, event_id, owner_user_id,
                                holder_name, holder_email)
    VALUES (v_order_id, v_item_id, p_batch_id, p_event_id, p_user_id,
            COALESCE(v_name, v_email), v_email);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'quantity', p_quantity, 'email', v_email);
END $$;

REVOKE ALL ON FUNCTION public.cancel_event(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_ticket(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.issue_courtesy_tickets(uuid, uuid, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_courtesy_tickets(uuid, uuid, uuid, int) TO authenticated;
CREATE OR REPLACE FUNCTION public.issue_external_paid_tickets_srv(p_actor uuid, p_event_id uuid, p_user_id uuid, p_batch_id uuid, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch RECORD; v_event RECORD; v_order_id uuid; v_item_id uuid;
  v_name text; v_email text; v_confirmed timestamptz; v_available int; i int;
  v_unit int; v_total int;
BEGIN
  IF p_actor IS NULL OR NOT public.is_admin(p_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
END $function$;

REVOKE ALL ON FUNCTION public.issue_external_paid_tickets_srv(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_external_paid_tickets_srv(uuid, uuid, uuid, uuid, integer) TO service_role;
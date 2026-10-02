BEGIN;
CREATE OR REPLACE FUNCTION public.confirm_paid_order(p_order_id uuid, p_session_id text, p_payment_intent text, p_amount_total integer, p_currency text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_res RECORD;
  v_item RECORD;
  v_batch RECORD;
  i int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found'); END IF;

  IF p_amount_total IS NULL OR p_amount_total <> v_order.total_cents THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;
  IF p_currency IS NULL OR upper(p_currency) <> upper(v_order.currency) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
  END IF;
  IF v_order.stripe_checkout_session_id IS NOT NULL AND
     v_order.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_mismatch');
  END IF;

  IF v_order.status = 'paid' THEN
    -- Reparo: pedido pago sem ingressos gerados.
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE order_id = p_order_id) THEN
      FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
        FOR i IN 1..v_item.quantity LOOP
          INSERT INTO public.tickets (order_id, order_item_id, batch_id, event_id, owner_user_id, holder_name, holder_email)
          VALUES (p_order_id, v_item.id, v_item.batch_id, v_order.event_id, v_order.user_id, v_order.buyer_name, v_order.buyer_email);
        END LOOP;
      END LOOP;
      RETURN jsonb_build_object('ok', true, 'already', true, 'repaired', true);
    END IF;
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF v_order.status IN ('refunded','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_' || v_order.status);
  END IF;
  -- Lock batches in deterministic order; late payments must reacquire released stock.
  FOR v_item IN SELECT batch_id, SUM(quantity)::int AS quantity FROM public.order_items
    WHERE order_id = p_order_id GROUP BY batch_id ORDER BY batch_id LOOP
    SELECT * INTO v_batch FROM public.ticket_batches WHERE id = v_item.batch_id FOR UPDATE;
    SELECT COALESCE(SUM(quantity),0)::int AS quantity INTO v_res FROM public.ticket_reservations
      WHERE order_id = p_order_id AND batch_id = v_item.batch_id AND status = 'held';
    IF v_batch.quantity - v_batch.sold - v_batch.reserved + v_res.quantity < v_item.quantity THEN
      RAISE EXCEPTION 'late_payment_requires_manual_refund';
    END IF;
    UPDATE public.ticket_batches SET reserved = GREATEST(reserved - v_res.quantity, 0),
      sold = sold + v_item.quantity WHERE id = v_item.batch_id;
    UPDATE public.ticket_reservations SET status = 'converted'
      WHERE order_id = p_order_id AND batch_id = v_item.batch_id AND status IN ('held','released');
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE order_id = p_order_id) THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      FOR i IN 1..v_item.quantity LOOP
        INSERT INTO public.tickets (order_id, order_item_id, batch_id, event_id, owner_user_id, holder_name, holder_email)
        VALUES (p_order_id, v_item.id, v_item.batch_id, v_order.event_id, v_order.user_id, v_order.buyer_name, v_order.buyer_email);
      END LOOP;
    END LOOP;
  END IF;

  UPDATE public.orders SET
    status = 'paid',
    paid_at = COALESCE(paid_at, now()),
    stripe_checkout_session_id = COALESCE(p_session_id, stripe_checkout_session_id),
    stripe_payment_intent_id = COALESCE(p_payment_intent, stripe_payment_intent_id)
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;


REVOKE ALL ON FUNCTION public.confirm_paid_order(uuid,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_paid_order(uuid,text,text,integer,text) TO service_role;
COMMIT;

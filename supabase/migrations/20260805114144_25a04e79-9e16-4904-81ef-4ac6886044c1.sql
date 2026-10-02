-- 1. Enum extensions
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'refunded';

-- 2. Columns
ALTER TABLE public.ticket_batches
  ADD COLUMN IF NOT EXISTS reserved integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS buyer_document text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_uniq
  ON public.orders (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ticket_name_snapshot text,
  ADD COLUMN IF NOT EXISTS total_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id),
  ADD COLUMN IF NOT EXISTS secure_token text;

UPDATE public.tickets SET secure_token = encode(gen_random_bytes(32), 'hex') WHERE secure_token IS NULL;
ALTER TABLE public.tickets ALTER COLUMN secure_token SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN secure_token SET DEFAULT encode(gen_random_bytes(32), 'hex');
CREATE UNIQUE INDEX IF NOT EXISTS tickets_secure_token_uniq ON public.tickets (secure_token);

-- 3. Reservations
CREATE TABLE IF NOT EXISTS public.ticket_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.ticket_batches(id),
  quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'held',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ticket_reservations TO service_role;
ALTER TABLE public.ticket_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations owner read" ON public.ticket_reservations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- 4. Webhook idempotency log
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  order_id uuid,
  summary jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook events admin read" ON public.stripe_webhook_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 5. Reserve tickets + create pending order (server only)
CREATE OR REPLACE FUNCTION public.reserve_tickets(
  p_event_id uuid,
  p_items jsonb,
  p_user_id uuid,
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_buyer_document text,
  p_coupon_code text,
  p_hold_minutes integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_batch RECORD;
  v_qty int;
  v_available int;
  v_subtotal int := 0;
  v_fees int := 0;
  v_discount int := 0;
  v_rate numeric(5,2);
  v_unit_fee int;
  v_coupon RECORD;
  v_event RECORD;
  v_expires timestamptz := now() + make_interval(mins => GREATEST(p_hold_minutes, 5));
  v_lines jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR v_event.status <> 'published' THEN RAISE EXCEPTION 'event_not_available'; END IF;
  IF v_event.sales_start IS NOT NULL AND v_event.sales_start > now() THEN RAISE EXCEPTION 'sales_not_started'; END IF;
  IF v_event.sales_end IS NOT NULL AND v_event.sales_end < now() THEN RAISE EXCEPTION 'sales_closed'; END IF;

  SELECT commission_rate INTO v_rate FROM public.platform_settings WHERE id = 1;
  v_rate := COALESCE(v_rate, 0);

  INSERT INTO public.orders (user_id, event_id, status, buyer_name, buyer_email, buyer_phone, buyer_document,
                             commission_rate, currency, reservation_expires_at)
  VALUES (p_user_id, p_event_id, 'pending', p_buyer_name, p_buyer_email, p_buyer_phone, p_buyer_document,
          v_rate, 'BRL', v_expires)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT * INTO v_batch FROM public.ticket_batches
      WHERE id = (v_item->>'batch_id')::uuid AND event_id = p_event_id FOR UPDATE;
    IF NOT FOUND OR NOT v_batch.active THEN RAISE EXCEPTION 'batch_not_available'; END IF;
    IF v_batch.sales_end IS NOT NULL AND v_batch.sales_end < now() THEN RAISE EXCEPTION 'batch_closed'; END IF;
    IF v_batch.sales_start IS NOT NULL AND v_batch.sales_start > now() THEN RAISE EXCEPTION 'batch_not_started'; END IF;
    IF v_batch.max_per_order IS NOT NULL AND v_qty > v_batch.max_per_order THEN RAISE EXCEPTION 'max_per_order_exceeded'; END IF;

    v_available := v_batch.quantity - v_batch.sold - v_batch.reserved;
    IF v_qty > v_available THEN RAISE EXCEPTION 'sold_out'; END IF;

    UPDATE public.ticket_batches SET reserved = reserved + v_qty WHERE id = v_batch.id;

    INSERT INTO public.ticket_reservations (order_id, batch_id, quantity, expires_at)
    VALUES (v_order_id, v_batch.id, v_qty, v_expires);

    v_unit_fee := ROUND(v_batch.price_cents * v_rate / 100.0);

    INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price_cents, base_price_cents, fee_cents,
                                    ticket_name_snapshot, total_cents)
    VALUES (v_order_id, v_batch.id, v_qty, v_batch.price_cents + v_unit_fee, v_batch.price_cents, v_unit_fee * v_qty,
            v_batch.name, (v_batch.price_cents + v_unit_fee) * v_qty);

    v_subtotal := v_subtotal + v_batch.price_cents * v_qty;
    v_fees := v_fees + v_unit_fee * v_qty;

    v_lines := v_lines || jsonb_build_object(
      'name', v_batch.name,
      'quantity', v_qty,
      'unit_amount', v_batch.price_cents + v_unit_fee,
      'batch_id', v_batch.id
    );
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    SELECT * INTO v_coupon FROM public.coupons
      WHERE event_id = p_event_id AND upper(code) = upper(trim(p_coupon_code)) AND active = true FOR UPDATE;
    IF FOUND
      AND (v_coupon.max_uses IS NULL OR v_coupon.uses < v_coupon.max_uses)
      AND (v_coupon.expires_at IS NULL OR v_coupon.expires_at > now()) THEN
      IF v_coupon.discount_type = 'percent' THEN
        v_discount := (v_subtotal * v_coupon.discount_value) / 100;
      ELSE
        v_discount := LEAST(v_coupon.discount_value, v_subtotal);
      END IF;
      UPDATE public.coupons SET uses = uses + 1 WHERE id = v_coupon.id;
      UPDATE public.orders SET coupon_id = v_coupon.id WHERE id = v_order_id;
    END IF;
  END IF;

  UPDATE public.orders SET
    subtotal_cents = v_subtotal,
    discount_cents = v_discount,
    fee_cents = v_fees,
    total_cents = GREATEST(v_subtotal - v_discount, 0) + v_fees
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'fee_cents', v_fees,
    'total_cents', GREATEST(v_subtotal - v_discount, 0) + v_fees,
    'currency', 'BRL',
    'expires_at', v_expires,
    'lines', v_lines
  );
END $$;

-- 6. Confirm payment (idempotent) — converts reservation to sale and issues tickets
CREATE OR REPLACE FUNCTION public.confirm_paid_order(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent text,
  p_amount_total int,
  p_currency text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_res RECORD;
  v_item RECORD;
  i int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found'); END IF;
  IF v_order.status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_order.status IN ('refunded','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_' || v_order.status);
  END IF;
  IF p_amount_total IS NOT NULL AND p_amount_total <> v_order.total_cents THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;
  IF p_currency IS NOT NULL AND upper(p_currency) <> upper(v_order.currency) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
  END IF;

  FOR v_res IN SELECT * FROM public.ticket_reservations WHERE order_id = p_order_id AND status = 'held' FOR UPDATE LOOP
    UPDATE public.ticket_batches
      SET reserved = GREATEST(reserved - v_res.quantity, 0), sold = sold + v_res.quantity
      WHERE id = v_res.batch_id;
    UPDATE public.ticket_reservations SET status = 'converted' WHERE id = v_res.id;
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

-- 7. Release reservation (expired / failed / cancelled)
CREATE OR REPLACE FUNCTION public.release_order(p_order_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order RECORD; v_res RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found'); END IF;
  IF v_order.status <> 'pending' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF p_status NOT IN ('failed','expired','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  FOR v_res IN SELECT * FROM public.ticket_reservations WHERE order_id = p_order_id AND status = 'held' FOR UPDATE LOOP
    UPDATE public.ticket_batches SET reserved = GREATEST(reserved - v_res.quantity, 0) WHERE id = v_res.batch_id;
    UPDATE public.ticket_reservations SET status = 'released' WHERE id = v_res.id;
  END LOOP;

  UPDATE public.orders SET status = p_status::public.order_status, failure_reason = p_reason WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END $$;

-- 8. Refund
CREATE OR REPLACE FUNCTION public.refund_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tickets SET status = 'refunded' WHERE order_id = p_order_id AND status <> 'checked_in';
  UPDATE public.orders SET status = 'refunded' WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 9. Expire stale pending orders
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o RECORD; v_count int := 0;
BEGIN
  FOR v_o IN SELECT id FROM public.orders
    WHERE status = 'pending' AND reservation_expires_at IS NOT NULL AND reservation_expires_at < now()
  LOOP
    PERFORM public.release_order(v_o.id, 'expired', 'reservation_expired');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- 10. Server-only execution
REVOKE ALL ON FUNCTION public.reserve_tickets(uuid, jsonb, uuid, text, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_paid_order(uuid, text, text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tickets(uuid, jsonb, uuid, text, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_paid_order(uuid, text, text, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;

-- 11. Buyers must not mutate paid orders from the browser
DROP POLICY IF EXISTS "orders self update" ON public.orders;
CREATE POLICY "orders self cancel pending" ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status IN ('pending','cancelled'));

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
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));
  IF (SELECT count(*) FROM public.orders WHERE user_id=p_user_id AND status='pending') >= 5 THEN
    RAISE EXCEPTION 'too_many_pending_orders';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid_cart';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'batch_id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'duplicate_batch';
  END IF;
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY value->>'batch_id' LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 50 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

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


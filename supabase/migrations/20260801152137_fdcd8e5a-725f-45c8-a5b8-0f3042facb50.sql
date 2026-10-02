-- 1. Profiles: account type chosen flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type_chosen boolean NOT NULL DEFAULT false;

-- 2. Platform settings
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_rate numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_rate >= 0 AND commission_rate <= 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform settings public read" ON public.platform_settings;
CREATE POLICY "platform settings public read" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "platform settings admin update" ON public.platform_settings;
CREATE POLICY "platform settings admin update" ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER platform_settings_updated_at BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_settings (id, commission_rate) VALUES (1, 10)
  ON CONFLICT (id) DO NOTHING;

-- 3. Commission columns on orders / order_items
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS base_price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0;

UPDATE public.order_items SET base_price_cents = unit_price_cents WHERE base_price_cents = 0;

-- 4. Lock down user_roles writes at the grant level too
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

-- 5. Self-signup can never yield admin/moderator
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  chosen public.app_role;
  raw_type text := NEW.raw_user_meta_data->>'account_type';
BEGIN
  INSERT INTO public.profiles (id, full_name, account_type_chosen)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    raw_type IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  IF raw_type IN ('produtor','organizer','producer') THEN
    chosen := 'organizer';
  ELSE
    chosen := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;

-- 6. Purchase with commission snapshot
CREATE OR REPLACE FUNCTION public.purchase_tickets(p_event_id uuid, p_items jsonb, p_coupon_code text, p_buyer_name text, p_buyer_email text, p_buyer_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_order_id UUID;
  v_item JSONB;
  v_batch RECORD;
  v_qty INT;
  v_subtotal INT := 0;
  v_fees INT := 0;
  v_discount INT := 0;
  v_total INT := 0;
  v_rate NUMERIC(5,2);
  v_unit_fee INT;
  v_coupon RECORD;
  v_event RECORD;
  i INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR v_event.status <> 'published' THEN RAISE EXCEPTION 'event_not_available'; END IF;

  SELECT commission_rate INTO v_rate FROM public.platform_settings WHERE id = 1;
  v_rate := COALESCE(v_rate, 0);

  INSERT INTO public.orders (user_id, event_id, status, buyer_name, buyer_email, buyer_phone, commission_rate)
  VALUES (v_user, p_event_id, 'pending', p_buyer_name, p_buyer_email, p_buyer_phone, v_rate)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::INT;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT * INTO v_batch FROM public.ticket_batches
      WHERE id = (v_item->>'batch_id')::UUID AND event_id = p_event_id
      FOR UPDATE;
    IF NOT FOUND OR NOT v_batch.active THEN RAISE EXCEPTION 'batch_not_available'; END IF;
    IF v_batch.sales_end IS NOT NULL AND v_batch.sales_end < now() THEN RAISE EXCEPTION 'batch_closed'; END IF;
    IF v_batch.sales_start IS NOT NULL AND v_batch.sales_start > now() THEN RAISE EXCEPTION 'batch_not_started'; END IF;
    IF v_batch.sold + v_qty > v_batch.quantity THEN RAISE EXCEPTION 'sold_out'; END IF;

    UPDATE public.ticket_batches SET sold = sold + v_qty WHERE id = v_batch.id;

    v_unit_fee := ROUND(v_batch.price_cents * v_rate / 100.0);

    INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price_cents, base_price_cents, fee_cents)
    VALUES (v_order_id, v_batch.id, v_qty, v_batch.price_cents + v_unit_fee, v_batch.price_cents, v_unit_fee * v_qty);

    v_subtotal := v_subtotal + v_batch.price_cents * v_qty;
    v_fees := v_fees + v_unit_fee * v_qty;

    FOR i IN 1..v_qty LOOP
      INSERT INTO public.tickets (order_id, batch_id, event_id, owner_user_id, holder_name, holder_email)
      VALUES (v_order_id, v_batch.id, p_event_id, v_user, p_buyer_name, p_buyer_email);
    END LOOP;
  END LOOP;

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    SELECT * INTO v_coupon FROM public.coupons
      WHERE event_id = p_event_id AND upper(code) = upper(p_coupon_code) AND active = true
      FOR UPDATE;
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

  v_total := GREATEST(v_subtotal - v_discount, 0) + v_fees;

  UPDATE public.orders SET
    subtotal_cents = v_subtotal,
    discount_cents = v_discount,
    fee_cents = v_fees,
    total_cents = v_total,
    status = 'paid',
    paid_at = now()
  WHERE id = v_order_id;

  RETURN v_order_id;
END $function$;

-- 7. Choose account type on first social login (self-service, restricted roles)
CREATE OR REPLACE FUNCTION public.choose_account_type(p_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_chosen boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_type NOT IN ('participante','produtor') THEN RAISE EXCEPTION 'invalid_type'; END IF;

  SELECT account_type_chosen INTO v_chosen FROM public.profiles WHERE id = v_user;
  IF COALESCE(v_chosen, false) THEN RAISE EXCEPTION 'already_chosen'; END IF;

  -- never allow escalation: an existing admin/moderator keeps their role
  IF public.is_moderator_or_admin(v_user) THEN
    UPDATE public.profiles SET account_type_chosen = true WHERE id = v_user;
    RETURN;
  END IF;

  v_role := CASE WHEN p_type = 'produtor' THEN 'organizer'::public.app_role ELSE 'user'::public.app_role END;

  DELETE FROM public.user_roles WHERE user_id = v_user AND role IN ('user','organizer');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, v_role) ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, account_type_chosen) VALUES (v_user, true)
    ON CONFLICT (id) DO UPDATE SET account_type_chosen = true;
END $function$;

REVOKE EXECUTE ON FUNCTION public.choose_account_type(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_account_type(text) TO authenticated;

-- existing users already have a defined role
UPDATE public.profiles SET account_type_chosen = true WHERE account_type_chosen = false;
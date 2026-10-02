
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'user');
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'ended', 'cancelled');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'cancelled', 'refunded');
CREATE TYPE public.ticket_status AS ENUM ('valid', 'checked_in', 'cancelled');
CREATE TYPE public.discount_type AS ENUM ('percent', 'fixed');

-- =========================================================
-- updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- USER ROLES
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','organizer'));
$$;

-- Staff can read all roles
CREATE POLICY "roles staff read" ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles admin write" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- Handle new user: create profile + first user becomes admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- EVENTS
-- =========================================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  cover_url TEXT,
  venue TEXT,
  city TEXT,
  address TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status public.event_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events public read published" ON public.events FOR SELECT TO anon, authenticated
USING (status = 'published' OR status = 'ended');
CREATE POLICY "events staff read all" ON public.events FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
CREATE POLICY "events staff write" ON public.events FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- TICKET BATCHES
-- =========================================================
CREATE TABLE public.ticket_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  quantity INT NOT NULL CHECK (quantity > 0),
  sold INT NOT NULL DEFAULT 0 CHECK (sold >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  sales_start TIMESTAMPTZ,
  sales_end TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ticket_batches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_batches TO authenticated;
GRANT ALL ON public.ticket_batches TO service_role;
ALTER TABLE public.ticket_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches public read" ON public.ticket_batches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "batches staff write" ON public.ticket_batches FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER batches_updated BEFORE UPDATE ON public.ticket_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ON public.ticket_batches (event_id, sort_order);

-- =========================================================
-- COUPONS
-- =========================================================
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type public.discount_type NOT NULL,
  discount_value INT NOT NULL CHECK (discount_value > 0),
  max_uses INT,
  uses INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons staff all" ON public.coupons FOR ALL TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'pending',
  subtotal_cents INT NOT NULL DEFAULT 0,
  discount_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  coupon_id UUID REFERENCES public.coupons(id),
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders self read" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "orders staff read" ON public.orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "orders self insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders self update" ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ON public.orders (user_id, created_at DESC);

-- =========================================================
-- ORDER ITEMS
-- =========================================================
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.ticket_batches(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items via order self" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "items staff read" ON public.order_items FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));
CREATE POLICY "items insert self" ON public.order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- =========================================================
-- TICKETS
-- =========================================================
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.ticket_batches(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_name TEXT,
  holder_email TEXT,
  status public.ticket_status NOT NULL DEFAULT 'valid',
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets self read" ON public.tickets FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY "tickets staff read" ON public.tickets FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "tickets staff update" ON public.tickets FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "tickets insert self" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
CREATE INDEX ON public.tickets (owner_user_id, created_at DESC);
CREATE INDEX ON public.tickets (event_id);

-- =========================================================
-- Purchase RPC: atomic checkout
-- items: [{batch_id, quantity}]
-- =========================================================
CREATE OR REPLACE FUNCTION public.purchase_tickets(
  p_event_id UUID,
  p_items JSONB,
  p_coupon_code TEXT,
  p_buyer_name TEXT,
  p_buyer_email TEXT,
  p_buyer_phone TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_order_id UUID;
  v_item JSONB;
  v_batch RECORD;
  v_qty INT;
  v_subtotal INT := 0;
  v_discount INT := 0;
  v_total INT := 0;
  v_coupon RECORD;
  v_event RECORD;
  i INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR v_event.status <> 'published' THEN RAISE EXCEPTION 'event_not_available'; END IF;

  -- Create pending order
  INSERT INTO public.orders (user_id, event_id, status, buyer_name, buyer_email, buyer_phone)
  VALUES (v_user, p_event_id, 'pending', p_buyer_name, p_buyer_email, p_buyer_phone)
  RETURNING id INTO v_order_id;

  -- Iterate items, lock batches, reserve stock
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

    INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price_cents)
    VALUES (v_order_id, v_batch.id, v_qty, v_batch.price_cents);

    v_subtotal := v_subtotal + v_batch.price_cents * v_qty;

    -- Create tickets
    FOR i IN 1..v_qty LOOP
      INSERT INTO public.tickets (order_id, batch_id, event_id, owner_user_id, holder_name, holder_email)
      VALUES (v_order_id, v_batch.id, p_event_id, v_user, p_buyer_name, p_buyer_email);
    END LOOP;
  END LOOP;

  -- Apply coupon
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

  v_total := GREATEST(v_subtotal - v_discount, 0);

  -- Simulated payment: mark paid immediately
  UPDATE public.orders SET
    subtotal_cents = v_subtotal,
    discount_cents = v_discount,
    total_cents = v_total,
    status = 'paid',
    paid_at = now()
  WHERE id = v_order_id;

  RETURN v_order_id;
END $$;

GRANT EXECUTE ON FUNCTION public.purchase_tickets(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =========================================================
-- Check-in RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_code UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ticket RECORD; v_user UUID := auth.uid();
BEGIN
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name
    INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.code = p_code
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
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
GRANT EXECUTE ON FUNCTION public.check_in_ticket(UUID) TO authenticated;

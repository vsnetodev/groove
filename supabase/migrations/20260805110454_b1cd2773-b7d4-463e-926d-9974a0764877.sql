-- 1. Novos campos de evento
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS sales_start timestamptz,
  ADD COLUMN IF NOT EXISTS sales_end timestamptz,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS capacity integer,
  ADD COLUMN IF NOT EXISTS age_rating text,
  ADD COLUMN IF NOT EXISTS organizer_name text,
  ADD COLUMN IF NOT EXISTS organizer_contact text,
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$ BEGIN
  ALTER TABLE public.events ADD CONSTRAINT events_format_check
    CHECK (format IN ('presencial','online','hibrido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.events ADD CONSTRAINT events_capacity_check
    CHECK (capacity IS NULL OR capacity > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.events ADD CONSTRAINT events_dates_check
    CHECK (ends_at IS NULL OR ends_at >= starts_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS events_slug_key ON public.events (slug);
CREATE INDEX IF NOT EXISTS events_status_starts_idx ON public.events (status, starts_at);
CREATE INDEX IF NOT EXISTS events_created_by_idx ON public.events (created_by);

-- 2. Lotes
ALTER TABLE public.ticket_batches
  ADD COLUMN IF NOT EXISTS max_per_order integer;

DO $$ BEGIN
  ALTER TABLE public.ticket_batches ADD CONSTRAINT batches_positive_check
    CHECK (price_cents >= 0 AND quantity >= 0 AND (max_per_order IS NULL OR max_per_order > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ticket_batches_event_idx ON public.ticket_batches (event_id, sort_order);
CREATE INDEX IF NOT EXISTS tickets_event_idx ON public.tickets (event_id);
CREATE INDEX IF NOT EXISTS orders_event_status_idx ON public.orders (event_id, status);

-- 3. Configurações de pagamento (sem credenciais)
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id integer PRIMARY KEY DEFAULT 1,
  provider text NOT NULL DEFAULT 'stripe',
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  currency text NOT NULL DEFAULT 'BRL',
  platform_fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  fixed_fee_cents integer NOT NULL DEFAULT 0,
  payout_delay_days integer NOT NULL DEFAULT 0,
  last_validated_at timestamptz,
  last_status text,
  last_error text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_settings_singleton CHECK (id = 1),
  CONSTRAINT payment_settings_provider_check CHECK (provider IN ('stripe','mercadopago')),
  CONSTRAINT payment_settings_env_check CHECK (environment IN ('sandbox','live')),
  CONSTRAINT payment_settings_fees_check CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 50 AND fixed_fee_cents >= 0 AND payout_delay_days >= 0)
);

GRANT SELECT, UPDATE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment settings admin read" ON public.payment_settings;
CREATE POLICY "payment settings admin read" ON public.payment_settings
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "payment settings admin update" ON public.payment_settings;
CREATE POLICY "payment settings admin update" ON public.payment_settings
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS payment_settings_updated ON public.payment_settings;
CREATE TRIGGER payment_settings_updated BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. Storage: capas de eventos
CREATE OR REPLACE FUNCTION public.can_manage_event_path(_user_id uuid, _path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN
    v_id := (string_to_array(_path, '/'))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.can_manage_event(_user_id, v_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.can_manage_event_path(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event_path(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "event covers public read" ON storage.objects;
CREATE POLICY "event covers public read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'event-covers');

DROP POLICY IF EXISTS "event covers staff insert" ON storage.objects;
CREATE POLICY "event covers staff insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-covers' AND public.can_manage_event_path(auth.uid(), name));

DROP POLICY IF EXISTS "event covers staff update" ON storage.objects;
CREATE POLICY "event covers staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'event-covers' AND public.can_manage_event_path(auth.uid(), name))
  WITH CHECK (bucket_id = 'event-covers' AND public.can_manage_event_path(auth.uid(), name));

DROP POLICY IF EXISTS "event covers staff delete" ON storage.objects;
CREATE POLICY "event covers staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-covers' AND public.can_manage_event_path(auth.uid(), name));
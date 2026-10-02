-- 1. ticket_batches: only public for published/ended events
DROP POLICY IF EXISTS "batches public read" ON public.ticket_batches;
CREATE POLICY "batches public read published"
ON public.ticket_batches FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = ticket_batches.event_id
    AND e.status IN ('published'::event_status, 'ended'::event_status)
));

-- 2. coupons: explicit manager-only SELECT policy
DROP POLICY IF EXISTS "coupons manage" ON public.coupons;
CREATE POLICY "coupons staff select" ON public.coupons FOR SELECT TO authenticated
USING (public.can_manage_event(auth.uid(), event_id));
CREATE POLICY "coupons staff insert" ON public.coupons FOR INSERT TO authenticated
WITH CHECK (public.can_manage_event(auth.uid(), event_id));
CREATE POLICY "coupons staff update" ON public.coupons FOR UPDATE TO authenticated
USING (public.can_manage_event(auth.uid(), event_id))
WITH CHECK (public.can_manage_event(auth.uid(), event_id));
CREATE POLICY "coupons staff delete" ON public.coupons FOR DELETE TO authenticated
USING (public.can_manage_event(auth.uid(), event_id));

-- 3. Safe coupon validation for buyers (exact code only, no enumeration)
CREATE OR REPLACE FUNCTION public.validate_coupon(p_event_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_c RECORD;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_c FROM public.coupons c
    JOIN public.events e ON e.id = c.event_id
    WHERE c.event_id = p_event_id
      AND upper(c.code) = upper(trim(p_code))
      AND e.status = 'published'::event_status;
  IF NOT FOUND OR NOT v_c.active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_c.max_uses IS NOT NULL AND v_c.uses >= v_c.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;
  IF v_c.expires_at IS NOT NULL AND v_c.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', v_c.code,
    'discount_type', v_c.discount_type, 'discount_value', v_c.discount_value);
END $$;

REVOKE ALL ON FUNCTION public.validate_coupon(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(uuid, text) TO anon, authenticated;

-- 4. Lock down internal SECURITY DEFINER helpers from direct API calls
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_moderator_or_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_event(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- keep the intended user-facing RPCs callable by signed-in users only
REVOKE ALL ON FUNCTION public.purchase_tickets(uuid, jsonb, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_tickets(uuid, jsonb, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.check_in_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid) TO authenticated;
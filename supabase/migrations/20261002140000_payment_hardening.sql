-- Apply after all original migrations. No payment credentials belong in SQL.
BEGIN;

-- Browser clients may read allowed rows, but financial mutations are server-only.
REVOKE INSERT, UPDATE, DELETE ON public.orders, public.order_items, public.tickets FROM anon, authenticated;

-- A receipt and its mutation are committed together. A transient error rolls back
-- both, allowing provider retries. Advisory lock also serializes duplicate delivery.
CREATE OR REPLACE FUNCTION public.apply_payment_event_srv(
  p_key text, p_type text, p_order_id uuid, p_action text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'invalid_event_key'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  IF EXISTS (SELECT 1 FROM public.stripe_webhook_events
    WHERE stripe_event_id = p_key AND summary->>'processed' = 'true') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF p_action <> 'ignore' AND p_order_id IS NULL THEN RAISE EXCEPTION 'missing_order'; END IF;
  CASE p_action
    WHEN 'confirm' THEN
      IF p_payload->>'amount_total' IS NULL OR p_payload->>'currency' IS NULL
         OR p_payload->>'session_id' IS NULL OR p_payload->>'payment_intent' IS NULL THEN
        RAISE EXCEPTION 'incomplete_payment';
      END IF;
      v_result := public.confirm_paid_order(p_order_id, p_payload->>'session_id',
        p_payload->>'payment_intent', (p_payload->>'amount_total')::int, p_payload->>'currency');
    WHEN 'release' THEN
      v_result := public.release_order(p_order_id, p_payload->>'status', p_payload->>'reason');
    WHEN 'refund' THEN v_result := public.refund_order(p_order_id);
    WHEN 'ignore' THEN v_result := jsonb_build_object('ok', true, 'ignored', true);
    ELSE RAISE EXCEPTION 'invalid_payment_action';
  END CASE;
  IF COALESCE((v_result->>'ok')::boolean, false) = false THEN
    RAISE EXCEPTION 'payment_rejected: %', v_result->>'reason';
  END IF;
  INSERT INTO public.stripe_webhook_events(stripe_event_id, event_type, order_id, summary)
    VALUES (p_key, p_type, p_order_id, jsonb_build_object('processed', true, 'action', p_action, 'result', v_result))
    ON CONFLICT(stripe_event_id) DO UPDATE SET summary = EXCLUDED.summary,
      order_id = EXCLUDED.order_id, processed_at = now();
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.apply_payment_event_srv(text,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_event_srv(text,text,uuid,text,jsonb) TO service_role;

-- Role replacement must not leave the account without a role on insert failure.
CREATE OR REPLACE FUNCTION public.set_user_role_srv(p_actor uuid, p_user_id uuid, p_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_actor IS NULL OR NOT private.is_admin(p_actor) OR p_actor = p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, p_role);
END $$;
REVOKE ALL ON FUNCTION public.set_user_role_srv(uuid,uuid,public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role_srv(uuid,uuid,public.app_role) TO service_role;

COMMIT;

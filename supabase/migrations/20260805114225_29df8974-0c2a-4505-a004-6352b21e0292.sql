CREATE OR REPLACE FUNCTION public.check_in_ticket_token(p_token text, p_event_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ticket RECORD; v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name
    INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.secure_token = trim(p_token)
    FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.can_manage_event(v_user, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_event_id IS NOT NULL AND v_ticket.event_id <> p_event_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_event');
  END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in',
      'checked_in_at', v_ticket.checked_in_at, 'holder_name', v_ticket.holder_name,
      'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
  END IF;
  IF v_ticket.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_ticket.status::text);
  END IF;
  UPDATE public.tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = v_user
    WHERE id = v_ticket.id;
  RETURN jsonb_build_object('ok', true, 'holder_name', v_ticket.holder_name,
    'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
END $$;

REVOKE ALL ON FUNCTION public.check_in_ticket_token(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket_token(text, uuid) TO authenticated, service_role;
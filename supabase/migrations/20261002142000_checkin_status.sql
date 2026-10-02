CREATE OR REPLACE FUNCTION public.check_in_ticket_srv(p_actor uuid, p_code uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ticket RECORD;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT t.*, e.title AS event_title, b.name AS batch_name INTO v_ticket
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE t.code = p_code FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT private.can_manage_event(p_actor, v_ticket.event_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ticket.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_checked_in',
      'checked_in_at', v_ticket.checked_in_at, 'holder_name', v_ticket.holder_name,
      'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
  END IF;
  IF v_ticket.status IN ('cancelled','refunded') THEN RETURN jsonb_build_object('ok', false, 'reason', v_ticket.status::text); END IF;
  UPDATE public.tickets SET status = 'checked_in', checked_in_at = now(), checked_in_by = p_actor
    WHERE id = v_ticket.id;
  RETURN jsonb_build_object('ok', true, 'holder_name', v_ticket.holder_name,
    'event_title', v_ticket.event_title, 'batch_name', v_ticket.batch_name);
END $$;


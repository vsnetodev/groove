CREATE OR REPLACE FUNCTION public.admin_refund_order_srv(p_actor uuid, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; n int;
BEGIN
  IF NOT private.is_admin(p_actor) THEN RETURN jsonb_build_object('ok',false,'reason','forbidden'); END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF o.status <> 'paid' THEN RETURN jsonb_build_object('ok',false,'reason','not_paid'); END IF;
  IF EXISTS (SELECT 1 FROM public.tickets WHERE order_id = p_order_id AND status = 'checked_in') THEN
    RETURN jsonb_build_object('ok',false,'reason','already_checked_in'); END IF;
  UPDATE public.tickets SET status = 'refunded' WHERE order_id = p_order_id AND status = 'valid';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.ticket_batches b SET sold = GREATEST(0, b.sold - oi.quantity)
    FROM public.order_items oi WHERE oi.order_id = p_order_id AND oi.batch_id = b.id;
  UPDATE public.orders SET status = 'refunded', failure_reason = 'manual_refund', updated_at = now() WHERE id = p_order_id;
  RETURN jsonb_build_object('ok',true,'tickets_cancelled',n,'total_cents',o.total_cents);
END $$;
REVOKE ALL ON FUNCTION public.admin_refund_order_srv(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order_srv(uuid,uuid) TO service_role;
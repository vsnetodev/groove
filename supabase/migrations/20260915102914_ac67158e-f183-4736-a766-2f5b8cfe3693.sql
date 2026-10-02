DROP POLICY IF EXISTS "event covers public read" ON storage.objects;

CREATE POLICY "event covers public read published"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'event-covers'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.cover_path = storage.objects.name
      AND e.status IN ('published'::public.event_status, 'ended'::public.event_status)
  )
);

CREATE POLICY "event covers staff read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'event-covers'
  AND public.can_manage_event_path(auth.uid(), name)
);
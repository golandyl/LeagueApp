DROP POLICY IF EXISTS "Allow public read" ON public.match_events;
CREATE POLICY "Allow public read"
  ON public.match_events
  FOR SELECT
  USING (true);

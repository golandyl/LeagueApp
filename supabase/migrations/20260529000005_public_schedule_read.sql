-- Allow any client (including unauthenticated) to read match schedules.
-- The old policy gated SELECT on league_is_public OR is_league_manager, which
-- blocked spectators in non-public leagues from finding the next scheduled match
-- after they end a game via the autopilot tournament flow.
DROP POLICY IF EXISTS "matches: read if public league" ON public.matches;
CREATE POLICY "Allow public read on matches"
  ON public.matches
  FOR SELECT
  USING (true);

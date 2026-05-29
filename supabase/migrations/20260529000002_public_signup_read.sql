-- ============================================================
-- Grant unrestricted public SELECT on tournament_signups.
--
-- The existing "tournament_signups: authenticated read" policy
-- limits authenticated (non-manager) users to 0 rows, making
-- the public roster invisible to anyone who happens to be
-- logged in. Signup names are non-sensitive; allow all roles
-- (anon, authenticated) to read every row.
-- ============================================================

DROP POLICY IF EXISTS "Allow public read" ON public.tournament_signups;

CREATE POLICY "Allow public read"
  ON public.tournament_signups
  FOR SELECT
  USING (true);

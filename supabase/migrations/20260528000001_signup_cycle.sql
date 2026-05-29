-- ============================================================
-- leagues.signup_cycle — matchday reset anchor
-- ============================================================
-- A random UUID stored on each league. The TournamentSignup
-- component uses this as a suffix on its localStorage key:
--   has_signed_up_<leagueId>_<signup_cycle>
--
-- When the manager finishes a tournament day or resets the
-- roster, the cycle is regenerated. Every existing localStorage
-- key immediately becomes stale (different suffix), so all
-- players can sign up fresh for the next matchday without
-- needing to clear their browser data.
-- ============================================================

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_cycle UUID NOT NULL DEFAULT gen_random_uuid();

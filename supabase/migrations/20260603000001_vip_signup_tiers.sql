-- ============================================================
-- VIP player tier and two-phase signup (vip_only → open).
-- ============================================================

-- 1. Add is_vip flag to players (default false, not null).
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;

-- 2. Widen leagues.signup_status check constraint to include 'vip_only'.
--    PostgreSQL auto-names the inline CHECK as leagues_signup_status_check.
ALTER TABLE public.leagues
  DROP CONSTRAINT IF EXISTS leagues_signup_status_check;

ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_signup_status_check
    CHECK (signup_status IN ('closed', 'vip_only', 'open'));

-- 3. Anon may read players when any signup phase is active.
DROP POLICY IF EXISTS "players: anon read when signups open" ON public.players;
CREATE POLICY "players: anon read when signups open"
  ON public.players FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id
        AND l.signup_status IN ('open', 'vip_only')
    )
  );

-- 4. Anon may read the league row when any signup phase is active.
DROP POLICY IF EXISTS "leagues: anon read when signups open" ON public.leagues;
CREATE POLICY "leagues: anon read when signups open"
  ON public.leagues FOR SELECT
  TO anon
  USING (signup_status IN ('open', 'vip_only'));

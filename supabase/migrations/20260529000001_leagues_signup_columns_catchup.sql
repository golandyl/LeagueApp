-- ============================================================
-- Idempotent catch-up: adds all signup-window columns that the
-- earlier migrations (20260528020000, 20260528030000) were meant
-- to apply.  Safe to run even if those migrations already ran.
-- ============================================================

-- ── leagues: signup window controls ──────────────────────────────────────────
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_status TEXT NOT NULL DEFAULT 'closed';

-- Add the check constraint only if it does not exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name   = 'leagues_signup_status_check'
  ) THEN
    ALTER TABLE public.leagues
      ADD CONSTRAINT leagues_signup_status_check
      CHECK (signup_status IN ('open', 'closed'));
  END IF;
END;
$$;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_date DATE;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS max_capacity INTEGER NOT NULL DEFAULT 16;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name   = 'leagues_max_capacity_check'
  ) THEN
    ALTER TABLE public.leagues
      ADD CONSTRAINT leagues_max_capacity_check
      CHECK (max_capacity > 0);
  END IF;
END;
$$;

-- ── tournament_signups: structured player binding ─────────────────────────────
ALTER TABLE public.tournament_signups
  ADD COLUMN IF NOT EXISTS player_id UUID
    REFERENCES public.players(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_signups
  ADD COLUMN IF NOT EXISTS is_unlisted_request BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tournament_signups
  ADD COLUMN IF NOT EXISTS requested_name TEXT;

-- ── RLS: anon can read/update tournament_signups ──────────────────────────────
-- Needed so anon users on the public signup page can update their own row
-- (e.g. unlisted request approved by manager sets player_id).
GRANT SELECT, INSERT, UPDATE ON public.tournament_signups TO anon;

-- ── RLS: anon can read leagues when signup is open ────────────────────────────
DROP POLICY IF EXISTS "leagues: anon read when signups open" ON public.leagues;
CREATE POLICY "leagues: anon read when signups open"
  ON public.leagues FOR SELECT
  TO anon
  USING (signup_status = 'open');

-- ── RLS: anon can read players when league signup window is open ──────────────
DROP POLICY IF EXISTS "players: anon read when signups open" ON public.players;
CREATE POLICY "players: anon read when signups open"
  ON public.players FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id
        AND l.signup_status = 'open'
    )
  );

-- ── RLS: manager can update leagues (signup_status, max_capacity, etc.) ───────
-- The initial schema already has "leagues: update own" covering this.
-- No change needed here — confirming it exists:
-- CREATE POLICY "leagues: update own"
--   ON public.leagues FOR UPDATE USING (auth.uid() = manager_id);

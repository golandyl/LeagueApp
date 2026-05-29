-- ============================================================
-- Catch-up migration: idempotent re-application of the entire
-- tournament_signups + signup_cycle feature.
--
-- Safe to run even if some or all of 20260528000000 /
-- 20260528000001 were already applied.  Uses IF NOT EXISTS for
-- DDL and DROP … IF EXISTS for policies so nothing errors on a
-- second run.
-- ============================================================

-- ── tournaments: add capacity cap ────────────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS max_capacity INTEGER NOT NULL DEFAULT 16
    CHECK (max_capacity > 0);

-- ── leagues: add signup_cycle ─────────────────────────────────────────────────
-- NOT NULL is intentionally omitted here so the ALTER succeeds even on a
-- table that already has rows; we backfill NULLs immediately after.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_cycle UUID DEFAULT gen_random_uuid();

UPDATE public.leagues
  SET signup_cycle = gen_random_uuid()
  WHERE signup_cycle IS NULL;

-- ── tournament_signups table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_signups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID        NOT NULL REFERENCES public.leagues(id)       ON DELETE CASCADE,
  tournament_id UUID                    REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_name   TEXT        NOT NULL    CHECK (char_length(trim(player_name)) > 0),
  status        TEXT        NOT NULL    DEFAULT 'active'
                            CHECK (status IN ('active', 'waiting')),
  created_at    TIMESTAMPTZ NOT NULL    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tournament_signups_league_idx
  ON public.tournament_signups (league_id);

CREATE INDEX IF NOT EXISTS tournament_signups_tournament_idx
  ON public.tournament_signups (tournament_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.tournament_signups ENABLE ROW LEVEL SECURITY;

-- Grants are idempotent (GRANT is a no-op if already granted)
GRANT SELECT, INSERT                 ON public.tournament_signups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_signups TO authenticated;

-- Policies: DROP IF EXISTS so re-running doesn't error
DROP POLICY IF EXISTS "tournament_signups: anon read"          ON public.tournament_signups;
DROP POLICY IF EXISTS "tournament_signups: anon insert"        ON public.tournament_signups;
DROP POLICY IF EXISTS "tournament_signups: authenticated read" ON public.tournament_signups;
DROP POLICY IF EXISTS "tournament_signups: manager delete"     ON public.tournament_signups;
DROP POLICY IF EXISTS "tournament_signups: manager update"     ON public.tournament_signups;

CREATE POLICY "tournament_signups: anon read"
  ON public.tournament_signups FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "tournament_signups: anon insert"
  ON public.tournament_signups FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "tournament_signups: authenticated read"
  ON public.tournament_signups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id AND l.manager_id = auth.uid()
    )
  );

-- Manager can delete any signup that belongs to their league
CREATE POLICY "tournament_signups: manager delete"
  ON public.tournament_signups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id AND l.manager_id = auth.uid()
    )
  );

-- Manager can update (promote waiting → active)
CREATE POLICY "tournament_signups: manager update"
  ON public.tournament_signups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id AND l.manager_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id AND l.manager_id = auth.uid()
    )
  );

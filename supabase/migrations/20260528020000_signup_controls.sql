-- ============================================================
-- Signup window controls: manager-gated open/close, structured
-- player binding, and unlisted join requests.
-- ============================================================

-- ── leagues: signup window controls ──────────────────────────────────────────
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_status TEXT NOT NULL DEFAULT 'closed'
    CHECK (signup_status IN ('open', 'closed'));

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS signup_date DATE;

-- ── tournament_signups: structured player binding ─────────────────────────────
ALTER TABLE public.tournament_signups
  ADD COLUMN IF NOT EXISTS player_id UUID
    REFERENCES public.players(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_signups
  ADD COLUMN IF NOT EXISTS is_unlisted_request BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tournament_signups
  ADD COLUMN IF NOT EXISTS requested_name TEXT;

-- ── RLS: anon can read players when league signup window is open ──────────────
-- Required so the public signup page can show the player name dropdown.
-- The existing "players: read if public league" policy covers public leagues;
-- this separate policy covers private leagues whose manager has opened signups.
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

-- ── RLS: anon can read league row when signup window is open ──────────────────
-- The existing "leagues: public or own" policy covers public leagues.
-- This adds anon read for private leagues with an open signup window,
-- so the public signup page can fetch the league name and date.
DROP POLICY IF EXISTS "leagues: anon read when signups open" ON public.leagues;
CREATE POLICY "leagues: anon read when signups open"
  ON public.leagues FOR SELECT
  TO anon
  USING (signup_status = 'open');

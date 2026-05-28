-- ============================================================
-- Tournament Signups & Waiting Room
-- ============================================================
-- Allows anonymous players to sign up for a matchday via a
-- public share link. The manager controls capacity and can
-- remove players, which automatically promotes the waiting list.
-- ============================================================

-- ── tournaments: add capacity cap ─────────────────────────────────────────────

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS max_capacity INTEGER NOT NULL DEFAULT 16
    CHECK (max_capacity > 0);

-- ── tournament_signups table ───────────────────────────────────────────────────

CREATE TABLE public.tournament_signups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID        NOT NULL REFERENCES public.leagues(id)      ON DELETE CASCADE,
  tournament_id UUID                    REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_name   TEXT        NOT NULL    CHECK (char_length(trim(player_name)) > 0),
  status        TEXT        NOT NULL    DEFAULT 'active'
                            CHECK (status IN ('active', 'waiting')),
  created_at    TIMESTAMPTZ NOT NULL    DEFAULT NOW()
);

CREATE INDEX tournament_signups_league_idx ON public.tournament_signups (league_id);
CREATE INDEX tournament_signups_tournament_idx ON public.tournament_signups (tournament_id);

ALTER TABLE public.tournament_signups ENABLE ROW LEVEL SECURITY;

-- ── Column-level grants ────────────────────────────────────────────────────────
-- RLS policies restrict row access; GRANT determines which columns are reachable.

GRANT SELECT, INSERT                    ON public.tournament_signups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE    ON public.tournament_signups TO authenticated;

-- ── RLS: anon can read all signups (names are non-sensitive) ──────────────────

CREATE POLICY "tournament_signups: anon read"
  ON public.tournament_signups FOR SELECT
  TO anon
  USING (true);

-- ── RLS: anon can sign up ─────────────────────────────────────────────────────

CREATE POLICY "tournament_signups: anon insert"
  ON public.tournament_signups FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── RLS: authenticated users can read their own leagues' signups ──────────────

CREATE POLICY "tournament_signups: authenticated read"
  ON public.tournament_signups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id
        AND l.manager_id = auth.uid()
    )
  );

-- ── RLS: only the league manager can delete (remove a signup) ─────────────────

CREATE POLICY "tournament_signups: manager delete"
  ON public.tournament_signups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id
        AND l.manager_id = auth.uid()
    )
  );

-- ── RLS: only the league manager can update (promote waiting → active) ─────────

CREATE POLICY "tournament_signups: manager update"
  ON public.tournament_signups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id
        AND l.manager_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_id
        AND l.manager_id = auth.uid()
    )
  );

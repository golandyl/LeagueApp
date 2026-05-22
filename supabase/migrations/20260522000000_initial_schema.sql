-- ============================================================
-- FootballLeague — Initial Schema
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE public.user_role        AS ENUM ('manager', 'player');
CREATE TYPE public.position_type    AS ENUM ('GK', 'DEF', 'MID', 'FWD');
CREATE TYPE public.stamina_level    AS ENUM ('Low', 'Med', 'High');
CREATE TYPE public.victory_condition AS ENUM ('REGULAR', 'OVERTIME', 'PENALTIES');
CREATE TYPE public.match_status     AS ENUM ('scheduled', 'live', 'completed', 'cancelled');
CREATE TYPE public.event_type       AS ENUM ('goal', 'assist', 'yellow_card', 'red_card', 'substitution');
CREATE TYPE public.tournament_status AS ENUM ('draft', 'active', 'completed');
CREATE TYPE public.draft_status     AS ENUM ('pending', 'active', 'completed');

-- ─── Utility trigger: keep updated_at current ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── managers ────────────────────────────────────────────────────────────────
-- One row per Supabase Auth user. Provisioned automatically via trigger below.
CREATE TABLE public.managers (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a managers row when a new Auth user is confirmed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.managers (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER managers_updated_at
  BEFORE UPDATE ON public.managers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── leagues ─────────────────────────────────────────────────────────────────
CREATE TABLE public.leagues (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id              UUID        NOT NULL REFERENCES public.managers(id) ON DELETE RESTRICT,
  name                    TEXT        NOT NULL,
  description             TEXT,

  -- ── Match format ─────────────────────────────────────────
  match_length_minutes    INTEGER     NOT NULL DEFAULT 90  CHECK (match_length_minutes > 0),
  overtime_enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
  overtime_length_minutes INTEGER     NOT NULL DEFAULT 15  CHECK (overtime_length_minutes > 0),
  penalties_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- NULL → time-based; integer → play-to-score variant (e.g. first to 7)
  win_score               INTEGER                          CHECK (win_score IS NULL OR win_score > 0),

  -- ── Standing points ───────────────────────────────────────
  -- REGULAR win = full points; OVERTIME win = reduced; PENALTIES win = minimum.
  -- Frontend reads victory_condition on each Match to award the right amount.
  points_regular_win      INTEGER     NOT NULL DEFAULT 3   CHECK (points_regular_win >= 0),
  points_ot_win           INTEGER     NOT NULL DEFAULT 2   CHECK (points_ot_win >= 0),
  points_penalties_win    INTEGER     NOT NULL DEFAULT 1   CHECK (points_penalties_win >= 0),
  points_draw             INTEGER     NOT NULL DEFAULT 1   CHECK (points_draw >= 0),
  points_loss             INTEGER     NOT NULL DEFAULT 0   CHECK (points_loss >= 0),

  is_public               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leagues_updated_at
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── players ─────────────────────────────────────────────────────────────────
-- Football players within a league. Not necessarily Supabase Auth users.
-- Ghost players inserted by the team-generator carry is_ghost = TRUE.
CREATE TABLE public.players (
  id          UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   UUID                  NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  -- Optional: link to the Auth user who "owns" this player profile.
  manager_id  UUID                  REFERENCES public.managers(id) ON DELETE SET NULL,
  full_name   TEXT                  NOT NULL,
  rating      INTEGER               NOT NULL CHECK (rating >= 1 AND rating <= 10),
  position    public.position_type  NOT NULL,
  stamina     public.stamina_level  NOT NULL,
  is_ghost    BOOLEAN               NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── tournaments ─────────────────────────────────────────────────────────────
-- A season/competition within a league.
CREATE TABLE public.tournaments (
  id            UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID                     NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name          TEXT                     NOT NULL,
  season        TEXT                     NOT NULL,  -- e.g. '2026-Summer'
  status        public.tournament_status NOT NULL DEFAULT 'draft',
  draft_status  public.draft_status      NOT NULL DEFAULT 'pending',
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  CONSTRAINT end_after_start CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

CREATE TRIGGER tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── teams ───────────────────────────────────────────────────────────────────
CREATE TABLE public.teams (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  league_id       UUID        NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  color           TEXT,       -- hex e.g. '#FF5733'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_hex_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

-- ─── team_players ─────────────────────────────────────────────────────────────
-- Join table recording which player was drafted onto which team.
-- Enforces that each player appears on at most one team per tournament.
CREATE TABLE public.team_players (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL REFERENCES public.teams(id)       ON DELETE CASCADE,
  player_id       UUID        NOT NULL REFERENCES public.players(id)     ON DELETE CASCADE,
  tournament_id   UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  drafted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_player_per_tournament UNIQUE (player_id, tournament_id)
);

-- ─── matches ─────────────────────────────────────────────────────────────────
CREATE TABLE public.matches (
  id                  UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       UUID                      NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  league_id           UUID                      NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  home_team_id        UUID                      NOT NULL REFERENCES public.teams(id)       ON DELETE RESTRICT,
  away_team_id        UUID                      NOT NULL REFERENCES public.teams(id)       ON DELETE RESTRICT,
  home_score          INTEGER                            CHECK (home_score >= 0),
  away_score          INTEGER                            CHECK (away_score >= 0),
  status              public.match_status       NOT NULL DEFAULT 'scheduled',

  -- NULL until the match is completed.
  -- The frontend reads this to award points:
  --   REGULAR   → winner gets points_regular_win   from leagues.
  --   OVERTIME  → winner gets points_ot_win         from leagues.
  --   PENALTIES → winner gets points_penalties_win  from leagues.
  victory_condition   public.victory_condition,

  match_date          TIMESTAMPTZ NOT NULL,
  played_at           TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT different_teams    CHECK (home_team_id <> away_team_id),
  -- Completed matches must have scores and a victory_condition.
  CONSTRAINT completed_has_scores CHECK (
    status <> 'completed'
    OR (
      home_score      IS NOT NULL AND
      away_score      IS NOT NULL AND
      victory_condition IS NOT NULL
    )
  )
);

CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── match_events ─────────────────────────────────────────────────────────────
-- Individual events within a match (goals, assists, cards, subs).
CREATE TABLE public.match_events (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID              NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id     UUID              NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  player_id   UUID              REFERENCES public.players(id)          ON DELETE SET NULL,
  event_type  public.event_type NOT NULL,
  minute      INTEGER           NOT NULL CHECK (minute >= 0),
  description TEXT,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_leagues_manager_id         ON public.leagues(manager_id);
CREATE INDEX idx_leagues_is_public          ON public.leagues(is_public);

CREATE INDEX idx_players_league_id          ON public.players(league_id);
CREATE INDEX idx_players_manager_id         ON public.players(manager_id);

CREATE INDEX idx_tournaments_league_id      ON public.tournaments(league_id);
CREATE INDEX idx_tournaments_status         ON public.tournaments(status);

CREATE INDEX idx_teams_tournament_id        ON public.teams(tournament_id);
CREATE INDEX idx_teams_league_id            ON public.teams(league_id);

CREATE INDEX idx_team_players_team_id       ON public.team_players(team_id);
CREATE INDEX idx_team_players_player_id     ON public.team_players(player_id);
CREATE INDEX idx_team_players_tournament_id ON public.team_players(tournament_id);

CREATE INDEX idx_matches_tournament_id      ON public.matches(tournament_id);
CREATE INDEX idx_matches_league_id          ON public.matches(league_id);
CREATE INDEX idx_matches_home_team_id       ON public.matches(home_team_id);
CREATE INDEX idx_matches_away_team_id       ON public.matches(away_team_id);
CREATE INDEX idx_matches_status             ON public.matches(status);
CREATE INDEX idx_matches_match_date         ON public.matches(match_date);

CREATE INDEX idx_match_events_match_id      ON public.match_events(match_id);
CREATE INDEX idx_match_events_player_id     ON public.match_events(player_id);
CREATE INDEX idx_match_events_team_id       ON public.match_events(team_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.managers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events   ENABLE ROW LEVEL SECURITY;

-- ── managers ──────────────────────────────────────────────────
CREATE POLICY "managers: read own row"
  ON public.managers FOR SELECT USING (auth.uid() = id);

CREATE POLICY "managers: update own row"
  ON public.managers FOR UPDATE USING (auth.uid() = id);

-- ── Helper functions ──────────────────────────────────────────
-- Avoids repeating JOINs inside every policy.

CREATE OR REPLACE FUNCTION public.is_league_manager(p_league_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues
    WHERE id = p_league_id AND manager_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.league_is_public(p_league_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT is_public FROM public.leagues WHERE id = p_league_id),
    FALSE
  );
$$;

-- ── leagues ───────────────────────────────────────────────────
CREATE POLICY "leagues: public or own"
  ON public.leagues FOR SELECT USING (is_public = TRUE OR auth.uid() = manager_id);

CREATE POLICY "leagues: insert own"
  ON public.leagues FOR INSERT WITH CHECK (auth.uid() = manager_id);

CREATE POLICY "leagues: update own"
  ON public.leagues FOR UPDATE USING (auth.uid() = manager_id);

CREATE POLICY "leagues: delete own"
  ON public.leagues FOR DELETE USING (auth.uid() = manager_id);

-- ── players ───────────────────────────────────────────────────
CREATE POLICY "players: read if public league"
  ON public.players FOR SELECT
  USING (public.league_is_public(league_id) OR public.is_league_manager(league_id));

CREATE POLICY "players: write if manager"
  ON public.players FOR INSERT WITH CHECK (public.is_league_manager(league_id));

CREATE POLICY "players: update if manager"
  ON public.players FOR UPDATE USING (public.is_league_manager(league_id));

CREATE POLICY "players: delete if manager"
  ON public.players FOR DELETE USING (public.is_league_manager(league_id));

-- ── tournaments ───────────────────────────────────────────────
CREATE POLICY "tournaments: read if public league"
  ON public.tournaments FOR SELECT
  USING (public.league_is_public(league_id) OR public.is_league_manager(league_id));

CREATE POLICY "tournaments: write if manager"
  ON public.tournaments FOR INSERT WITH CHECK (public.is_league_manager(league_id));

CREATE POLICY "tournaments: update if manager"
  ON public.tournaments FOR UPDATE USING (public.is_league_manager(league_id));

CREATE POLICY "tournaments: delete if manager"
  ON public.tournaments FOR DELETE USING (public.is_league_manager(league_id));

-- ── teams ─────────────────────────────────────────────────────
CREATE POLICY "teams: read if public league"
  ON public.teams FOR SELECT
  USING (public.league_is_public(league_id) OR public.is_league_manager(league_id));

CREATE POLICY "teams: write if manager"
  ON public.teams FOR INSERT WITH CHECK (public.is_league_manager(league_id));

CREATE POLICY "teams: update if manager"
  ON public.teams FOR UPDATE USING (public.is_league_manager(league_id));

CREATE POLICY "teams: delete if manager"
  ON public.teams FOR DELETE USING (public.is_league_manager(league_id));

-- ── team_players ──────────────────────────────────────────────
CREATE POLICY "team_players: read if public league"
  ON public.team_players FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND (public.league_is_public(t.league_id) OR public.is_league_manager(t.league_id))
    )
  );

CREATE POLICY "team_players: write if manager"
  ON public.team_players FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND public.is_league_manager(t.league_id)
    )
  );

-- ── matches ───────────────────────────────────────────────────
CREATE POLICY "matches: read if public league"
  ON public.matches FOR SELECT
  USING (public.league_is_public(league_id) OR public.is_league_manager(league_id));

CREATE POLICY "matches: write if manager"
  ON public.matches FOR INSERT WITH CHECK (public.is_league_manager(league_id));

CREATE POLICY "matches: update if manager"
  ON public.matches FOR UPDATE USING (public.is_league_manager(league_id));

CREATE POLICY "matches: delete if manager"
  ON public.matches FOR DELETE USING (public.is_league_manager(league_id));

-- ── match_events ──────────────────────────────────────────────
CREATE POLICY "match_events: read if public league"
  ON public.match_events FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (public.league_is_public(m.league_id) OR public.is_league_manager(m.league_id))
    )
  );

CREATE POLICY "match_events: write if manager"
  ON public.match_events FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id AND public.is_league_manager(m.league_id)
    )
  );

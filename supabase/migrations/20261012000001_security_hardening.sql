-- ============================================================
-- Security hardening.
--
-- 0. Tournament access codes — each tournament gets a short code the
--    manager shares with whoever should run games. Non-managers may only
--    score / pause / end matches when their request carries the code in
--    the `x-access-codes` header (comma-separated, set by the browser
--    client from localStorage). Codes live in a manager-only table.
-- 1. advance_wc_tournament — derive everything from the match being
--    finished instead of trusting caller-supplied tournament/league/team
--    IDs. Requires an access code, an active Winner-Continues tournament,
--    an unfinished match, and a winner that actually played in it.
--    Idempotent: if the next match already exists it is returned.
-- 2. Match visibility — reads are limited to leagues anon can already see
--    (public, or signups open); writes require the access code.
-- 3. Signup abuse — reject signups while the window is closed, cap name
--    length, block duplicate unlisted names, and cap rows per league.
-- 4. Pin search_path on the older SECURITY DEFINER helpers.
-- ============================================================


-- ── 0. Tournament access codes ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tournament_access_codes (
  tournament_id UUID        PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  code          TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tournament_access_codes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.tournament_access_codes TO authenticated;

DROP POLICY IF EXISTS "tournament_access_codes: manager read" ON public.tournament_access_codes;
CREATE POLICY "tournament_access_codes: manager read"
  ON public.tournament_access_codes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id
        AND public.is_league_manager(t.league_id)
    )
  );

-- 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
CREATE OR REPLACE FUNCTION public.generate_access_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes    BYTEA := gen_random_bytes(6);
  v_code     TEXT  := '';
BEGIN
  FOR i IN 0..5 LOOP
    v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, i) % length(v_alphabet), 1);
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_access_code() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_tournament_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tournament_access_codes (tournament_id, code)
  VALUES (NEW.id, public.generate_access_code())
  ON CONFLICT (tournament_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_tournament_access_code ON public.tournaments;
CREATE TRIGGER trg_create_tournament_access_code
  AFTER INSERT ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_tournament_access_code();

-- Backfill existing tournaments.
INSERT INTO public.tournament_access_codes (tournament_id, code)
SELECT t.id, public.generate_access_code()
FROM public.tournaments t
ON CONFLICT (tournament_id) DO NOTHING;

-- True for the league manager, or when the request carries the tournament's code.
CREATE OR REPLACE FUNCTION public.has_tournament_access(p_tournament_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    JOIN public.leagues l ON l.id = t.league_id
    LEFT JOIN public.tournament_access_codes c ON c.tournament_id = t.id
    WHERE t.id = p_tournament_id
      AND (
        l.manager_id = auth.uid()
        OR c.code = ANY (string_to_array(upper(COALESCE(
             current_setting('request.headers', true)::json ->> 'x-access-codes', ''
           )), ','))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_tournament_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_tournament_access(UUID) TO anon, authenticated;

-- Manager rotates the code (e.g. after it leaked). Returns the new code.
CREATE OR REPLACE FUNCTION public.regenerate_tournament_access_code(p_tournament_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := public.generate_access_code();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments t
    JOIN public.leagues l ON l.id = t.league_id
    WHERE t.id = p_tournament_id AND l.manager_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the league manager may change the access code';
  END IF;

  INSERT INTO public.tournament_access_codes (tournament_id, code, updated_at)
  VALUES (p_tournament_id, v_code, NOW())
  ON CONFLICT (tournament_id) DO UPDATE SET code = EXCLUDED.code, updated_at = NOW();

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_tournament_access_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_tournament_access_code(UUID) TO authenticated;


-- ── 1. advance_wc_tournament ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.advance_wc_tournament(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.advance_wc_tournament(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.advance_wc_tournament(
  p_match_id  UUID,
  p_winner_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match        public.matches%ROWTYPE;
  v_tournament   public.tournaments%ROWTYPE;
  v_loser_id     UUID;
  v_queue        UUID[];
  v_opponent_id  UUID;
  v_existing_id  UUID;
  v_new_match_id UUID;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: Match % does not exist', p_match_id;
  END IF;

  -- Row lock serialises concurrent calls (e.g. two spectators ending the
  -- same match) so only one next match is ever created.
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = v_match.tournament_id
  FOR UPDATE;

  IF NOT FOUND OR v_tournament.status <> 'active' THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_ACTIVE: Tournament is not active';
  END IF;

  IF NOT public.has_tournament_access(v_tournament.id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: A valid access code is required';
  END IF;

  IF v_tournament.format IS DISTINCT FROM 'winner_continues' THEN
    RAISE EXCEPTION 'INVALID_FORMAT: Tournament is not Winner Continues';
  END IF;

  IF v_match.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'MATCH_FINISHED: Match % is already finished', p_match_id;
  END IF;

  IF p_winner_id = v_match.home_team_id THEN
    v_loser_id := v_match.away_team_id;
  ELSIF p_winner_id = v_match.away_team_id THEN
    v_loser_id := v_match.home_team_id;
  ELSE
    RAISE EXCEPTION 'INVALID_WINNER: Team % did not play in match %', p_winner_id, p_match_id;
  END IF;

  -- Idempotency: a WC tournament only ever has one pending match after the
  -- current one. If it already exists, hand it back.
  SELECT id INTO v_existing_id
  FROM public.matches
  WHERE tournament_id = v_tournament.id
    AND id <> p_match_id
    AND status IN ('scheduled', 'live', 'paused')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Push loser to back, pop front as next challenger.
  v_queue := array_append(COALESCE(v_tournament.wc_queue, ARRAY[]::UUID[]), v_loser_id);
  v_opponent_id := v_queue[1];

  IF cardinality(v_queue) > 1 THEN
    v_queue := v_queue[2:cardinality(v_queue)];
  ELSE
    v_queue := ARRAY[]::UUID[];
  END IF;

  UPDATE public.tournaments SET wc_queue = v_queue WHERE id = v_tournament.id;

  INSERT INTO public.matches (
    league_id, tournament_id, home_team_id, away_team_id, status, match_date
  ) VALUES (
    v_match.league_id, v_tournament.id, p_winner_id, v_opponent_id, 'scheduled', NOW()
  )
  RETURNING id INTO v_new_match_id;

  RETURN v_new_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_wc_tournament(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_wc_tournament(UUID, UUID) TO anon, authenticated;


-- ── 2. Match visibility ──────────────────────────────────────────────────────
-- Mirrors the leagues SELECT policies: a match is visible when its league is
-- public, its signup window is open, or the caller manages it. Anyone who
-- cannot see the league already gets a 404 on the match page, so this does
-- not change what works in the app.

CREATE OR REPLACE FUNCTION public.league_is_visible(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.id = p_league_id
      AND (
        l.is_public = TRUE
        OR l.signup_status IN ('open', 'vip_only')
        OR l.manager_id = auth.uid()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.league_is_visible(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public read on matches" ON public.matches;
DROP POLICY IF EXISTS "matches: read if public league" ON public.matches;
CREATE POLICY "matches: read if league visible"
  ON public.matches FOR SELECT
  USING (public.league_is_visible(league_id));

DROP POLICY IF EXISTS "Allow public read" ON public.match_events;
DROP POLICY IF EXISTS "match_events: read if public league" ON public.match_events;
CREATE POLICY "match_events: read if league visible"
  ON public.match_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND public.league_is_visible(m.league_id)
    )
  );

-- Scorekeeping by code holders (anon, or logged-in non-managers). Column
-- grants for anon still limit which match fields can change.
DROP POLICY IF EXISTS "matches: anon update in active tournament" ON public.matches;
DROP POLICY IF EXISTS "matches: code holder update in active tournament" ON public.matches;
CREATE POLICY "matches: code holder update in active tournament"
  ON public.matches FOR UPDATE
  TO anon, authenticated
  USING (
    public.has_tournament_access(tournament_id)
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.status = 'active'
    )
  )
  WITH CHECK (
    public.has_tournament_access(tournament_id)
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.status = 'active'
    )
  );

DROP POLICY IF EXISTS "match_events: anon insert in active tournament" ON public.match_events;
DROP POLICY IF EXISTS "match_events: code holder insert in active tournament" ON public.match_events;
CREATE POLICY "match_events: code holder insert in active tournament"
  ON public.match_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_id
        AND t.status = 'active'
        AND m.status IN ('live', 'paused')
        AND public.has_tournament_access(m.tournament_id)
    )
  );


-- ── 3. Signup abuse protection ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_signup_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league public.leagues%ROWTYPE;
BEGIN
  SELECT * INTO v_league FROM public.leagues WHERE id = NEW.league_id;

  -- Managers may add rows at any time; everyone else needs an open window.
  IF v_league.manager_id IS DISTINCT FROM auth.uid() THEN
    IF v_league.signup_status IS DISTINCT FROM 'open'
       AND v_league.signup_status IS DISTINCT FROM 'vip_only' THEN
      RAISE EXCEPTION 'SIGNUP_CLOSED: Signup is currently closed';
    END IF;
  END IF;

  IF char_length(NEW.player_name) > 60
     OR char_length(COALESCE(NEW.requested_name, '')) > 60 THEN
    RAISE EXCEPTION 'NAME_TOO_LONG: Names are limited to 60 characters';
  END IF;

  IF NEW.player_id IS NULL AND EXISTS (
    SELECT 1 FROM public.tournament_signups s
    WHERE s.league_id = NEW.league_id
      AND lower(trim(s.player_name)) = lower(trim(NEW.player_name))
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_NAME: That name is already on the list';
  END IF;

  -- Hard ceiling: capacity plus a generous waitlist.
  IF (SELECT count(*) FROM public.tournament_signups s WHERE s.league_id = NEW.league_id)
     >= GREATEST(v_league.max_capacity * 3, 50) THEN
    RAISE EXCEPTION 'SIGNUP_FULL: The signup list is full';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signup_limits ON public.tournament_signups;
CREATE TRIGGER trg_enforce_signup_limits
  BEFORE INSERT ON public.tournament_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_limits();


-- ── 4. Pin search_path on older SECURITY DEFINER helpers ─────────────────────

ALTER FUNCTION public.is_league_manager(UUID) SET search_path = public;
ALTER FUNCTION public.league_is_public(UUID)  SET search_path = public;

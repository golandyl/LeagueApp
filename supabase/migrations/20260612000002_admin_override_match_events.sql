-- ============================================================
-- admin_override_match_events
--
-- SECURITY DEFINER RPC that lets the league manager completely
-- replace the event log of any match — including matches from
-- completed (archived) tournaments, which are normally protected
-- by the enforce_completed_tournament_lock trigger.
--
-- This bypasses the lock via session_replication_role = 'replica',
-- which suppresses user-defined triggers for the duration of the
-- transaction.  The same technique is used by admin_delete_tournament.
--
-- Authorization: caller must be the league manager for the league
-- that owns the match (verified via a direct leagues.manager_id
-- check against the pre-captured auth.uid(), matching the pattern
-- established in the admin_delete_tournament fix migration).
--
-- Parameters:
--   p_match_id   — the match to override
--   p_home_score — new home score (calculated from goals by the caller)
--   p_away_score — new away score
--   p_vc         — new victory_condition ('REGULAR'|'OVERTIME'|'PENALTIES')
--   p_events     — jsonb array of event objects, each containing:
--                  { event_type, team_id, player_id, minute, description }
--                  player_id and description may be JSON null.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_override_match_events(
  p_match_id   UUID,
  p_home_score INT,
  p_away_score INT,
  p_vc         public.victory_condition,
  p_events     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
  v_caller_id UUID;
  v_event     jsonb;
BEGIN
  -- 1. Capture caller identity before any SET LOCAL statements.
  --    auth.uid() reads the JWT claim injected by PostgREST; it must
  --    be read here because session_replication_role changes can affect
  --    the execution context of helper functions that also call auth.uid().
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Disable RLS and user-defined triggers for this transaction.
  --    SET LOCAL scopes both changes to this function call; they revert
  --    automatically when the transaction ends (or the function returns).
  --
  --    row_security = off  → the SECURITY DEFINER owner can read/write
  --                          any row regardless of RLS policies, which
  --                          also prevents the "matches: update if manager"
  --                          RLS policy from blocking the UPDATE below.
  --
  --    session_replication_role = replica  → suppresses user-defined
  --                          triggers, so enforce_completed_tournament_lock
  --                          cannot fire on the DELETE / INSERT / UPDATE.
  SET LOCAL row_security = off;
  SET LOCAL session_replication_role = 'replica';

  -- 3. Resolve the parent league from the match (RLS is off — always
  --    succeeds for existing rows regardless of ownership).
  SELECT league_id INTO v_league_id
    FROM public.matches
   WHERE id = p_match_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: Match % does not exist', p_match_id;
  END IF;

  -- 4. Authorization: direct ownership check using the pre-captured UID.
  --    Mirrors the pattern in admin_delete_tournament to avoid calling
  --    is_league_manager() under the replica role.
  IF NOT EXISTS (
    SELECT 1 FROM public.leagues
     WHERE id = v_league_id
       AND manager_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the league manager may override match events';
  END IF;

  -- 5. Wipe the existing event log for this match.
  --    Trigger is suppressed — completed-tournament lock cannot fire.
  DELETE FROM public.match_events
   WHERE match_id = p_match_id;

  -- 6. Insert new events from the supplied JSON array.
  --    An empty array ([]) is valid: produces a no-event match.
  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    INSERT INTO public.match_events
      (match_id, event_type, team_id, player_id, minute, description)
    VALUES (
      p_match_id,
      (v_event->>'event_type')::public.event_type,
      (v_event->>'team_id')::UUID,
      NULLIF(v_event->>'player_id',   '')::UUID,   -- JSON null → SQL NULL
      (v_event->>'minute')::INT,
      NULLIF(v_event->>'description', '')            -- JSON null → SQL NULL
    );
  END LOOP;

  -- 7. Update the match result in a single statement.
  --    Trigger is suppressed — the "matches: update if manager" RLS
  --    policy and enforce_completed_tournament_lock both cannot fire.
  UPDATE public.matches
     SET home_score        = p_home_score,
         away_score        = p_away_score,
         victory_condition = p_vc
   WHERE id = p_match_id;

END;
$$;

-- Allow authenticated users to invoke this function.
-- The manager ownership check inside prevents any non-manager caller
-- from actually modifying data.
GRANT EXECUTE
  ON FUNCTION public.admin_override_match_events(UUID, INT, INT, public.victory_condition, jsonb)
  TO authenticated;

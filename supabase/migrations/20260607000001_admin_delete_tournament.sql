-- ============================================================
-- admin_delete_tournament(p_tournament_id UUID)
--
-- SECURITY DEFINER function that permanently deletes a single
-- tournament including all its child data (matches, events,
-- teams, rosters), bypassing the enforce_completed_tournament_lock
-- trigger which would otherwise block deletion of completed data.
--
-- Stat rollback note: there is no separate player-stats table.
-- Goals, assists, GP, and points are all computed on-the-fly from
-- matches / match_events. Deleting the tournament data IS the stat
-- rollback — standings and leaderboard queries over the remaining
-- rows will automatically reflect the removal.
--
-- Authorization: caller must be the league manager
--   (verified via is_league_manager()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_tournament(p_tournament_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
BEGIN
  -- Resolve the parent league and verify ownership.
  SELECT league_id INTO v_league_id
    FROM public.tournaments
   WHERE id = p_tournament_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: Tournament % does not exist', p_tournament_id;
  END IF;

  IF NOT public.is_league_manager(v_league_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the league manager may delete a tournament';
  END IF;

  -- Disable user-defined triggers for this transaction so that
  -- enforce_completed_tournament_lock cannot block the deletions below.
  -- SET LOCAL scopes the change to this function call; the setting
  -- reverts automatically when the transaction ends.
  SET LOCAL session_replication_role = 'replica';

  -- Delete in foreign-key dependency order (deepest child first).

  DELETE FROM public.match_events
   WHERE match_id IN (
     SELECT id FROM public.matches WHERE tournament_id = p_tournament_id
   );

  DELETE FROM public.team_players WHERE tournament_id = p_tournament_id;
  DELETE FROM public.matches       WHERE tournament_id = p_tournament_id;
  DELETE FROM public.teams         WHERE tournament_id = p_tournament_id;
  DELETE FROM public.tournaments   WHERE id = p_tournament_id;

END;
$$;

-- Allow authenticated users to call this function.
-- The manager check inside the function prevents abuse.
GRANT EXECUTE ON FUNCTION public.admin_delete_tournament(UUID) TO authenticated;

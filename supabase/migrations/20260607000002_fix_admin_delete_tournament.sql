-- ============================================================
-- Fix: admin_delete_tournament — RLS bypass ordering
--
-- Root cause: the original function called SET LOCAL
-- session_replication_role = 'replica' *after* the verification
-- SELECT, leaving that SELECT subject to the RLS policy on
-- tournaments.  If the function's effective role does not have
-- BYPASSRLS the policy silently hides the row and v_league_id
-- stays NULL, producing a false TOURNAMENT_NOT_FOUND error.
--
-- Fix:
--   1. Capture auth.uid() immediately (before any SET LOCAL).
--   2. Disable RLS (row_security = off) and triggers
--      (session_replication_role = replica) at the very top so
--      every subsequent query in the function is unblocked.
--   3. Replace the is_league_manager() helper with a direct
--      ownership check against leagues.manager_id, using the
--      pre-captured UID — avoids any helper-function side-effects
--      that replica-role changes could introduce.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_tournament(p_tournament_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
  v_caller_id UUID;
BEGIN
  -- 1. Capture caller identity before any session-variable changes.
  --    auth.uid() reads the JWT claim set by PostgREST; capturing it
  --    here ensures it is still available after SET LOCAL statements.
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Disable RLS and user-defined triggers for this transaction.
  --    SET LOCAL scopes both changes to this function call; they revert
  --    automatically when the transaction ends.
  --    row_security = off: lets the SECURITY DEFINER owner read any row
  --    regardless of policies (equivalent to BYPASSRLS for this txn).
  --    session_replication_role = replica: suppresses triggers so that
  --    enforce_completed_tournament_lock cannot block the deletes below.
  SET LOCAL row_security = off;
  SET LOCAL session_replication_role = 'replica';

  -- 3. Resolve the parent league (RLS is now off — always succeeds if
  --    the row exists).
  SELECT league_id INTO v_league_id
    FROM public.tournaments
   WHERE id = p_tournament_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: Tournament % does not exist', p_tournament_id;
  END IF;

  -- 4. Authorization: direct ownership check using the pre-captured UID.
  --    We intentionally avoid calling is_league_manager() here because
  --    that helper also reads auth.uid() and its behaviour could be
  --    surprising under replica role.
  IF NOT EXISTS (
    SELECT 1 FROM public.leagues
     WHERE id = v_league_id
       AND manager_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the league manager may delete a tournament';
  END IF;

  -- 5. Delete in foreign-key dependency order (deepest child first).
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

-- Re-grant execute (idempotent).
GRANT EXECUTE ON FUNCTION public.admin_delete_tournament(UUID) TO authenticated;

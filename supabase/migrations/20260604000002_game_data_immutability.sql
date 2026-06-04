-- ============================================================
-- Game data immutability: lock completed-tournament records
-- against any further mutations.
--
-- 1. enforce_completed_tournament_lock() — shared trigger fn.
--    Fires BEFORE UPDATE/DELETE on matches and
--    BEFORE INSERT/UPDATE/DELETE on match_events.
--    Raises TOURNAMENT_LOCKED if the parent tournament is
--    'completed', making historical data physically immutable
--    regardless of role or RLS.
--
-- 2. Replaces the permissive authenticated-manager UPDATE/DELETE
--    policies on matches with versions that also require the
--    parent tournament to be non-completed (defense-in-depth:
--    RLS is evaluated before the trigger, so the DB rejects
--    the request at two independent layers).
--
-- IMPORTANT — AdminPanel full-reset interaction:
--   AdminPanel.handleReset() issues DELETE on matches for the
--   league. Any completed tournament's matches are now immutable
--   and those deletes will be rejected by the trigger. This is
--   intentional: historical data must survive a partial reset.
--   A full wipe requires the tournament to be un-completed first
--   (or a service-role migration), which is the correct
--   administrative flow.
-- ============================================================


-- ── 1. Trigger function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_completed_tournament_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id UUID;
  v_t_status      public.tournament_status;
BEGIN
  -- ── Resolve the parent tournament from whichever table fired. ───────────────
  IF TG_TABLE_NAME = 'matches' THEN
    -- Trigger is BEFORE UPDATE OR DELETE — OLD is always populated.
    v_tournament_id := OLD.tournament_id;

  ELSIF TG_TABLE_NAME = 'match_events' THEN
    -- INSERT has no OLD row; UPDATE/DELETE do.
    IF TG_OP = 'INSERT' THEN
      SELECT m.tournament_id INTO v_tournament_id
        FROM public.matches m
       WHERE m.id = NEW.match_id;
    ELSE
      SELECT m.tournament_id INTO v_tournament_id
        FROM public.matches m
       WHERE m.id = OLD.match_id;
    END IF;
  END IF;

  -- Orphaned rows with no tournament linkage pass through unchanged.
  IF v_tournament_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_t_status
    FROM public.tournaments
   WHERE id = v_tournament_id;

  IF v_t_status = 'completed' THEN
    RAISE EXCEPTION
      'TOURNAMENT_LOCKED: Cannot modify historical data for a completed tournament';
  END IF;

  -- Allow the operation.
  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ── 2. Attach to matches (UPDATE + DELETE only; INSERT is fine pre-completion) ─

DROP TRIGGER IF EXISTS trg_lock_completed_tournament_matches ON public.matches;

CREATE TRIGGER trg_lock_completed_tournament_matches
  BEFORE UPDATE OR DELETE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_completed_tournament_lock();


-- ── 3. Attach to match_events (all three ops: no post-completion event edits) ──

DROP TRIGGER IF EXISTS trg_lock_completed_tournament_events ON public.match_events;

CREATE TRIGGER trg_lock_completed_tournament_events
  BEFORE INSERT OR UPDATE OR DELETE ON public.match_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_completed_tournament_lock();


-- ── 4. RLS hardening — authenticated manager policies on matches ──────────────
-- Original policies from 20260522000000 allowed UPDATE/DELETE on any match in
-- the manager's league, irrespective of tournament status.
-- Replaced here with versions that add the tournament-status predicate.
-- This means RLS rejects the request before it even reaches the trigger.

DROP POLICY IF EXISTS "matches: update if manager" ON public.matches;
CREATE POLICY "matches: update if manager"
  ON public.matches FOR UPDATE
  TO authenticated
  USING (
    public.is_league_manager(league_id)
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id
        AND t.status != 'completed'
    )
  );

DROP POLICY IF EXISTS "matches: delete if manager" ON public.matches;
CREATE POLICY "matches: delete if manager"
  ON public.matches FOR DELETE
  TO authenticated
  USING (
    public.is_league_manager(league_id)
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id
        AND t.status != 'completed'
    )
  );

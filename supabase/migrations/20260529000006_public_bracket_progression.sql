-- ── Column-level grants: extend anon UPDATE to cover pause and match-end columns
-- The initial RBAC migration only granted (home_score, away_score, status, played_at).
-- Spectators need paused_at to pause/resume and victory_condition to end matches.
GRANT UPDATE (paused_at, victory_condition) ON public.matches TO anon;

-- ── SECURITY DEFINER function: Winner-Continues bracket progression ────────────
-- Direct INSERT on matches is blocked by RLS for anonymous clients.
-- This function runs as the Postgres role (bypassing RLS entirely), so any
-- client — manager or spectator — can safely advance a WC bracket without
-- needing explicit INSERT privileges.
--
-- Algorithm mirrors the client-side JS queue engine:
--   1. Exclude the winner from the candidate pool.
--   2. Order remaining teams by their most-recent completed-match played_at,
--      NULLS FIRST (never played = highest queue priority).
--   3. Insert a new scheduled match: winner (home) vs. next-in-queue (away).
--   4. Return the new match UUID so the caller can navigate to it immediately.
CREATE OR REPLACE FUNCTION public.advance_wc_tournament(
  p_winner_id     UUID,
  p_tournament_id UUID,
  p_league_id     UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_opponent_id  UUID;
  v_new_match_id UUID;
BEGIN
  SELECT t.id INTO v_opponent_id
  FROM public.teams t
  WHERE t.tournament_id = p_tournament_id
    AND t.id != p_winner_id
  ORDER BY (
    SELECT MAX(m.played_at)
    FROM public.matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.status = 'completed'
      AND (m.home_team_id = t.id OR m.away_team_id = t.id)
  ) ASC NULLS FIRST
  LIMIT 1;

  IF v_opponent_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.matches (
    league_id, tournament_id, home_team_id, away_team_id, status, match_date
  ) VALUES (
    p_league_id, p_tournament_id, p_winner_id, v_opponent_id, 'scheduled', NOW()
  )
  RETURNING id INTO v_new_match_id;

  RETURN v_new_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_wc_tournament(UUID, UUID, UUID) TO anon, authenticated;

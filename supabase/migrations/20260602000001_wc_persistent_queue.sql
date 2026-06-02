-- ── Persistent WC queue ──────────────────────────────────────────────────────
-- Replace the match-history-based ordering with an explicit ordered queue so
-- that the true FIFO rotation is maintained even if matches are completed out
-- of order or played_at timestamps are unreliable.

-- 1. Add wc_queue column to tournaments (UUID array, default empty).
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS wc_queue UUID[] NOT NULL DEFAULT '{}';

-- 2. Drop the old 3-arg function so there is no ambiguous overload.
DROP FUNCTION IF EXISTS public.advance_wc_tournament(UUID, UUID, UUID);

-- 3. New 4-arg function: accepts the loser so it can be enqueued.
--
-- Algorithm:
--   a. Push loser to the back of the queue (this makes 2-team WC work: even
--      when the initial queue is empty the loser immediately becomes the next
--      challenger).
--   b. Pop the front of the queue → next_challenger.
--   c. Write the mutated queue back to tournaments.
--   d. Insert the next match: winner (home) vs next_challenger (away).
--   e. Return the new match UUID.
CREATE OR REPLACE FUNCTION public.advance_wc_tournament(
  p_winner_id     UUID,
  p_loser_id      UUID,
  p_tournament_id UUID,
  p_league_id     UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_queue        UUID[];
  v_opponent_id  UUID;
  v_new_match_id UUID;
BEGIN
  SELECT wc_queue INTO v_queue
  FROM public.tournaments
  WHERE id = p_tournament_id;

  -- Push loser to back first so a 2-team tournament never gets a NULL return.
  v_queue := array_append(COALESCE(v_queue, ARRAY[]::UUID[]), p_loser_id);

  -- Pop the front element as the next challenger.
  v_opponent_id := v_queue[1];

  IF v_opponent_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF cardinality(v_queue) > 1 THEN
    v_queue := v_queue[2:cardinality(v_queue)];
  ELSE
    v_queue := ARRAY[]::UUID[];
  END IF;

  UPDATE public.tournaments
  SET wc_queue = v_queue
  WHERE id = p_tournament_id;

  INSERT INTO public.matches (
    league_id, tournament_id, home_team_id, away_team_id, status, match_date
  ) VALUES (
    p_league_id, p_tournament_id, p_winner_id, v_opponent_id, 'scheduled', NOW()
  )
  RETURNING id INTO v_new_match_id;

  RETURN v_new_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_wc_tournament(UUID, UUID, UUID, UUID) TO anon, authenticated;

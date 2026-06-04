-- ============================================================
-- Backend protection for tournament signups.
--
-- 1. VIP trigger  — blocks non-VIP player_ids from being
--    inserted while the league's signup_status is 'vip_only'.
-- 2. Duplicate guard — partial UNIQUE index on (league_id, player_id)
--    prevents the same player record from appearing more than once
--    in the active signup window.
-- ============================================================


-- ── 1. VIP enforcement trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_signup_vip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signup_status TEXT;
  v_is_vip        BOOLEAN;
BEGIN
  -- Unlisted requests carry no player_id; VIP check is inapplicable.
  IF NEW.player_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT signup_status
    INTO v_signup_status
    FROM public.leagues
   WHERE id = NEW.league_id;

  IF v_signup_status = 'vip_only' THEN
    SELECT is_vip
      INTO v_is_vip
      FROM public.players
     WHERE id = NEW.player_id;

    IF v_is_vip IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'VIP_ONLY: Signup is currently restricted to VIP players only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signup_vip ON public.tournament_signups;

CREATE TRIGGER trg_enforce_signup_vip
  BEFORE INSERT ON public.tournament_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_vip();


-- ── 2. Duplicate player guard ────────────────────────────────────────────────
-- Scoped to (league_id, player_id) rather than (tournament_id, player_id)
-- because tournament_id is nullable — Postgres treats NULL != NULL in unique
-- checks, which would silently allow duplicates whenever tournament_id is NULL.
-- league_id is always set, matching the per-cycle signup window.
-- The WHERE clause excludes NULL player_ids (unlisted requests) so multiple
-- unlisted submissions from different people are still allowed.

CREATE UNIQUE INDEX IF NOT EXISTS tournament_signups_no_duplicate_player
  ON public.tournament_signups (league_id, player_id)
  WHERE player_id IS NOT NULL;

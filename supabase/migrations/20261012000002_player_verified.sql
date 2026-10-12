-- ============================================================
-- Verified players (signed the insurance form).
--
-- Only verified players may be on a signup list — this applies on top of
-- the VIP rule, so a VIP who is not verified is still rejected.
-- Unlisted requests (no player_id) may still be submitted, but the
-- manager can only approve one once the new player is verified, because
-- approval sets player_id, which this trigger also checks.
-- ============================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_signup_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.player_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.player_id IS NOT DISTINCT FROM OLD.player_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = NEW.player_id AND is_verified = TRUE
  ) THEN
    RAISE EXCEPTION 'NOT_VERIFIED: Player has not signed the insurance form';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signup_verified ON public.tournament_signups;
CREATE TRIGGER trg_enforce_signup_verified
  BEFORE INSERT OR UPDATE OF player_id ON public.tournament_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_verified();

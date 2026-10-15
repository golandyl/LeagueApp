-- ============================================================
-- Dedicated goalkeepers.
--
-- A player with position 'GK' only plays in goal. For team balancing
-- they count exactly like a ghost goalkeeper (rating 5, Med stamina),
-- so those values are pinned here regardless of what the client sends.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pin_goalkeeper_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.position = 'GK' THEN
    NEW.rating  := 5;
    NEW.stamina := 'Med';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pin_goalkeeper_rating ON public.players;
CREATE TRIGGER trg_pin_goalkeeper_rating
  BEFORE INSERT OR UPDATE OF position, rating, stamina ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.pin_goalkeeper_rating();

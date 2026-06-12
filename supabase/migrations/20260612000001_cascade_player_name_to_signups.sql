-- ============================================================
-- Cascade player name changes to tournament_signups
-- ============================================================
-- tournament_signups.player_name is a denormalised copy of
-- players.full_name kept for display and matching purposes.
-- When a manager renames a player, this trigger propagates the
-- change to any signup rows that reference that player via
-- player_id, keeping the displayed name in sync automatically.
--
-- match_events already references players through the player_id
-- FK and resolves the current name at query time, so no trigger
-- is needed there.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_player_name_to_signups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    UPDATE public.tournament_signups
       SET player_name = NEW.full_name
     WHERE player_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_player_name_to_signups ON public.players;
CREATE TRIGGER trg_sync_player_name_to_signups
  AFTER UPDATE OF full_name ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_player_name_to_signups();

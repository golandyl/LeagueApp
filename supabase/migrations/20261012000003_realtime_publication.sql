-- ============================================================
-- Enable Realtime for the tables the app subscribes to.
--
-- Only matches and match_events were in the supabase_realtime
-- publication, so every live subscription on leagues,
-- tournament_signups, tournaments and team_players silently never
-- fired — changes only appeared after a page refresh.
-- RLS still applies: each subscriber only receives rows its SELECT
-- policies allow.
-- ============================================================

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['leagues', 'tournament_signups', 'tournaments', 'team_players']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;

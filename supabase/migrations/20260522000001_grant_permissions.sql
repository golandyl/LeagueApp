-- Grant base table privileges to PostgREST roles.
-- RLS policies restrict row-level access, but PostgreSQL requires explicit
-- GRANT before RLS even runs. Without these, the anon/authenticated roles
-- get 42501 (permission denied) before any policy is evaluated.

-- anon: read-only on all tables (RLS further restricts to public leagues)
GRANT SELECT ON public.leagues        TO anon;
GRANT SELECT ON public.players        TO anon;
GRANT SELECT ON public.tournaments    TO anon;
GRANT SELECT ON public.teams          TO anon;
GRANT SELECT ON public.team_players   TO anon;
GRANT SELECT ON public.matches        TO anon;
GRANT SELECT ON public.match_events   TO anon;

-- authenticated: full DML on all tables (RLS restricts to own-league rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_players   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_events   TO authenticated;

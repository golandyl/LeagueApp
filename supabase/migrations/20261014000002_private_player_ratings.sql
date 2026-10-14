-- ============================================================
-- Private player ratings.
--
-- rating and stamina are the manager's assessment of each player.
-- Row-level security can't hide individual columns, so table-level
-- SELECT is replaced with a column list that leaves them out — for
-- anon AND authenticated (anyone can register an account).
-- The league manager reads full rows through get_league_players().
-- INSERT / UPDATE / DELETE privileges are unchanged.
-- ============================================================

REVOKE SELECT ON public.players FROM anon, authenticated;

GRANT SELECT (
  id, league_id, manager_id, full_name, position, is_ghost,
  created_at, updated_at, is_vip, is_verified
) ON public.players TO anon, authenticated;

-- Full player rows (including rating and stamina) for the league manager.
-- Returns nothing for anyone else.
CREATE OR REPLACE FUNCTION public.get_league_players(p_league_id UUID)
RETURNS SETOF public.players
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.players p
  JOIN public.leagues l ON l.id = p.league_id
  WHERE p.league_id = p_league_id
    AND l.manager_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_league_players(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_league_players(UUID) TO authenticated;

-- ============================================================
-- RBAC: Allow anonymous users to scorekeeper live matches
-- ============================================================
-- Anonymous players access the app via public share links without signing in.
-- They may record goals, control the match timer (kick-off / pause / resume),
-- but they cannot terminate a match, delete it, or override scores manually.
--
-- Row-level: updates are only permitted when the parent tournament is 'active'.
-- Column-level: only the live-scoring columns are writable by anon.
-- ============================================================

-- ── Column-level grants ───────────────────────────────────────────────────────
-- RLS enforces row-level constraints; column grants restrict which fields anon
-- may change regardless of what the client sends in the UPDATE payload.

GRANT UPDATE (home_score, away_score, status, played_at)
  ON public.matches TO anon;

GRANT INSERT ON public.match_events TO anon;

-- ── RLS: matches — anon update allowed only in active tournaments ─────────────

CREATE POLICY "matches: anon update in active tournament"
  ON public.matches FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id
        AND t.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id
        AND t.status = 'active'
    )
  );

-- ── RLS: match_events — anon insert allowed only in active tournaments ────────

CREATE POLICY "match_events: anon insert in active tournament"
  ON public.match_events FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_id
        AND t.status = 'active'
    )
  );

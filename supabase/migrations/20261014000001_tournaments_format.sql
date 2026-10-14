-- ============================================================
-- Capture schema drift: tournaments.format was added through the
-- Supabase dashboard, never in a migration. Matches the live column
-- (text, NOT NULL, default 'round_robin'; app uses 'round_robin' and
-- 'winner_continues'). No-op on the live database.
-- ============================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'round_robin';

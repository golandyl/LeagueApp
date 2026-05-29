-- Add per-league default capacity for the signup window.
-- The max_capacity column already exists on tournaments (per-day override).
-- This column stores the league-level default shown on the public signup page.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS max_capacity INTEGER NOT NULL DEFAULT 16
    CHECK (max_capacity > 0);

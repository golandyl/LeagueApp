-- Add 'paused' status to the match_status enum
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'paused';

-- Add paused_at column to store when the referee paused the clock
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

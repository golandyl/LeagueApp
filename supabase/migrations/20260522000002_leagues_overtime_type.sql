ALTER TABLE public.leagues
  ADD COLUMN overtime_type TEXT NOT NULL DEFAULT 'CLASSIC'
  CONSTRAINT overtime_type_valid CHECK (overtime_type IN ('GOLDEN_GOAL', 'CLASSIC'));

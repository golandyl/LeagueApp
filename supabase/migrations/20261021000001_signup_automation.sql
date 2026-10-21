-- ============================================================
-- Signup automation (runs every 5 minutes via pg_cron).
--
-- 1. Auto-reset: at 03:00 local time on the day after a league's
--    signup_date (the matchday), the signup list is cleared, signup
--    closes and the date is removed — even if the manager forgot.
-- 2. Weekly schedule (optional, per league): for the next matchday on
--    the chosen weekday, VIP signup opens N days before at a set time and
--    regular signup opens M days before at a set time. Each step fires
--    once per round (last_*_round), so a manager's manual change
--    afterwards (e.g. closing early) is not overridden.
-- Times are wall-clock in the schedule's timezone (default Israel), so
-- daylight-saving changes are handled.
-- ============================================================

-- ── Schedule table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signup_schedules (
  league_id        UUID        PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  enabled          BOOLEAN     NOT NULL DEFAULT false,
  match_weekday    SMALLINT    NOT NULL DEFAULT 0 CHECK (match_weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  vip_enabled      BOOLEAN     NOT NULL DEFAULT true,
  vip_days_before  SMALLINT    NOT NULL DEFAULT 4 CHECK (vip_days_before  BETWEEN 0 AND 6),
  vip_open_time    TIME        NOT NULL DEFAULT '08:00',
  open_days_before SMALLINT    NOT NULL DEFAULT 2 CHECK (open_days_before BETWEEN 0 AND 6),
  open_time        TIME        NOT NULL DEFAULT '08:00',
  timezone         TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  last_vip_round   DATE,
  last_open_round  DATE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- VIP must open strictly before regular signup
  CONSTRAINT vip_opens_before_regular CHECK (
    NOT vip_enabled
    OR vip_days_before > open_days_before
    OR (vip_days_before = open_days_before AND vip_open_time < open_time)
  )
);

ALTER TABLE public.signup_schedules ENABLE ROW LEVEL SECURITY;

-- Explicit grants (required for new tables from Oct 30 2026). Manager only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_schedules TO authenticated;

DROP POLICY IF EXISTS "signup_schedules: manager all" ON public.signup_schedules;
CREATE POLICY "signup_schedules: manager all"
  ON public.signup_schedules FOR ALL
  TO authenticated
  USING (public.is_league_manager(league_id))
  WITH CHECK (public.is_league_manager(league_id));


-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Clears a league's signup list and rotates the cycle (players' "signed up"
-- state in localStorage goes stale), then applies the given status/date.
CREATE OR REPLACE FUNCTION public.reset_signup_round(
  p_league_id UUID,
  p_status    TEXT,
  p_date      DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tournament_signups WHERE league_id = p_league_id;
  UPDATE public.leagues
     SET signup_status = p_status,
         signup_date   = p_date,
         signup_cycle  = gen_random_uuid()
   WHERE id = p_league_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_signup_round(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;


-- ── The automation ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_signup_automation()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         RECORD;
  v_now     TIMESTAMP;  -- local wall-clock time
  v_round   DATE;       -- next matchday on or after today
  v_vip_at  TIMESTAMP;
  v_open_at TIMESTAMP;
BEGIN
  -- 1. Auto-reset the day after the matchday at 03:00 local.
  FOR r IN
    SELECT l.id, l.signup_date, COALESCE(s.timezone, 'Asia/Jerusalem') AS tz
    FROM public.leagues l
    LEFT JOIN public.signup_schedules s ON s.league_id = l.id
    WHERE l.signup_date IS NOT NULL
  LOOP
    IF (now() AT TIME ZONE r.tz) >= (r.signup_date + 1) + TIME '03:00' THEN
      PERFORM public.reset_signup_round(r.id, 'closed', NULL);
    END IF;
  END LOOP;

  -- 2. Weekly schedules.
  FOR r IN
    SELECT s.*, l.signup_date AS current_date_set, l.signup_status AS current_status
    FROM public.signup_schedules s
    JOIN public.leagues l ON l.id = s.league_id
    WHERE s.enabled
  LOOP
    v_now     := now() AT TIME ZONE r.timezone;
    v_round   := v_now::date + ((r.match_weekday - EXTRACT(DOW FROM v_now)::int + 7) % 7);
    v_open_at := (v_round - r.open_days_before) + r.open_time;
    v_vip_at  := (v_round - r.vip_days_before)  + r.vip_open_time;

    IF v_now >= v_open_at THEN
      IF r.last_open_round IS DISTINCT FROM v_round THEN
        IF r.current_date_set IS DISTINCT FROM v_round THEN
          -- New round (no VIP phase ran for it): start from an empty list.
          PERFORM public.reset_signup_round(r.league_id, 'open', v_round);
        ELSIF r.current_status IS DISTINCT FROM 'open' THEN
          UPDATE public.leagues SET signup_status = 'open' WHERE id = r.league_id;
        END IF;
        UPDATE public.signup_schedules
           SET last_open_round = v_round, last_vip_round = COALESCE(last_vip_round, v_round)
         WHERE league_id = r.league_id;
      END IF;

    ELSIF r.vip_enabled AND v_now >= v_vip_at THEN
      IF r.last_vip_round IS DISTINCT FROM v_round THEN
        IF r.current_date_set IS DISTINCT FROM v_round THEN
          PERFORM public.reset_signup_round(r.league_id, 'vip_only', v_round);
        ELSIF r.current_status = 'closed' THEN
          UPDATE public.leagues SET signup_status = 'vip_only' WHERE id = r.league_id;
        END IF;
        -- Already open (or VIP) for this round, e.g. set manually: never step back.
        UPDATE public.signup_schedules SET last_vip_round = v_round WHERE league_id = r.league_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.run_signup_automation() FROM PUBLIC, anon, authenticated;


-- ── Scheduler ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

-- cron.schedule upserts by job name, so re-running this is safe.
SELECT cron.schedule(
  'signup-automation',
  '*/5 * * * *',
  $cron$ SELECT public.run_signup_automation(); $cron$
);

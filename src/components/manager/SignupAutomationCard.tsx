'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

// The database job (run_signup_automation, every 5 min) does the work; this
// card only edits the league's schedule and previews the next round.
const TIMEZONE = 'Asia/Jerusalem'
const RESET_TIME = '03:00'   // day after the matchday — matches the DB function

interface Props {
  leagueId: string
}

interface Schedule {
  enabled:        boolean
  matchWeekday:   number   // 0 = Sunday
  vipEnabled:     boolean
  vipDaysBefore:  number
  vipTime:        string   // HH:MM
  openDaysBefore: number
  openTime:       string
}

const DEFAULTS: Schedule = {
  enabled: false, matchWeekday: 0, vipEnabled: true,
  vipDaysBefore: 4, vipTime: '08:00', openDaysBefore: 2, openTime: '08:00',
}

// ── Date helpers (date-only values kept as UTC midnights) ──────────────────────

function todayIn(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

export function SignupAutomationCard({ leagueId }: Props) {
  const t      = useTranslations('automation')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const supabase = useMemo(() => createClient(), [])

  const [schedule, setSchedule] = useState<Schedule>(DEFAULTS)
  const [loaded,   setLoaded]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('signup_schedules')
        .select('*')
        .eq('league_id', leagueId)
        .maybeSingle()
      if (data) {
        setSchedule({
          enabled:        data.enabled,
          matchWeekday:   data.match_weekday,
          vipEnabled:     data.vip_enabled,
          vipDaysBefore:  data.vip_days_before,
          vipTime:        data.vip_open_time.slice(0, 5),
          openDaysBefore: data.open_days_before,
          openTime:       data.open_time.slice(0, 5),
        })
      }
      setLoaded(true)
    })()
  }, [leagueId, supabase])

  function update<K extends keyof Schedule>(key: K, value: Schedule[K]) {
    setSchedule(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  // VIP must open strictly before regular signup (also a DB constraint).
  const vipOrderInvalid = schedule.vipEnabled && !(
    schedule.vipDaysBefore > schedule.openDaysBefore ||
    (schedule.vipDaysBefore === schedule.openDaysBefore && schedule.vipTime < schedule.openTime)
  )

  async function handleSave() {
    if (vipOrderInvalid) return
    setSaving(true)
    setError(null)
    const { error: upsertErr } = await supabase.from('signup_schedules').upsert({
      league_id:        leagueId,
      enabled:          schedule.enabled,
      match_weekday:    schedule.matchWeekday,
      vip_enabled:      schedule.vipEnabled,
      vip_days_before:  schedule.vipDaysBefore,
      vip_open_time:    schedule.vipTime,
      open_days_before: schedule.openDaysBefore,
      open_time:        schedule.openTime,
      updated_at:       new Date().toISOString(),
    })
    setSaving(false)
    if (upsertErr) { setError(upsertErr.message); return }
    setSaved(true)
  }

  // ── Preview of the next round ────────────────────────────────────────────────
  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
    // 2026-10-18 was a Sunday
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2026, 9, 18 + i))))
  }, [locale])

  const preview = useMemo(() => {
    const today = todayIn(TIMEZONE)
    const round = addDays(today, (schedule.matchWeekday - today.getUTCDay() + 7) % 7)
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
    return {
      vip:     `${fmt(addDays(round, -schedule.vipDaysBefore))} ${schedule.vipTime}`,
      open:    `${fmt(addDays(round, -schedule.openDaysBefore))} ${schedule.openTime}`,
      match:   fmt(round),
      reset:   `${fmt(addDays(round, 1))} ${RESET_TIME}`,
    }
  }, [schedule, locale])

  if (!loaded) return null

  const selectCls = 'rounded-lg bg-zinc-800 px-2 py-2 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]'
  const dayOptions = Array.from({ length: 7 }, (_, n) => (
    <option key={n} value={n}>{n === 0 ? t('sameDay') : t('daysBefore', { count: n })}</option>
  ))

  return (
    <section className="space-y-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-white">⏱ {t('title')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t('autoResetNote', { time: RESET_TIME })}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={schedule.enabled}
          aria-label={t('enable')}
          onClick={() => update('enabled', !schedule.enabled)}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            schedule.enabled ? 'bg-emerald-500' : 'bg-zinc-600',
          ].join(' ')}
        >
          <span className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            schedule.enabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
          ].join(' ')} />
        </button>
      </div>

      {schedule.enabled && (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
            <span className="font-bold">{t('matchday')}</span>
            <select
              value={schedule.matchWeekday}
              onChange={e => update('matchWeekday', Number(e.target.value))}
              className={selectCls}
            >
              {weekdayNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
          </label>

          <div className="space-y-2 rounded-xl bg-zinc-800/50 p-3">
            <label className="flex items-center gap-2 text-sm font-bold text-amber-400">
              <input
                type="checkbox"
                checked={schedule.vipEnabled}
                onChange={e => update('vipEnabled', e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              ⭐ {t('vipOpens')}
            </label>
            {schedule.vipEnabled && (
              <div className="flex gap-2">
                <select value={schedule.vipDaysBefore} onChange={e => update('vipDaysBefore', Number(e.target.value))} className={`${selectCls} flex-1`}>
                  {dayOptions}
                </select>
                <input type="time" value={schedule.vipTime} onChange={e => update('vipTime', e.target.value)} className={selectCls} required />
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-xl bg-zinc-800/50 p-3">
            <p className="text-sm font-bold text-emerald-400">✅ {t('regularOpens')}</p>
            <div className="flex gap-2">
              <select value={schedule.openDaysBefore} onChange={e => update('openDaysBefore', Number(e.target.value))} className={`${selectCls} flex-1`}>
                {dayOptions}
              </select>
              <input type="time" value={schedule.openTime} onChange={e => update('openTime', e.target.value)} className={selectCls} required />
            </div>
          </div>

          {vipOrderInvalid ? (
            <p className="text-xs font-semibold text-rose-400">{t('vipOrderError')}</p>
          ) : (
            <div className="space-y-1 rounded-xl bg-emerald-950/30 p-3 text-xs text-zinc-300 ring-1 ring-emerald-900/50">
              <p className="font-black uppercase tracking-tight text-emerald-500">{t('nextRound')}</p>
              {schedule.vipEnabled && <p>⭐ {t('previewVip', { when: preview.vip })}</p>}
              <p>✅ {t('previewOpen', { when: preview.open })}</p>
              <p>⚽ {t('previewMatch', { when: preview.match })}</p>
              <p>🧹 {t('previewReset', { when: preview.reset })}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs font-semibold text-rose-400">{error}</p>}

      <button
        type="button"
        onClick={() => { void handleSave() }}
        disabled={saving || vipOrderInvalid}
        className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? tCommon('saving') : saved ? `✓ ${t('saved')}` : t('save')}
      </button>
    </section>
  )
}

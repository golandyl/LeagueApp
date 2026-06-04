'use client'

import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type Signup    = Tables<'tournament_signups'>
type PlayerRef = { id: string; full_name: string; is_vip: boolean }

interface Props {
  leagueId:     string
  signupCycle:  string
  /** Initial status from RSC; real-time subscription keeps it live */
  signupStatus: string
  /** Initial date from RSC; real-time subscription keeps it live */
  signupDate:   string | null
  /** Capacity from leagues.max_capacity; real-time subscription keeps it live */
  maxCapacity:  number
  tournament:   { id: string } | null
  players:      PlayerRef[]
  isManager:    boolean
}

function storageKey(leagueId: string, cycle: string) {
  return `has_signed_up_${leagueId}_${cycle}`
}

export function TournamentSignup({
  leagueId,
  signupCycle,
  signupStatus:  initStatus,
  signupDate:    initDate,
  maxCapacity:   initCap,
  tournament,
  players,
  isManager,
}: Props) {
  const t       = useTranslations('signup')
  const tCommon = useTranslations('common')

  const supabase = useMemo(() => createClient(), [])

  // Live values — kept in sync with the manager's DB updates via realtime
  const [liveStatus, setLiveStatus] = useState(initStatus)
  const [liveDate,   setLiveDate]   = useState(initDate)
  const [liveCap,    setLiveCap]    = useState(initCap)

  const [signups,      setSignups]      = useState<Signup[]>([])
  const [selectedId,   setSelectedId]   = useState('')
  const [unlistedMode, setUnlistedMode] = useState(false)
  const [requestName,  setRequestName]  = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [signedUp,     setSignedUp]     = useState(false)
  const [requestSent,  setRequestSent]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Sync RSC-provided props on hydration
  useEffect(() => { setLiveStatus(initStatus) }, [initStatus])
  useEffect(() => { setLiveDate(initDate)     }, [initDate])
  useEffect(() => { setLiveCap(initCap)       }, [initCap])

  // Check localStorage for current cycle; prune stale keys
  useEffect(() => {
    const currentKey = storageKey(leagueId, signupCycle)
    setSignedUp(!!localStorage.getItem(currentKey))
    const staleKeys = Object.keys(localStorage).filter(
      k => k.startsWith(`has_signed_up_${leagueId}_`) && k !== currentKey,
    )
    staleKeys.forEach(k => localStorage.removeItem(k))
  }, [leagueId, signupCycle])

  // Subscribe to league row updates so the page flips open/closed in real time
  // when the manager toggles the signup window, without a page reload.
  useEffect(() => {
    const channel = supabase
      .channel(`league-meta:${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        (payload) => {
          const row = payload.new as {
            signup_status?: string
            signup_date?:   string | null
            max_capacity?:  number
          }
          if (row.signup_status !== undefined) setLiveStatus(row.signup_status)
          if ('signup_date'   in row) setLiveDate(row.signup_date ?? null)
          if (row.max_capacity !== undefined) setLiveCap(row.max_capacity)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, supabase])

  // Initial fetch of signups
  useEffect(() => {
    supabase
      .from('tournament_signups')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setSignups((data ?? []) as Signup[]))
  }, [leagueId, supabase])

  // Realtime subscription for signups
  useEffect(() => {
    const channel = supabase
      .channel(`signups:${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_signups', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSignups(prev =>
              prev.some(s => s.id === (payload.new as Signup).id)
                ? prev
                : [...prev, payload.new as Signup].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                  ),
            )
          } else if (payload.eventType === 'UPDATE') {
            setSignups(prev =>
              prev.map(s => s.id === (payload.new as Signup).id ? payload.new as Signup : s),
            )
          } else if (payload.eventType === 'DELETE') {
            setSignups(prev => prev.filter(s => s.id !== (payload.old as Signup).id))
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, supabase])

  // Player IDs already signed up via a linked record
  const signedUpPlayerIds = useMemo(
    () => new Set(signups.filter(s => s.player_id).map(s => s.player_id as string)),
    [signups],
  )

  const availablePlayers = useMemo(() => {
    const notSignedUp = players.filter(p => !signedUpPlayerIds.has(p.id))
    return liveStatus === 'vip_only' ? notSignedUp.filter(p => p.is_vip) : notSignedUp
  }, [players, signedUpPlayerIds, liveStatus])

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    if (submitting) return

    const mainSignups = signups.filter(s => !s.is_unlisted_request)
    const activeCount = mainSignups.filter(s => s.status === 'active').length
    const status: 'active' | 'waiting' = activeCount < liveCap ? 'active' : 'waiting'

    setSubmitting(true)
    setError(null)

    try {
      if (unlistedMode) {
        const trimmed = requestName.trim()
        if (!trimmed) return
        const { data: inserted, error: dbErr } = await supabase
          .from('tournament_signups')
          .insert({
            league_id:           leagueId,
            tournament_id:       tournament?.id ?? null,
            player_name:         trimmed,
            requested_name:      trimmed,
            is_unlisted_request: true,
            player_id:           null,
            status:              'active',
          })
          .select()
          .single()
        if (dbErr) throw dbErr
        localStorage.setItem(storageKey(leagueId, signupCycle), 'true')
        // Optimistically append — don't wait for the Realtime INSERT event.
        setSignups(prev =>
          prev.some(s => s.id === (inserted as Signup).id)
            ? prev
            : [...prev, inserted as Signup].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              ),
        )
        setRequestSent(true)
      } else {
        if (!selectedId) return
        const player = players.find(p => p.id === selectedId)
        if (!player) return
        const { data: inserted, error: dbErr } = await supabase
          .from('tournament_signups')
          .insert({
            league_id:           leagueId,
            tournament_id:       tournament?.id ?? null,
            player_name:         player.full_name,
            player_id:           player.id,
            is_unlisted_request: false,
            status,
          })
          .select()
          .single()
        if (dbErr) throw dbErr
        localStorage.setItem(storageKey(leagueId, signupCycle), 'true')
        // Optimistically append — don't wait for the Realtime INSERT event.
        setSignups(prev =>
          prev.some(s => s.id === (inserted as Signup).id)
            ? prev
            : [...prev, inserted as Signup].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              ),
        )
        setSignedUp(true)
        setSelectedId('')
      }
    } catch (err) {
      const pgCode = (err as { code?: string }).code
      const pgMsg  = (err as { message?: string }).message ?? ''
      if (pgCode === '23505') {
        setError("You're already signed up for this session.")
      } else if (pgMsg.includes('VIP_ONLY')) {
        setError('Signup is currently restricted to VIP players only.')
      } else {
        setError(err instanceof Error ? pgMsg : tCommon('error'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(signup: Signup) {
    const wasActive    = signup.status === 'active' && !signup.is_unlisted_request
    const firstWaiting = wasActive
      ? signups
          .filter(s => s.status === 'waiting' && s.id !== signup.id && !s.is_unlisted_request)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
      : undefined

    const { error: delErr } = await supabase
      .from('tournament_signups').delete().eq('id', signup.id)
    if (delErr) return

    setSignups(prev => prev.filter(s => s.id !== signup.id))

    if (firstWaiting) {
      const { error: promoteErr } = await supabase
        .from('tournament_signups').update({ status: 'active' }).eq('id', firstWaiting.id)
      if (!promoteErr) {
        setSignups(prev =>
          prev.map(s => s.id === firstWaiting.id ? { ...s, status: 'active' as const } : s),
        )
      }
    }
  }

  const mainSignups    = signups.filter(s => !s.is_unlisted_request)
  const activeSignups  = mainSignups.filter(s => s.status === 'active')
  const waitingSignups = mainSignups.filter(s => s.status === 'waiting')
  const isFull         = activeSignups.length >= liveCap

  const formattedDate = liveDate
    ? new Intl.DateTimeFormat('en', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
      }).format(new Date(liveDate + 'T12:00:00Z'))
    : null

  // ── Closed state (non-managers only) ───────────────────────────────────────
  if (liveStatus === 'closed' && !isManager) {
    return (
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-700" aria-hidden="true" />
          <h2 className="text-xs font-black uppercase tracking-tight text-zinc-500">
            {t('closed')}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-zinc-600">{t('closedDesc')}</p>

        <div className="space-y-1 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-black uppercase tracking-tight text-zinc-500">
              {t('registeredPlayers')}
            </p>
            <span className="text-xs font-bold tabular-nums text-zinc-600">
              {activeSignups.length} / {liveCap}
            </span>
          </div>
          {activeSignups.length === 0 ? (
            <p className="py-1 text-center text-sm text-zinc-700">{t('emptyHint')}</p>
          ) : (
            activeSignups.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 border-b border-zinc-800/60 px-1 py-2 last:border-0">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-700">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-zinc-400">{s.player_name}</span>
              </div>
            ))
          )}
        </div>
      </section>
    )
  }

  // ── Open state ─────────────────────────────────────────────────────────────
  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-black uppercase tracking-tight text-zinc-500">
            {t('title')}
          </h2>
          {formattedDate && (
            <p className="mt-0.5 text-[11px] font-black uppercase tracking-tight text-emerald-500">
              {t('openFor')}: {formattedDate}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-bold tabular-nums text-zinc-400">
          {activeSignups.length}/{liveCap}
        </span>
      </div>

      {/* VIP-only phase notice */}
      {liveStatus === 'vip_only' && (
        <div className="flex items-center gap-2.5 rounded-lg bg-amber-950/40 px-3 py-2.5 ring-1 ring-amber-800/40">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase tracking-tight text-amber-400">
              {t('vipOnly')}
            </p>
            <p className="text-[11px] text-amber-600/80">{t('vipOnlyDesc')}</p>
          </div>
        </div>
      )}

      {/* Form / confirmation */}
      {signedUp ? (
        <p className="rounded-lg bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-400 ring-1 ring-emerald-800/40">
          {t('alreadySignedUp')}
        </p>
      ) : requestSent ? (
        <p className="rounded-lg bg-amber-950/40 px-4 py-3 text-sm font-semibold text-amber-400 ring-1 ring-amber-800/40">
          {t('requestSent')}
        </p>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-3">
          {!unlistedMode ? (
            <>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                disabled={availablePlayers.length === 0}
                className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                <option value="" disabled>
                  {availablePlayers.length === 0 ? t('noPlayersAvailable') : t('selectPlaceholder')}
                </option>
                {availablePlayers.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={submitting || !selectedId}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-black text-white transition-all active:scale-95 active:bg-emerald-700 disabled:opacity-40"
              >
                {submitting ? t('signingUp') : t('signUpButton')}
              </button>
              {liveStatus !== 'vip_only' && (
                <button
                  type="button"
                  onClick={() => setUnlistedMode(true)}
                  className="w-full text-center text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  {t('notOnList')}
                </button>
              )}
            </>
          ) : (
            <>
              <input
                type="text"
                value={requestName}
                onChange={e => setRequestName(e.target.value)}
                placeholder={t('requestNamePlaceholder')}
                maxLength={64}
                autoComplete="name"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={submitting || !requestName.trim()}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-black text-white transition-all active:scale-95 active:bg-emerald-700 disabled:opacity-40"
              >
                {submitting ? t('signingUp') : t('requestButton')}
              </button>
              <button
                type="button"
                onClick={() => { setUnlistedMode(false); setRequestName('') }}
                className="w-full text-center text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-400"
              >
                {t('backToList')}
              </button>
            </>
          )}
        </form>
      )}

      {isFull && !signedUp && !requestSent && !unlistedMode && (
        <p className="text-xs text-amber-500">{t('full')}</p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* ── Registered players — always rendered in the DOM ──────────
          This section is unconditional so it is visible immediately,
          even before anyone has signed up (shows 0 / cap).           */}
      <div className="border-t border-zinc-800 pt-4 space-y-2">

        {/* Section header + live count */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-black uppercase tracking-tight text-zinc-400">
            {t('registeredPlayers')}
          </h3>
          <span className="text-xs font-bold tabular-nums text-zinc-500">
            {activeSignups.length} / {liveCap}
          </span>
        </div>

        {/* Active lineup */}
        {activeSignups.length === 0 ? (
          <p className="py-2 text-center text-sm text-zinc-700">{t('emptyHint')}</p>
        ) : (
          activeSignups.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-2 border-b border-zinc-800 px-1 py-2 last:border-0"
            >
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-700">
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-white">{s.player_name}</span>
              {isManager && (
                <button
                  onClick={() => handleRemove(s)}
                  aria-label={t('removeAriaLabel')}
                  className="shrink-0 rounded-full p-1 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-red-400 active:scale-90"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))
        )}

        {/* Waiting room — only shown when there are waitlisted players */}
        {waitingSignups.length > 0 && (
          <div className="pt-1">
            <p className="mb-1.5 text-xs font-bold text-amber-700">{t('waitingRoom')}</p>
            {waitingSignups.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-2 border-b border-zinc-800 px-1 py-2 last:border-0"
              >
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-amber-800">
                  {activeSignups.length + i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-zinc-400">{s.player_name}</span>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-amber-700">
                  {t('waitingBadge')}
                </span>
                {isManager && (
                  <button
                    onClick={() => handleRemove(s)}
                    aria-label={t('removeAriaLabel')}
                    className="shrink-0 rounded-full p-1 text-amber-800 transition-colors hover:bg-amber-950/40 hover:text-red-400 active:scale-90"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </section>
  )
}

function TrashIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

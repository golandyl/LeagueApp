'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations, useLocale }   from 'next-intl'
import { useParams }                    from 'next/navigation'
import { createClient }                 from '@/lib/supabase/client'
import type { Tables }                  from '@/types/database'

type Signup = Tables<'tournament_signups'>

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
const STAMINAS  = ['Low', 'Med', 'High'] as const
type Position = typeof POSITIONS[number]
type Stamina  = typeof STAMINAS[number]

export interface SignupControlPanelProps {
  leagueId:     string
  signupStatus: string
  signupDate:   string | null
  maxCapacity:  number
}

export function SignupControlPanel({
  leagueId,
  signupStatus: initStatus,
  signupDate:   initDate,
  maxCapacity:  initCap,
}: SignupControlPanelProps) {
  const t      = useTranslations('signupControl')
  const locale = useLocale()
  const params = useParams()
  const supabase = useMemo(() => createClient(), [])

  // ── Core state ──────────────────────────────────────────────────────────────
  const [status,          setStatus]          = useState(initStatus)
  const [date,            setDate]            = useState(initDate ?? '')
  const [capacity,        setCapacity]        = useState(String(initCap))
  const [saving,          setSaving]          = useState(false)
  const [clearing,        setClearing]        = useState(false)
  const [copied,          setCopied]          = useState(false)
  const [removing,        setRemoving]        = useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = useState<Signup | null>(null)
  const [signups,         setSignups]         = useState<Signup[]>([])

  // Sync when the RSC page refreshes and passes new props
  useEffect(() => { setStatus(initStatus)       }, [initStatus])
  useEffect(() => { setDate(initDate ?? '')      }, [initDate])
  useEffect(() => { setCapacity(String(initCap)) }, [initCap])

  // ── Real-time: league row ────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`scp-league:${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        ({ new: row }) => {
          const r = row as { signup_status?: string; signup_date?: string | null; max_capacity?: number }
          if (r.signup_status !== undefined) setStatus(r.signup_status)
          if ('signup_date' in r)            setDate(r.signup_date ?? '')
          if (r.max_capacity !== undefined)  setCapacity(String(r.max_capacity))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [leagueId, supabase])

  // ── Real-time: signups ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('tournament_signups')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setSignups((data ?? []) as Signup[]))
  }, [leagueId, supabase])

  useEffect(() => {
    const ch = supabase
      .channel(`scp-signups:${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_signups', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSignups(prev =>
              prev.some(s => s.id === (payload.new as Signup).id) ? prev :
              [...prev, payload.new as Signup].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              ),
            )
          } else if (payload.eventType === 'UPDATE') {
            setSignups(prev => prev.map(s =>
              s.id === (payload.new as Signup).id ? payload.new as Signup : s,
            ))
          } else if (payload.eventType === 'DELETE') {
            setSignups(prev => prev.filter(s => s.id !== (payload.old as Signup).id))
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [leagueId, supabase])

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function openSignup(newStatus: 'vip_only' | 'open') {
    const cap      = Math.max(1, parseInt(capacity, 10) || 16)
    const safeDate = date.trim() || null
    const prevStat = status
    setCapacity(String(cap))
    setStatus(newStatus)
    setSaving(true)

    const payload = { signup_status: newStatus, max_capacity: cap, signup_date: safeDate }
    const { error } = await supabase.from('leagues').update(payload).eq('id', leagueId)
    if (error) {
      console.error('Supabase update failed:', error, '| Payload:', payload)
      setStatus(prevStat)
    }
    setSaving(false)
  }

  async function closeSignup() {
    const prevStat = status
    setStatus('closed')
    setSaving(true)
    const { error } = await supabase
      .from('leagues')
      .update({ signup_status: 'closed' })
      .eq('id', leagueId)
    if (error) {
      console.error('Supabase close failed:', error)
      setStatus(prevStat)
    }
    setSaving(false)
  }

  function copySignupLink() {
    const urlLocale    = (params?.locale as string | undefined) ?? locale
    const generatedUrl = `${window.location.origin}/${urlLocale}/league/${leagueId}/signup`
    navigator.clipboard.writeText(generatedUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
      .catch(() => {})
  }

  // Remove a single signup; if the removed player was active, promote the
  // first waiting player into the active slot.
  async function removeSignup(signup: Signup) {
    setRemoving(signup.id)

    const firstWaiting = signup.status === 'active' ? waitingSignups[0] : undefined

    const { error: delErr } = await supabase
      .from('tournament_signups')
      .delete()
      .eq('id', signup.id)

    if (delErr) {
      console.error('Failed to remove signup:', delErr)
      setRemoving(null)
      return
    }

    if (firstWaiting) {
      await supabase
        .from('tournament_signups')
        .update({ status: 'active' })
        .eq('id', firstWaiting.id)
    }

    setRemoving(null)
  }

  async function clearSignups() {
    if (!window.confirm('האם אתה בטוח שברצונך לנקות את רשימת ההרשמה הקיימת?')) return
    setClearing(true)

    const { error: delErr } = await supabase
      .from('tournament_signups')
      .delete()
      .eq('league_id', leagueId)

    if (delErr) {
      console.error('Failed to clear signups:', delErr)
      setClearing(false)
      return
    }

    // Rotate the signup_cycle so all players' localStorage keys go stale.
    const { error: cycleErr } = await supabase
      .from('leagues')
      .update({ signup_cycle: crypto.randomUUID() })
      .eq('id', leagueId)

    if (cycleErr) console.error('Failed to rotate signup cycle:', cycleErr)

    setClearing(false)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isOpen         = status === 'open' || status === 'vip_only'
  const isVipOnly      = status === 'vip_only'
  const cap            = Math.max(1, parseInt(capacity, 10) || 16)
  const mainSignups    = signups.filter(s => !s.is_unlisted_request)
  const activeSignups  = mainSignups.filter(s => s.status === 'active')
  const waitingSignups = mainSignups.filter(s => s.status === 'waiting')
  const unlistedReqs   = signups.filter(s => s.is_unlisted_request)

  const formattedDate = date
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
      }).format(new Date(date + 'T12:00:00Z'))
    : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <section className="space-y-3">

      {/* Section heading + status badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-tight text-zinc-400">
          {t('sectionTitle')}
        </h2>
        <span className={[
          'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-tight',
          status === 'open'     ? 'bg-emerald-500/20 text-emerald-400' :
          status === 'vip_only' ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-zinc-800 text-zinc-500',
        ].join(' ')}>
          {status === 'open' ? t('statusOpen') : status === 'vip_only' ? t('statusVipOnly') : t('statusClosed')}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">

        {/* ── CLOSED STATE: date/capacity inputs + two open buttons ─────── */}
        {!isOpen && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-tight text-zinc-600">
                  {t('matchdayDate')}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-tight text-zinc-600">
                  {t('maxPlayers')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => openSignup('vip_only')}
                disabled={saving || clearing}
                className="rounded-lg bg-amber-600 py-3 text-sm font-black text-white transition-all hover:bg-amber-500 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? t('saving') : t('openVipSignups')}
              </button>
              <button
                onClick={() => openSignup('open')}
                disabled={saving || clearing}
                className="rounded-lg bg-emerald-600 py-3 text-sm font-black text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? t('saving') : t('openRegularSignups')}
              </button>
            </div>

            <button
              onClick={clearSignups}
              disabled={clearing || saving}
              className="w-full rounded-lg border border-zinc-700 py-2.5 text-xs font-black text-zinc-500 transition-all hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-400 active:scale-[0.98] disabled:opacity-40"
            >
              {clearing ? t('clearing') : t('clearList')}
            </button>
          </>
        )}

        {/* ── OPEN STATE: live summary + action buttons ───────────────────── */}
        {isOpen && (
          <>
            {/* Live summary */}
            <div className={[
              'flex items-start gap-3 rounded-lg px-4 py-3 ring-1',
              isVipOnly ? 'bg-amber-950/30 ring-amber-900/50' : 'bg-emerald-950/30 ring-emerald-900/50',
            ].join(' ')}>
              <span className={[
                'mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full',
                isVipOnly ? 'bg-amber-400' : 'bg-emerald-400',
              ].join(' ')} aria-hidden="true" />
              <div>
                <p className={[
                  'text-[10px] font-black uppercase tracking-tight',
                  isVipOnly ? 'text-amber-500' : 'text-emerald-500',
                ].join(' ')}>
                  {isVipOnly ? t('liveVipLabel') : t('liveLabel')}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-200">
                  {formattedDate
                    ? t('liveSummary', { date: formattedDate, cap })
                    : t('liveSummaryNoDate', { cap })}
                </p>
              </div>
            </div>

            {/* Direct VIP → Open transition (no round-trip through closed) */}
            {isVipOnly && (
              <button
                onClick={() => openSignup('open')}
                disabled={saving || clearing}
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-black text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? t('saving') : t('openRegularSignups')}
              </button>
            )}

            {/* Copy link + Close */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copySignupLink}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 py-2.5 text-sm font-black text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-[0.98]"
              >
                {copied ? (
                  <><span className="text-emerald-400 me-1">✓</span>{t('linkCopied')}</>
                ) : (
                  <><ShareIcon />{t('copySignupLink')}</>
                )}
              </button>
              <button
                onClick={closeSignup}
                disabled={saving || clearing}
                className="flex items-center justify-center rounded-lg bg-zinc-800 py-2.5 text-sm font-black text-zinc-300 transition-all hover:bg-zinc-700 hover:text-white active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? t('saving') : t('closeSignups')}
              </button>
            </div>

            <button
              onClick={clearSignups}
              disabled={clearing || saving}
              className="w-full rounded-lg border border-zinc-700 py-2.5 text-xs font-black text-zinc-500 transition-all hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-400 active:scale-[0.98] disabled:opacity-40"
            >
              {clearing ? t('clearing') : t('clearList')}
            </button>
          </>
        )}

      </div>

      {/* ── Signup roster with per-player removal ─────────────────────────── */}
      {mainSignups.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-tight text-zinc-600">
              {t('currentSignups')}
            </p>
            <span className="text-xs font-bold tabular-nums text-zinc-500">
              {activeSignups.length}/{cap}
            </span>
          </div>

          <div className="space-y-0.5">
            {activeSignups.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 px-1 py-1">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-700">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-zinc-300">{s.player_name}</span>
                <button
                  onClick={() => removeSignup(s)}
                  disabled={removing !== null}
                  aria-label={t('removeSignup')}
                  className="shrink-0 rounded-full p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400 active:scale-90 disabled:opacity-40"
                >
                  {removing === s.id ? <MiniSpinner /> : <XMarkIcon />}
                </button>
              </div>
            ))}

            {waitingSignups.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 px-1 py-1">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-amber-800">
                  {activeSignups.length + i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-zinc-500">{s.player_name}</span>
                <span className="shrink-0 text-[10px] font-black uppercase text-amber-700">
                  {t('waitingBadge')}
                </span>
                <button
                  onClick={() => removeSignup(s)}
                  disabled={removing !== null}
                  aria-label={t('removeSignup')}
                  className="shrink-0 rounded-full p-1 text-amber-900/60 transition-colors hover:bg-zinc-800 hover:text-red-400 active:scale-90 disabled:opacity-40"
                >
                  {removing === s.id ? <MiniSpinner /> : <XMarkIcon />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unlisted join-request approval banner ─────────────────────────── */}
      {unlistedReqs.length > 0 && (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-tight text-amber-400">
              {t('pendingRequests', { count: unlistedReqs.length })}
            </p>
          </div>
          <div className="space-y-2">
            {unlistedReqs.map(req => (
              <div key={req.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold text-zinc-300">
                  {req.requested_name ?? req.player_name}
                </span>
                <button
                  onClick={() => setPendingApproval(req)}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white transition-all hover:bg-emerald-500 active:scale-95"
                >
                  {t('approveAndAdd')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Approve-and-create modal ─────────────────────────────────────── */}
      {pendingApproval && (
        <ApproveAndCreateModal
          signup={pendingApproval}
          leagueId={leagueId}
          activeCount={activeSignups.length}
          cap={cap}
          onClose={() => setPendingApproval(null)}
        />
      )}

    </section>
  )
}

// ── ApproveAndCreateModal ─────────────────────────────────────────────────────
// Opens when the manager clicks "Approve & Add" on an unlisted request.
// Pre-fills the name from the request; the manager completes the player card.
// On save: inserts the real player record and promotes the pending signup row.

interface ApproveAndCreateModalProps {
  signup:      Signup
  leagueId:    string
  activeCount: number
  cap:         number
  onClose:     () => void
}

function ApproveAndCreateModal({ signup, leagueId, activeCount, cap, onClose }: ApproveAndCreateModalProps) {
  const t       = useTranslations('players')
  const tSCP    = useTranslations('signupControl')
  const tCommon = useTranslations('common')
  const supabase = useMemo(() => createClient(), [])

  const requestedName = (signup.requested_name ?? signup.player_name).trim()

  const [name,     setName]     = useState(requestedName)
  const [rating,   setRating]   = useState(5)
  const [position, setPosition] = useState<Position>('MID')
  const [stamina,  setStamina]  = useState<Stamina>('Med')
  const [isVip,    setIsVip]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    // 1. Insert the real player record.
    const { data: newPlayer, error: playerErr } = await supabase
      .from('players')
      .insert({
        full_name: name.trim(),
        league_id: leagueId,
        position,
        rating,
        stamina,
        is_ghost: false,
        is_vip:   isVip,
      })
      .select('id')
      .single()

    if (playerErr || !newPlayer) {
      setError(playerErr?.message ?? 'Failed to create player')
      setSaving(false)
      return
    }

    // 2. Promote the pending unlisted row into a proper signup.
    //    Use the active count captured when the modal opened to decide the slot.
    const signupStatus: 'active' | 'waiting' = activeCount < cap ? 'active' : 'waiting'

    const { error: linkErr } = await supabase
      .from('tournament_signups')
      .update({
        player_id:           newPlayer.id,
        player_name:         name.trim(),
        is_unlisted_request: false,
        status:              signupStatus,
      })
      .eq('id', signup.id)

    if (linkErr) {
      setError(linkErr.message)
      setSaving(false)
      return
    }

    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-zinc-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div>
            <h2 className="text-base font-black text-white">{tSCP('createAndAdd')}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {tSCP('requestedAs')}:{' '}
              <span className="font-semibold text-zinc-400">{requestedName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('cancel')}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <XMarkIcon />
          </button>
        </div>

        <div className="h-px bg-zinc-800 mx-6" />

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('fullName')}
            required
            autoFocus
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-emerald-500"
          />

          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">{t('rating')}</p>
              <input
                type="number"
                value={rating}
                onChange={e => setRating(Number(e.target.value))}
                min={1} max={10}
                required
                className="w-full rounded-xl bg-zinc-800 px-3 py-3 text-center text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">{t('position')}</p>
              <select
                value={position}
                onChange={e => setPosition(e.target.value as Position)}
                className="w-full rounded-xl bg-zinc-800 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">{t('stamina')}</p>
              <select
                value={stamina}
                onChange={e => setStamina(e.target.value as Stamina)}
                className="w-full rounded-xl bg-zinc-800 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {STAMINAS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* VIP toggle */}
          <div className="flex items-center justify-between rounded-xl bg-zinc-800 px-4 py-3">
            <span className="text-sm font-bold text-zinc-300">{t('vipToggle')}</span>
            <button
              type="button"
              onClick={() => setIsVip(v => !v)}
              role="switch"
              aria-checked={isVip}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                isVip ? 'bg-amber-500' : 'bg-zinc-600',
              ].join(' ')}
            >
              <span className={[
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
                isVip ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
              ].join(' ')} />
            </button>
          </div>

          {error && (
            <p className="rounded-xl bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-bold text-zinc-300 active:bg-zinc-700"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white transition-all active:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? tCommon('saving') : tSCP('createAndAdd')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 me-1"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  )
}

function XMarkIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function MiniSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

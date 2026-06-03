'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations, useLocale }   from 'next-intl'
import { useParams }                    from 'next/navigation'
import { createClient }                 from '@/lib/supabase/client'
import type { Tables }                  from '@/types/database'

type Signup = Tables<'tournament_signups'>

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
  const t       = useTranslations('signupControl')
  const locale  = useLocale()                              // for date display
  const params  = useParams()                              // for URL construction
  const supabase = useMemo(() => createClient(), [])

  // ── Core state ──────────────────────────────────────────────────────────────
  const [status,    setStatus]    = useState(initStatus)
  const [date,      setDate]      = useState(initDate ?? '')
  const [capacity,  setCapacity]  = useState(String(initCap))
  const [saving,    setSaving]    = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [signups,   setSignups]   = useState<Signup[]>([])

  // Sync when the RSC page refreshes and passes new props
  useEffect(() => { setStatus(initStatus)       }, [initStatus])
  useEffect(() => { setDate(initDate ?? '')      }, [initDate])
  useEffect(() => { setCapacity(String(initCap)) }, [initCap])

  // ── Real-time: league row ────────────────────────────────────────────────────
  // Keeps the panel in sync if the manager has multiple tabs open.
  useEffect(() => {
    const ch = supabase
      .channel(`scp-league:${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        ({ new: row }) => {
          const r = row as { signup_status?: string; signup_date?: string | null; max_capacity?: number }
          if (r.signup_status !== undefined)  setStatus(r.signup_status)
          if ('signup_date' in r)             setDate(r.signup_date ?? '')
          if (r.max_capacity !== undefined)   setCapacity(String(r.max_capacity))
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
    // Use params.locale (from URL) — reliable even before middleware fully runs.
    const urlLocale    = (params?.locale as string | undefined) ?? locale
    const generatedUrl = `${window.location.origin}/${urlLocale}/league/${leagueId}/signup`
    console.log('Generated Public Link:', generatedUrl)
    navigator.clipboard.writeText(generatedUrl)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => { /* clipboard unavailable in non-secure context */ })
  }

  async function approveRequest(signup: Signup) {
    const name = (signup.requested_name ?? signup.player_name).trim()
    setApproving(signup.id)

    const { data: newPlayer, error: playerErr } = await supabase
      .from('players')
      .insert({ full_name: name, league_id: leagueId, position: 'MID', rating: 5, stamina: 'Med' })
      .select('id')
      .single()

    if (playerErr || !newPlayer) {
      console.error('Failed to add player:', playerErr)
      setApproving(null)
      return
    }

    const { error: linkErr } = await supabase
      .from('tournament_signups')
      .update({ player_id: newPlayer.id, is_unlisted_request: false })
      .eq('id', signup.id)
    if (linkErr) console.error('Failed to link signup:', linkErr)

    setApproving(null)
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

    // Rotate the signup_cycle so all players' localStorage keys go stale,
    // allowing everyone to sign up fresh for the next matchday.
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

        {/* ── CLOSED STATE: inputs + open button ─────────────────────────── */}
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

        {/* ── OPEN STATE: live summary + copy/close row ───────────────────── */}
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

            {/* Copy link + Close — side by side */}
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

      {/* ── Current signup roster (manager read-only view) ─────────────────── */}
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
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-700">{i + 1}</span>
                <span className="flex-1 text-sm font-semibold text-zinc-300">{s.player_name}</span>
              </div>
            ))}
            {waitingSignups.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 px-1 py-1">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-amber-800">
                  {activeSignups.length + i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-zinc-500">{s.player_name}</span>
                <span className="text-[10px] font-black uppercase text-amber-700">{t('waitingBadge')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unlisted join-request approval banner ──────────────────────────── */}
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
                  onClick={() => approveRequest(req)}
                  disabled={approving === req.id}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                >
                  {approving === req.id ? t('approving') : t('approveAndAdd')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </section>
  )
}

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

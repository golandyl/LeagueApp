'use client'

import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type Signup = Tables<'tournament_signups'>

interface Props {
  leagueId:    string
  tournament:  { id: string; max_capacity: number } | null
  isManager:   boolean
}

function storageKey(leagueId: string) {
  return `has_signed_up_${leagueId}`
}

export function TournamentSignup({ leagueId, tournament, isManager }: Props) {
  const t      = useTranslations('signup')
  const tCommon = useTranslations('common')

  const supabase = useMemo(() => createClient(), [])
  const maxCap   = tournament?.max_capacity ?? 16

  const [signups,    setSignups]    = useState<Signup[]>([])
  const [name,       setName]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signedUp,   setSignedUp]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Check localStorage on first client render only
  useEffect(() => {
    setSignedUp(!!localStorage.getItem(storageKey(leagueId)))
  }, [leagueId])

  // Initial fetch — ordered by created_at so the list is stable
  useEffect(() => {
    supabase
      .from('tournament_signups')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setSignups((data ?? []) as Signup[]))
  }, [leagueId, supabase])

  // Realtime subscription — keeps the list in sync across all open devices
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

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const activeCount = signups.filter(s => s.status === 'active').length
      const status: 'active' | 'waiting' = activeCount < maxCap ? 'active' : 'waiting'

      const { error: dbErr } = await supabase
        .from('tournament_signups')
        .insert({
          league_id:     leagueId,
          tournament_id: tournament?.id ?? null,
          player_name:   trimmed,
          status,
        })

      if (dbErr) throw dbErr

      localStorage.setItem(storageKey(leagueId), 'true')
      setSignedUp(true)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(signup: Signup) {
    const wasActive = signup.status === 'active'
    // Capture the first waiting person before state changes
    const firstWaiting = wasActive
      ? signups
          .filter(s => s.status === 'waiting' && s.id !== signup.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
      : undefined

    const { error: delErr } = await supabase
      .from('tournament_signups')
      .delete()
      .eq('id', signup.id)

    if (delErr) return

    // Realtime handles the DELETE state update; promote waiting → active if needed
    if (firstWaiting) {
      await supabase
        .from('tournament_signups')
        .update({ status: 'active' })
        .eq('id', firstWaiting.id)
      // Realtime UPDATE event handles the state update for the promoted row
    }
  }

  const activeSignups  = signups.filter(s => s.status === 'active')
  const waitingSignups = signups.filter(s => s.status === 'waiting')
  const isFull         = activeSignups.length >= maxCap

  return (
    <section className="space-y-4 rounded-2xl bg-slate-800 p-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
          {t('title')}
        </h2>
        <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-bold tabular-nums text-slate-400">
          {activeSignups.length}/{maxCap}
        </span>
      </div>

      {/* Sign-up form or confirmation */}
      {signedUp ? (
        <p className="rounded-xl bg-emerald-900/30 px-4 py-3 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-700/40">
          {t('alreadySignedUp')}
        </p>
      ) : (
        <form onSubmit={handleSignUp} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={64}
            autoComplete="name"
            className="min-w-0 flex-1 rounded-xl bg-slate-700 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="shrink-0 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white transition-all active:scale-95 active:bg-sky-700 disabled:opacity-40"
          >
            {submitting ? t('signingUp') : t('signUpButton')}
          </button>
        </form>
      )}

      {isFull && !signedUp && (
        <p className="text-xs text-amber-400">{t('full')}</p>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Active list */}
      {activeSignups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-400">
            {t('attending', { count: activeSignups.length, max: maxCap })}
          </p>
          {activeSignups.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg bg-slate-700/50 px-3 py-2"
            >
              <span className="w-4 shrink-0 text-right text-xs font-bold tabular-nums text-slate-500">
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-white">{s.player_name}</span>
              {isManager && (
                <button
                  onClick={() => handleRemove(s)}
                  aria-label={t('removeAriaLabel')}
                  className="shrink-0 rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-600 hover:text-red-400 active:scale-90"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Waiting list */}
      {waitingSignups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-amber-500">
            {t('waitingList', { count: waitingSignups.length })}
          </p>
          {waitingSignups.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg bg-amber-900/20 px-3 py-2 ring-1 ring-amber-700/30"
            >
              <span className="w-4 shrink-0 text-right text-xs font-bold tabular-nums text-amber-700">
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-amber-200">{s.player_name}</span>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-amber-600">
                {t('waitingBadge')}
              </span>
              {isManager && (
                <button
                  onClick={() => handleRemove(s)}
                  aria-label={t('removeAriaLabel')}
                  className="shrink-0 rounded-full p-1 text-amber-700 transition-colors hover:bg-amber-900/40 hover:text-red-400 active:scale-90"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {signups.length === 0 && (
        <p className="py-2 text-center text-sm text-slate-600">{t('emptyHint')}</p>
      )}
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

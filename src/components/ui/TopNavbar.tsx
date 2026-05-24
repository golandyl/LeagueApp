'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { LanguageSwitcher } from './LanguageSwitcher'

export function TopNavbar() {
  const t        = useTranslations('nav')
  // usePathname from next-intl returns the locale-stripped path,
  // e.g. "/manager-dashboard/abc123" not "/en/manager-dashboard/abc123"
  const pathname = usePathname()

  // Auth pages are standalone full-screen flows — no nav needed there.
  if (pathname === '/login' || pathname === '/register') return null

  const segments = pathname.split('/').filter(Boolean)
  const root     = segments[0] ?? ''

  // Determine whether a "← Dashboard" shortcut should appear.
  // We can only produce the link when the leagueId is available in the URL.
  //   /manager-dashboard/[leagueId]     → user is already on the dashboard
  //   /league/[leagueId]/standings      → show back-link
  //   /league/[leagueId]/players        → show back-link
  // Match and draft pages don't carry the leagueId in the URL, so no link there.
  const isOnDashboard    = root === 'manager-dashboard'
  const isOnLeaguePage   = root === 'league' && segments.length >= 2
  const leagueId: string | null =
    isOnDashboard  ? (segments[1] ?? null) :
    isOnLeaguePage ? (segments[1] ?? null) :
    null
  const showDashboardLink = leagueId !== null && !isOnDashboard

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-lg items-center justify-between gap-4 px-4">

        {/* ── Start: logo / home ─────────────────────────────────────────── */}
        <Link
          href="/"
          aria-label={t('home')}
          className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 transition-opacity hover:opacity-75 active:opacity-60"
        >
          <span className="text-2xl leading-none" aria-hidden="true">⚽</span>
          {/* Brand name is always in English — intentional for a named product */}
          <span className="hidden font-black tracking-tight text-white sm:inline">
            Sunday League
          </span>
        </Link>

        {/* ── End: optional back-link + language switcher ────────────────── */}
        <div className="flex items-center gap-2">
          {showDashboardLink && (
            <Link
              href={`/manager-dashboard/${leagueId}`}
              className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white active:bg-slate-600"
            >
              {/* Chevron flips in RTL via rtl:rotate-180 */}
              <svg
                className="h-4 w-4 shrink-0 rtl:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {t('dashboard')}
            </Link>
          )}

          <LanguageSwitcher />
        </div>

      </div>
    </header>
  )
}

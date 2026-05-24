'use client'

import { useState, useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'

const LOCALES = [
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'he', label: 'עברית',   flag: '🇮🇱' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'ru', label: 'Русский',  flag: '🇷🇺' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'zh', label: '中文',     flag: '🇨🇳' },
] as const

export function LanguageSwitcher() {
  const locale   = useLocale()
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const current = LOCALES.find(l => l.code === locale) ?? LOCALES[0]

  function switchLocale(code: string) {
    router.replace(pathname, { locale: code })
    setOpen(false)
  }

  return (
    // `relative` so the dropdown positions relative to this wrapper (not fixed).
    // z-50 on the dropdown ensures it floats above page content within the
    // navbar's stacking context while remaining below fixed full-screen modals.
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Switch language"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/90 px-3 py-1.5 shadow-sm backdrop-blur-sm transition-all hover:bg-slate-700/90 active:scale-95"
      >
        <span className="text-base leading-none" aria-hidden="true">{current.flag}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-slate-200">{current.code}</span>
        <svg
          className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown — absolute so it overlaps page content below the nav */}
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800 shadow-2xl">
          {LOCALES.map(l => (
            <button
              key={l.code}
              onClick={() => switchLocale(l.code)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors ${
                l.code === locale
                  ? 'bg-emerald-500/15 font-bold text-emerald-300'
                  : 'font-medium text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className="text-base leading-none" aria-hidden="true">{l.flag}</span>
              <span>{l.label}</span>
              {l.code === locale && (
                <svg
                  className="ms-auto h-3.5 w-3.5 shrink-0 text-emerald-400"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

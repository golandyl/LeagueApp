import { useTranslations } from 'next-intl'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'

// Players must sign this before the manager marks them verified (blue ✓).
export const INSURANCE_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSegAYgEZ7sjwIRCPSbmQ5DT-oq62Weh1auzKbDt10cuPjkpjg/viewform?usp=dialog'

export function InsuranceFormCard() {
  const t = useTranslations('signup')

  return (
    <section className="space-y-3 rounded-2xl bg-sky-950/40 p-4 ring-1 ring-sky-800/50">
      <div className="flex items-center gap-2">
        <VerifiedBadge className="h-5 w-5" />
        <h2 className="text-sm font-black text-white">{t('insuranceTitle')}</h2>
      </div>
      <p className="text-sm leading-relaxed text-sky-100/80">{t('insuranceBody')}</p>
      <a
        href={INSURANCE_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3.5 text-sm font-black text-white transition-all active:scale-[0.98] active:bg-sky-600"
      >
        {t('insuranceCta')}
        <svg className="h-4 w-4 rtl:-scale-x-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18v4.5M18 6l-7.5 7.5M15 13.5V18H6V9h4.5" />
        </svg>
      </a>
    </section>
  )
}

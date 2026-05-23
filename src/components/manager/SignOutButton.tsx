'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const t      = useTranslations('nav')
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors"
    >
      {t('signOut')}
    </button>
  )
}

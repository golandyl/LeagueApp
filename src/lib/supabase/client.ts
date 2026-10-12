import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { accessCodesHeader } from '@/lib/access-codes'

// Attaches stored tournament access codes to every request so RLS can grant
// scorekeeping rights to non-managers who entered the code.
const fetchWithAccessCodes: typeof fetch = (input, init) => {
  const codes = accessCodesHeader()
  if (!codes) return fetch(input, init)
  const headers = new Headers(init?.headers)
  headers.set('x-access-codes', codes)
  return fetch(input, { ...init, headers })
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithAccessCodes } }
  )
}

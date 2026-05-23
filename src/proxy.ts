import createMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'

const handleI18nRouting = createMiddleware(routing)

const LOCALES: readonly string[] = routing.locales
const DEFAULT_LOCALE = routing.defaultLocale

// With localePrefix:'always', every URL starts with /{locale}/
// e.g. /en/login → 'en', /he/manager-dashboard/123 → 'he'
function getLocaleFromPath(pathname: string): string {
  const first = pathname.split('/')[1]
  return LOCALES.includes(first) ? first : DEFAULT_LOCALE
}

// Strip the leading /{locale} segment so route-matching works as before.
function stripLocale(pathname: string, locale: string): string {
  if (pathname.startsWith(`/${locale}`)) {
    return pathname.slice(locale.length + 1) || '/'
  }
  return pathname
}

// Routes that do not require authentication.
// Checked against the path *without* locale prefix.
const PUBLIC_PREFIXES  = ['/login', '/register', '/league', '/draft']
const MANAGER_PREFIXES = ['/manager']
const PLAYER_PREFIXES  = ['/player']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. i18n routing ──────────────────────────────────────────────────────────
  // Handles locale-prefix normalisation (e.g. redirects /login → /en/login).
  // Any non-200 means next-intl issued a redirect — return it immediately.
  const intlResponse = handleI18nRouting(request)
  if (intlResponse.status !== 200) return intlResponse

  // ── 2. Supabase RBAC ─────────────────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const locale = getLocaleFromPath(pathname)
  const path   = stripLocale(pathname, locale)

  const isPublic =
    path === '/' ||
    PUBLIC_PREFIXES.some(p => path.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
  }

  if (user) {
    const role = user.user_metadata?.role as string | undefined

    if (MANAGER_PREFIXES.some(p => path.startsWith(p)) && role !== 'manager') {
      return NextResponse.redirect(new URL(`/${locale}/player-dashboard`, request.url))
    }

    if (PLAYER_PREFIXES.some(p => path.startsWith(p)) && role !== 'player' && role !== 'manager') {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
    }
  }

  // Forward any locale cookies next-intl set into the Supabase response.
  intlResponse.cookies.getAll().forEach(({ name, value }) => {
    supabaseResponse.cookies.set(name, value)
  })

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

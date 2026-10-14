import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Called daily by a Vercel cron (vercel.json). Supabase pauses free-plan
// projects after 7 days without activity; one tiny read keeps it awake.
export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )

  const { error } = await supabase.from('leagues').select('id').limit(1)
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true, at: new Date().toISOString() })
}

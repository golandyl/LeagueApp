'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type RealtimeEvent = {
  event: string
  schema?: string
  table?: string
  filter?: string
  callback: (payload: unknown) => void
}

export function useRealtime(channelName: string, events: RealtimeEvent[]) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(channelName)

    events.forEach(({ event, schema, table, filter, callback }) => {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event, schema: schema ?? 'public', table, filter },
        callback
      )
    })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName])

  return channelRef
}

'use client'

import { useDraftStore } from '@/store/draft'
import { useRealtime } from '@/hooks/useRealtime'
import type { DraftPick } from '@/types/draft'

export function useDraftRealtime(draftId: string) {
  const { addPick } = useDraftStore()

  useRealtime(`draft:${draftId}`, [
    {
      event: 'INSERT',
      table: 'draft_picks',
      filter: `draft_id=eq.${draftId}`,
      callback: (payload: unknown) => {
        const { new: pick } = payload as { new: DraftPick }
        addPick(pick)
      },
    },
  ])

  return useDraftStore()
}

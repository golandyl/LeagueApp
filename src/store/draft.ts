import { create } from 'zustand'
import type { Draft, DraftPick } from '@/types/draft'
import type { Player } from '@/types/league'

interface DraftState {
  draft: Draft | null
  picks: DraftPick[]
  availablePlayers: Player[]
  isConnected: boolean
  setDraft: (draft: Draft) => void
  addPick: (pick: DraftPick) => void
  setAvailablePlayers: (players: Player[]) => void
  setConnected: (connected: boolean) => void
  reset: () => void
}

const initialState = {
  draft: null,
  picks: [],
  availablePlayers: [],
  isConnected: false,
}

export const useDraftStore = create<DraftState>((set) => ({
  ...initialState,
  setDraft: (draft) => set({ draft }),
  addPick: (pick) => set((state) => ({ picks: [...state.picks, pick] })),
  setAvailablePlayers: (availablePlayers) => set({ availablePlayers }),
  setConnected: (isConnected) => set({ isConnected }),
  reset: () => set(initialState),
}))

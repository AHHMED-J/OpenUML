/**
 * Which guidance tips this viewer has seen (closed, acted on or done), kept in localStorage under
 * `openuml.tips`. Whether tips show at all is the `showTips` preference (Preferences > Help).
 */
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { loadJson, saveJson } from '../persist'

interface StoredTips {
  readonly seen?: unknown
}

export interface GuideState {
  readonly seen: ReadonlySet<string>
  /** Remembers `ids` as seen (a closed, acted-on or done tip never shows again). */
  markSeen(...ids: string[]): void
  /** Forgets every seen tip, so they show again from the first one. */
  resetTips(): void
}

function loadSeen(): Set<string> {
  const stored = loadJson<StoredTips>('tips', {})
  return new Set(Array.isArray(stored.seen) ? stored.seen.filter((id): id is string => typeof id === 'string') : [])
}

/** A guide store reading and writing the stored seen tips (one per app; tests make their own). */
export function createGuideStore() {
  return createStore<GuideState>()((set, get) => ({
    seen: loadSeen(),
    markSeen(...ids) {
      const fresh = ids.filter((id) => !get().seen.has(id))
      if (fresh.length === 0) return
      const seen = new Set([...get().seen, ...fresh])
      set({ seen })
      saveJson('tips', { seen: [...seen] })
    },
    resetTips() {
      set({ seen: new Set() })
      saveJson('tips', { seen: [] })
    }
  }))
}

export const guideStore = createGuideStore()

export function useGuideStore<T>(selector: (state: GuideState) => T): T {
  return useStore(guideStore, selector)
}

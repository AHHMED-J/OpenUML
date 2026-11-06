/**
 * Which canvas diagrams are drawn on: a per-user preference, independent from the app theme unless
 * it follows it. The app theme may in turn follow the system, so the answer can change on its own.
 */
import { useSyncExternalStore } from 'react'
import type { CanvasMode } from '../diagram'
import { useUiStore, type CanvasPreference, type Preferences, type ThemePreference } from './uiStore'

const DARK_SYSTEM = '(prefers-color-scheme: dark)'

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(DARK_SYSTEM).matches ?? false)
}

function subscribeSystem(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
  const media = window.matchMedia(DARK_SYSTEM)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function appTheme(theme: ThemePreference, systemDark = systemIsDark()): 'dark' | 'light' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

export function canvasModeFor(canvas: CanvasPreference, theme: ThemePreference, systemDark = systemIsDark()): CanvasMode {
  return canvas === 'follow' ? appTheme(theme, systemDark) : canvas
}

/** The canvas in use now, for code outside React. */
export function currentCanvasMode(prefs: Preferences): CanvasMode {
  return canvasModeFor(prefs.canvasMode, prefs.theme)
}

export function useCanvasMode(): CanvasMode {
  const canvas = useUiStore((s) => s.prefs.canvasMode)
  const theme = useUiStore((s) => s.prefs.theme)
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false)
  return canvasModeFor(canvas, theme, systemDark)
}

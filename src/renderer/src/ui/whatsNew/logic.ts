/**
 * What's New decisions that need no UI: version comparison, which releases a launch should show,
 * and how releases become carousel slides.
 */
import type { Release, ReleaseFeature, ReleaseMinorItem } from './releases'

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

/** `[major, minor, patch]` of a version (a pre-release suffix is ignored), or null if malformed. */
export function parseVersion(version: string): readonly [number, number, number] | null {
  const m = VERSION.exec(version)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * Orders two versions (negative: a < b). A pre-release sorts below its release; malformed
 * versions sort below every valid one.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] as number) - (pb[i] as number)
    if (d !== 0) return d
  }
  return Number(b.includes('-')) - Number(a.includes('-'))
}

/** Releases newer than `lastSeen` and not newer than `current`, newest first. */
export function releasesToShow(releases: readonly Release[], lastSeen: string, current: string): Release[] {
  return releases
    .filter((r) => compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}

/** Last version without the What's New window: where profiles that predate it start from. */
const LAST_VERSION_WITHOUT_WHATS_NEW = '0.1.7'

/**
 * The version to compare against. A profile with no recorded version but with stored data is an
 * existing user who updated from before the window existed (not a fresh install), so it counts
 * as coming from the last version without it.
 */
export function effectiveLastSeen(lastSeen: string | null, hasStoredData: boolean): string | null {
  return lastSeen ?? (hasStoredData ? LAST_VERSION_WITHOUT_WHATS_NEW : null)
}

export interface WhatsNewDecision {
  /** The version to store as seen, or null when nothing changes. */
  readonly record: string | null
  /** Releases to open the window with (empty: stay closed). */
  readonly show: readonly Release[]
}

/**
 * What a launch does. A fresh install (nothing seen yet) only records the version; so does a
 * launch with the window turned off, so turning it on later does not replay old notes. A
 * downgrade shows nothing and keeps the newer version recorded.
 */
export function decideWhatsNew(input: {
  readonly releases: readonly Release[]
  readonly lastSeen: string | null
  readonly current: string
  readonly enabled: boolean
}): WhatsNewDecision {
  const { releases, lastSeen, current, enabled } = input
  if (parseVersion(current) === null) return { record: null, show: [] }
  if (lastSeen === null) return { record: current, show: [] }
  if (compareVersions(current, lastSeen) <= 0) return { record: null, show: [] }
  return { record: current, show: enabled ? releasesToShow(releases, lastSeen, current) : [] }
}

interface FeatureSlide {
  readonly kind: 'feature'
  readonly version: string
  readonly feature: ReleaseFeature
}

export interface ListSlide {
  readonly kind: 'list'
  /** Minor items per release, newest release first; releases without any are left out. */
  readonly groups: readonly { readonly version: string; readonly items: readonly ReleaseMinorItem[] }[]
}

export type Slide = FeatureSlide | ListSlide

/** One slide per big feature (newest release first), then one list slide for all minor items. */
export function buildSlides(releases: readonly Release[]): Slide[] {
  const slides: Slide[] = releases.flatMap((r) => r.features.map((feature): Slide => ({ kind: 'feature', version: r.version, feature })))
  const groups = releases.filter((r) => r.minor.length > 0).map((r) => ({ version: r.version, items: r.minor }))
  if (groups.length > 0) slides.push({ kind: 'list', groups })
  return slides
}

export interface SlideControls {
  readonly primary: 'next' | 'done'
  readonly canBack: boolean
  readonly canSkip: boolean
}

/** Buttons of slide `index`: Skip + Next on feature slides, Back + Done on the last one. */
export function slideControls(slides: readonly Slide[], index: number): SlideControls {
  const last = index >= slides.length - 1
  const onList = slides[index]?.kind === 'list'
  return { primary: last ? 'done' : 'next', canBack: index > 0 && onList, canSkip: !last }
}

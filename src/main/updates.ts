/**
 * Update check: compares the running version with the latest published GitHub release of the
 * project. Only reads public release metadata (no download, no installation). Kept free of
 * Electron so it can be unit tested; the request itself is made by `index.ts`.
 */
import { allowedExternalUrl } from './ipcValidation'

/** GitHub REST endpoint of the latest (non-draft, non-prerelease) release. */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/AHHMED-J/OpenUML/releases/latest'
/** Largest response accepted (the release JSON is a few KB). */
export const MAX_RELEASE_JSON_BYTES = 1024 * 1024

export interface LatestRelease {
  /** `X.Y.Z` without the `v` prefix. */
  readonly version: string
  /** The release page on GitHub. */
  readonly url: string
}

/** `[major, minor, patch]` of a plain `X.Y.Z` (or `vX.Y.Z`) version; null for anything else. */
export function parseVersion(text: unknown): [number, number, number] | null {
  if (typeof text !== 'string') return null
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** True when `latest` is a higher version than `current` (false when either is not `X.Y.Z`). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current.replace(/-.*$/, ''))
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number)
  return false
}

/**
 * The latest release from the GitHub API JSON, or null when it is not a usable release: the tag
 * must be a plain version and the page must be on the project's GitHub (any other link is
 * replaced by the project's releases page).
 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== 'object') return null
  const r = json as Record<string, unknown>
  if (r['draft'] === true || r['prerelease'] === true) return null
  const v = parseVersion(r['tag_name'])
  if (!v) return null
  const url = allowedExternalUrl(r['html_url']) ?? 'https://github.com/AHHMED-J/OpenUML/releases/latest'
  return { version: v.join('.'), url }
}

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareVersions } from './logic'
import { RELEASES, releaseUrl } from './releases'

const packageVersion = (JSON.parse(readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8')) as { version: string }).version

describe('release notes', () => {
  it('uses plain major.minor.patch versions and ISO dates', () => {
    for (const r of RELEASES) {
      expect(r.version, r.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(r.date, r.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('lists releases newest first without repeats', () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(compareVersions((RELEASES[i - 1] as (typeof RELEASES)[number]).version, (RELEASES[i] as (typeof RELEASES)[number]).version)).toBeGreaterThan(0)
    }
  })

  it('has real text in every feature and minor item', () => {
    for (const r of RELEASES) {
      for (const f of r.features) {
        expect(f.title.trim(), r.version).not.toBe('')
        expect(f.description.trim(), f.title).not.toBe('')
      }
      for (const m of r.minor) expect(m.text.trim(), r.version).not.toBe('')
    }
  })

  it('has an entry for the version in package.json, so a release cannot ship without notes', () => {
    const core = packageVersion.replace(/-.*$/, '')
    expect(RELEASES.map((r) => r.version), `add the ${core} notes to releases.ts`).toContain(core)
  })

  it('links to the release page of a version', () => {
    expect(releaseUrl('0.1.6')).toBe('https://github.com/AHHMED-J/OpenUML/releases/tag/v0.1.6')
  })
})

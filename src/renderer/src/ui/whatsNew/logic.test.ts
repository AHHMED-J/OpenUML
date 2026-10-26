import { describe, expect, it } from 'vitest'
import { buildSlides, compareVersions, decideWhatsNew, parseVersion, releasesToShow, slideControls } from './logic'
import type { Release } from './releases'

const feature = (title: string) => ({ title, description: `${title} text`, illustration: 'website' as const })
const release = (version: string, features: string[], minor: Release['minor'] = []): Release => ({
  version,
  date: '2026-01-01',
  features: features.map(feature),
  minor
})
const fixed = { kind: 'fixed', text: 'A fix' } as const

const RELEASES: Release[] = [release('0.1.6', ['F6a', 'F6b'], [fixed]), release('0.1.5', ['F5'], [fixed]), release('0.1.4', ['F4'])]

describe('versions', () => {
  it('parses plain and pre-release versions and rejects the rest', () => {
    expect(parseVersion('0.1.6')).toEqual([0, 1, 6])
    expect(parseVersion('1.20.3-preview.4')).toEqual([1, 20, 3])
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('v1.2.3')).toBeNull()
  })

  it('compares numerically, with a pre-release below its release', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('0.1.6', '0.1.6')).toBe(0)
    expect(compareVersions('0.1.6-preview.3', '0.1.6')).toBeLessThan(0)
    expect(compareVersions('0.1.6', '0.1.6-preview.3')).toBeGreaterThan(0)
    expect(compareVersions('bad', '0.0.1')).toBeLessThan(0)
  })
})

describe('releasesToShow', () => {
  const versions = (lastSeen: string, current: string) => releasesToShow(RELEASES, lastSeen, current).map((r) => r.version)

  it('shows one release for one version up', () => expect(versions('0.1.5', '0.1.6')).toEqual(['0.1.6']))
  it('shows every skipped version, newest first', () => expect(versions('0.1.3', '0.1.6')).toEqual(['0.1.6', '0.1.5', '0.1.4']))
  it('shows nothing on the same version or a downgrade', () => {
    expect(versions('0.1.6', '0.1.6')).toEqual([])
    expect(versions('0.1.6', '0.1.5')).toEqual([])
  })
  it('ignores releases newer than the running version', () => expect(versions('0.1.3', '0.1.5')).toEqual(['0.1.5', '0.1.4']))
})

describe('decideWhatsNew', () => {
  const decide = (lastSeen: string | null, current: string, enabled = true) => decideWhatsNew({ releases: RELEASES, lastSeen, current, enabled })

  it('only records the version on a fresh install', () => expect(decide(null, '0.1.6')).toEqual({ record: '0.1.6', show: [] }))
  it('does nothing on the same version', () => expect(decide('0.1.6', '0.1.6')).toEqual({ record: null, show: [] }))
  it('shows the news and records the version after an update', () => {
    const d = decide('0.1.5', '0.1.6')
    expect(d.record).toBe('0.1.6')
    expect(d.show.map((r) => r.version)).toEqual(['0.1.6'])
  })
  it('records without showing when the window is turned off', () => expect(decide('0.1.4', '0.1.6', false)).toEqual({ record: '0.1.6', show: [] }))
  it('keeps the newer recorded version on a downgrade', () => expect(decide('0.1.6', '0.1.5')).toEqual({ record: null, show: [] }))
  it('ignores an unreadable running version', () => expect(decide('0.1.5', 'dev')).toEqual({ record: null, show: [] }))
  it('shows nothing, but records, when the new version has no notes', () => {
    expect(decide('0.1.6', '0.1.7')).toEqual({ record: '0.1.7', show: [] })
  })
})

describe('buildSlides', () => {
  it('puts one slide per feature first, then a single list slide', () => {
    const slides = buildSlides(RELEASES.slice(0, 2))
    expect(slides.map((s) => s.kind)).toEqual(['feature', 'feature', 'feature', 'list'])
    expect(slides.flatMap((s) => (s.kind === 'feature' ? [s.feature.title] : []))).toEqual(['F6a', 'F6b', 'F5'])
    const list = slides[3]
    expect(list?.kind === 'list' && list.groups.map((g) => g.version)).toEqual(['0.1.6', '0.1.5'])
  })

  it('has no list slide when no release has minor items', () => {
    expect(buildSlides([release('0.1.4', ['F4'])]).map((s) => s.kind)).toEqual(['feature'])
  })

  it('has only the list slide when there are no big features', () => {
    expect(buildSlides([release('0.1.7', [], [fixed])]).map((s) => s.kind)).toEqual(['list'])
  })
})

describe('slideControls', () => {
  const slides = buildSlides(RELEASES.slice(0, 2))

  it('offers Skip and Next on feature slides', () => {
    expect(slideControls(slides, 0)).toEqual({ primary: 'next', canBack: false, canSkip: true })
    expect(slideControls(slides, 2)).toEqual({ primary: 'next', canBack: false, canSkip: true })
  })
  it('offers Back and Done on the list slide', () => {
    expect(slideControls(slides, 3)).toEqual({ primary: 'done', canBack: true, canSkip: false })
  })
  it('ends a features-only window with Done', () => {
    expect(slideControls(buildSlides([release('0.1.4', ['F4'])]), 0)).toEqual({ primary: 'done', canBack: false, canSkip: false })
  })
})

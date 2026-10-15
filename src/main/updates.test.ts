import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseLatestRelease, parseVersion } from './updates'

describe('parseVersion', () => {
  it('reads plain versions with or without the v prefix', () => {
    expect(parseVersion('0.1.4')).toEqual([0, 1, 4])
    expect(parseVersion('v12.0.3')).toEqual([12, 0, 3])
  })

  it('rejects anything else', () => {
    for (const bad of ['', '1.2', '1.2.3.4', 'v1.2.3-beta', 'latest', 42, null, '1.2.x']) expect(parseVersion(bad)).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it('compares major, minor and patch numerically', () => {
    expect(isNewerVersion('0.1.5', '0.1.4')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
    expect(isNewerVersion('0.1.4', '0.1.4')).toBe(false)
    expect(isNewerVersion('0.1.3', '0.1.4')).toBe(false)
  })

  it('treats a preview build as its base version', () => {
    expect(isNewerVersion('0.1.4', '0.1.4-preview.3')).toBe(false)
    expect(isNewerVersion('0.1.5', '0.1.4-preview.3')).toBe(true)
  })

  it('never reports an unreadable version as newer', () => {
    expect(isNewerVersion('garbage', '0.1.4')).toBe(false)
    expect(isNewerVersion('0.1.5', 'garbage')).toBe(false)
  })
})

describe('parseLatestRelease', () => {
  it('takes the tag and the release page', () => {
    expect(parseLatestRelease({ tag_name: 'v0.1.5', html_url: 'https://github.com/AHHMED-J/OpenUML/releases/tag/v0.1.5' })).toEqual({
      version: '0.1.5',
      url: 'https://github.com/AHHMED-J/OpenUML/releases/tag/v0.1.5'
    })
  })

  it('replaces a link outside the project with the releases page', () => {
    expect(parseLatestRelease({ tag_name: 'v0.1.5', html_url: 'https://evil.example/download' })?.url).toBe('https://github.com/AHHMED-J/OpenUML/releases/latest')
  })

  it('ignores drafts, prereleases and odd tags', () => {
    expect(parseLatestRelease({ tag_name: 'v0.1.5', draft: true })).toBeNull()
    expect(parseLatestRelease({ tag_name: 'v0.1.5', prerelease: true })).toBeNull()
    expect(parseLatestRelease({ tag_name: 'nightly' })).toBeNull()
    expect(parseLatestRelease(null)).toBeNull()
    expect(parseLatestRelease('v0.1.5')).toBeNull()
  })
})

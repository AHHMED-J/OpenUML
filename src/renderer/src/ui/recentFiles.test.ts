import { describe, expect, it } from 'vitest'
import { addRecentFile, baseName, MAX_RECENT_FILES, removeRecentFile, sanitizeRecentFiles } from './recentFiles'

describe('recent files', () => {
  it('adds most-recent-first without duplicates', () => {
    let list: string[] = []
    list = addRecentFile(list, '/a.mdj')
    list = addRecentFile(list, '/b.mdj')
    list = addRecentFile(list, '/a.mdj')
    expect(list).toEqual(['/a.mdj', '/b.mdj'])
  })

  it('keeps at most 10 entries', () => {
    let list: string[] = []
    for (let i = 0; i < 15; i++) list = addRecentFile(list, `/f${i}.mdj`)
    expect(list).toHaveLength(MAX_RECENT_FILES)
    expect(list[0]).toBe('/f14.mdj')
    expect(list.at(-1)).toBe('/f5.mdj')
  })

  it('removes entries', () => {
    expect(removeRecentFile(['/a', '/b'], '/a')).toEqual(['/b'])
  })

  it('sanitizes persisted values', () => {
    expect(sanitizeRecentFiles(null)).toEqual([])
    expect(sanitizeRecentFiles('x')).toEqual([])
    expect(sanitizeRecentFiles(['/a', 3, '', '/a', '/b'])).toEqual(['/a', '/b'])
    expect(sanitizeRecentFiles(Array.from({ length: 20 }, (_, i) => `/${i}`))).toHaveLength(10)
  })

  it('extracts base names on both separators', () => {
    expect(baseName('/projects/demo/model.mdj')).toBe('model.mdj')
    expect(baseName('C:\\work\\model.mdj')).toBe('model.mdj')
  })
})

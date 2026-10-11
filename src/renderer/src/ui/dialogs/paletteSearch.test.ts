import { describe, expect, it } from 'vitest'
import { fuzzyScore, rankEntries } from './paletteSearch'

const entries = [
  { id: 'file.save', title: 'File: Save' },
  { id: 'file.save-as', title: 'File: Save As...' },
  { id: 'view.show-grid', title: 'View: Show Grid' },
  { id: 'edit.select-all', title: 'Edit: Select All' }
]

describe('command palette search', () => {
  it('matches substrings and subsequences case-insensitively', () => {
    expect(fuzzyScore('View: Show Grid', 'grid')).not.toBeNull()
    expect(fuzzyScore('View: Show Grid', 'shgr')).not.toBeNull()
    expect(fuzzyScore('View: Show Grid', 'xyz')).toBeNull()
    expect(fuzzyScore('Save', 'save')! > fuzzyScore('Select All Values', 'save')!).toBe(true)
  })

  it('ranks by score and matches ids too', () => {
    expect(rankEntries(entries, 'save', []).map((e) => e.id)).toEqual(['file.save', 'file.save-as'])
    expect(rankEntries(entries, 'select-all', []).map((e) => e.id)).toEqual(['edit.select-all'])
  })

  it('puts recently used commands first for an empty query', () => {
    expect(rankEntries(entries, '', ['view.show-grid']).map((e) => e.id)[0]).toBe('view.show-grid')
    expect(rankEntries(entries, '', []).map((e) => e.id)).toEqual(['edit.select-all', 'file.save', 'file.save-as', 'view.show-grid'])
  })
})

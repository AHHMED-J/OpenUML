import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RecoveryStore, sanitizeSnapshot } from './recovery'
import { pdfHtml, sanitizePdfPages } from './pdf'

const abs = process.platform === 'win32' ? 'C:\\work\\model.mdj' : '/work/model.mdj'

describe('sanitizeSnapshot', () => {
  it('keeps a valid snapshot', () => {
    expect(sanitizeSnapshot({ text: '{}', filePath: abs, name: 'Model', savedAt: 5 })).toEqual({ text: '{}', filePath: abs, name: 'Model', savedAt: 5 })
  })

  it('drops paths that are not absolute project files and repairs odd fields', () => {
    expect(sanitizeSnapshot({ text: '{}', filePath: 'relative.mdj', name: 7 })).toEqual({ text: '{}', filePath: null, name: '', savedAt: 0 })
    expect(sanitizeSnapshot({ text: '{}', filePath: '/etc/passwd' })?.filePath).toBeNull()
  })

  it('rejects snapshots without text', () => {
    for (const bad of [null, 'text', {}, { text: '' }, { text: 5 }]) expect(sanitizeSnapshot(bad)).toBeNull()
  })
})

describe('RecoveryStore', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('saves, reads back and clears the snapshot', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-recovery-'))
    const store = new RecoveryStore(dir)
    expect(await store.read()).toBeNull()
    const snapshot = { text: '{"_type":"Project"}', filePath: null, name: 'Untitled', savedAt: 1 }
    await store.save(snapshot)
    expect(await store.read()).toEqual(snapshot)
    await store.clear()
    expect(await store.read()).toBeNull()
    await store.clear()
  })

  it('treats an unreadable file as no snapshot', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-recovery-'))
    const store = new RecoveryStore(dir)
    await mkdir(join(dir, 'recovery'))
    await writeFile(store.file, 'not json')
    expect(await store.read()).toBeNull()
    expect(await readFile(store.file, 'utf8')).toBe('not json')
  })
})

describe('PDF pages', () => {
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'

  it('accepts standalone SVG pages and clamps their size', () => {
    expect(sanitizePdfPages([{ svg, width: 100.256, height: 0 }])).toEqual([{ svg, width: 100.26, height: 1 }])
    expect(sanitizePdfPages([{ svg, width: 1e9, height: 50 }])?.[0]?.width).toBe(20000)
  })

  it('rejects anything that is not a list of SVG pages', () => {
    for (const bad of [null, [], 'svg', [{ svg: '<html></html>', width: 1, height: 1 }], [{ svg, width: 'a', height: 1 }], [{ svg, width: Number.NaN, height: 1 }]]) {
      expect(sanitizePdfPages(bad)).toBeNull()
    }
  })

  it('gives every page its own CSS page size and embeds the SVG as a data image', () => {
    const html = pdfHtml([
      { svg, width: 300, height: 200 },
      { svg, width: 800, height: 600 }
    ])
    expect(html).toContain('@page p0 { size: 300px 200px; margin: 0 }')
    expect(html).toContain('@page p1 { size: 800px 600px; margin: 0 }')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain(`src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"`)
    expect(html).not.toContain('<svg')
  })
})

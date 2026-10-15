import { describe, expect, it } from 'vitest'
import { SHEET_PRESETS } from '../model'
import { setSheetSize } from '../diagram/idef0/sheet'
import { measurer, newKit } from '../diagram/idef0/testkit'
import { testDiagram } from '../diagram/testUtils'
import { pdfPageOf } from './pdf'

const MM = 96 / 25.4

describe('PDF pages', () => {
  it('prints a UML diagram on a page the size of its picture, on white', () => {
    const t = testDiagram()
    t.node('Class', 40, 40, 120, 80)
    const page = pdfPageOf(t.diagram, t.repository, t.measurer)
    expect(page).toMatchObject({ width: 140, height: 100 })
    expect(page.svg).toContain('fill="#ffffff"')
  })

  it('prints an IDEF0 sheet with a paper size on that paper', () => {
    const kit = newKit()
    const a4 = SHEET_PRESETS.find((p) => p.id === 'a4-landscape')
    if (!a4) throw new Error('no A4 preset')
    setSheetSize(kit.envOf(kit.child), a4)
    const page = pdfPageOf(kit.child, kit.repository, measurer)
    expect(page.width).toBeCloseTo(297 * MM)
    expect(page.height).toBeCloseTo(210 * MM)
  })

  it('prints the default IDEF0 sheet at its own size', () => {
    const kit = newKit()
    const page = pdfPageOf(kit.child, kit.repository, measurer)
    expect(page.width).toBeGreaterThan(1000)
    expect(page.height).toBeGreaterThan(740)
  })
})

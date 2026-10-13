/**
 * Package-family node notation (spec 24 §5, spec 21 §5): the package shape with a glyph in its tab
 * for models (triangle), subsystems (fork) and profiles (keyword only).
 */
import type { NodeView } from '../../../model'
import type { Point } from '../../core'
import type { LayoutContext, NodeLayout } from '../../layout/types'
import { layoutPackage, type PackageData } from '../class/layout'

export type PackageGlyphKind = 'model' | 'subsystem' | 'none'

export interface PackageGlyph {
  readonly kind: PackageGlyphKind
  /** Polylines/polygon outlines of the glyph, in diagram coordinates. */
  readonly polylines: readonly (readonly Point[])[]
  readonly closed: boolean
}

export interface PackageGlyphData extends PackageData {
  readonly glyph: PackageGlyph
}

/** Glyph geometry relative to the tab's right edge (`tabRight`) and the box top. */
function packageGlyph(kind: PackageGlyphKind, tabRight: number, top: number): PackageGlyph {
  const p = (dx: number, dy: number): Point => ({ x: tabRight + dx, y: top + dy })
  if (kind === 'model') return { kind, closed: true, polylines: [[p(-9, 3), p(-15, 10), p(-3, 10)]] }
  if (kind === 'subsystem') {
    return {
      kind,
      closed: false,
      polylines: [
        [p(-8, 3), p(-8, 7)],
        [p(-11, 11), p(-11, 7), p(-5, 7)],
        [p(-5, 11), p(-5, 7), p(-11, 7)]
      ]
    }
  }
  return { kind: 'none', closed: false, polylines: [] }
}

/** Package layout plus the glyph of `kind` in the tab. */
export function layoutPackageWithGlyph(kind: PackageGlyphKind) {
  return (view: NodeView, ctx: LayoutContext): NodeLayout<PackageGlyphData> => {
    const base = layoutPackage(view, ctx)
    const tab = base.data.tab
    return { ...base, data: { ...base.data, glyph: packageGlyph(kind, tab.left + tab.width, tab.top) } }
  }
}

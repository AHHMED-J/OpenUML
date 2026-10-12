/** SVG drawing of package-family nodes with a tab glyph (from their layouts only). */
import type React from 'react'
import { polygonPath, polylinePath } from '../../core'
import type { NodeLayout } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { PackageGlyphData } from './layout'

export function GlyphPackageNode({ layout }: { layout: NodeLayout<PackageGlyphData> }): React.JSX.Element {
  const { style, data } = layout
  return (
    <g>
      <Shadow d={`${rectPath(data.tab)} ${rectPath(data.body)}`} show={style.showShadow} />
      <StyledRect r={data.tab} style={style} />
      <StyledRect r={data.body} style={style} />
      {data.glyph.polylines.map((points, i) => (
        <path key={i} d={data.glyph.closed ? polygonPath(points) : polylinePath(points)} fill="none" stroke={style.lineColor} strokeWidth={1} />
      ))}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

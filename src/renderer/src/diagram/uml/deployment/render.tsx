/** SVG drawing of node (3D box) views (from their layouts only). */
import type React from 'react'
import { polygonPath } from '../../core'
import type { NodeLayout } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { NodeFaces, NodeData } from './layout'

function facesPath(f: NodeFaces): string {
  return `${rectPath(f.front)} ${polygonPath(f.top)} ${polygonPath(f.side)}`
}

function Faces({ faces, fill, line }: { faces: NodeFaces; fill: string; line: string }): React.JSX.Element {
  return (
    <g fill={fill} stroke={line} strokeWidth={1}>
      <rect x={faces.front.left} y={faces.front.top} width={faces.front.width} height={faces.front.height} />
      <path d={polygonPath(faces.top)} />
      <path d={polygonPath(faces.side)} />
    </g>
  )
}

export function NodeBox({ layout }: { layout: NodeLayout<NodeData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      {data.faces ? <Shadow d={facesPath(data.faces)} show={style.showShadow} /> : <Shadow d={rectPath(box)} show={style.showShadow} />}
      {data.faces ? <Faces faces={data.faces} fill={style.fillColor} line={style.lineColor} /> : <StyledRect r={box} style={style} />}
      {data.glyph && <Faces faces={data.glyph} fill={style.fillColor} line={style.lineColor} />}
      {data.compartments.map((c) => (
        <g key={c.kind}>
          <line x1={c.rect.left} y1={c.rect.top} x2={c.rect.left + c.rect.width} y2={c.rect.top} stroke={style.lineColor} strokeWidth={1} />
          <SvgLines lines={c.rows} color={style.fontColor} />
        </g>
      ))}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

/** SVG drawing of the metaclass box. */
import type React from 'react'
import type { NodeLayout } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { MetaClassData } from './layout'

export function MetaClassNode({ layout }: { layout: NodeLayout<MetaClassData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

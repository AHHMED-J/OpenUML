/**
 * Profile diagram nodes (spec 29 §5): the metaclass box (keyword over a bold name, no other
 * compartments). Stereotypes are class boxes and profiles package shapes, drawn by the class and
 * package notations with a fixed keyword.
 */
import type { NodeView } from '../../../model'
import type { Rect } from '../../core'
import { arrangeNameCompartment, nodeLayout, styleOf } from '../../layout/helpers'
import type { LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { classifierNameMeasure, nameRegion } from '../class/layout'

export interface MetaClassData {
  readonly nameLines: readonly TextLine[]
}

export function layoutMetaClass(view: NodeView, ctx: LayoutContext): NodeLayout<MetaClassData> {
  const model = view.model
  const style = styleOf(view)
  const name = classifierNameMeasure(view, model, style.font, ctx, view['stereotypeDisplay'] === 'none' ? 'none' : 'label')
  return nodeLayout(view, {
    minWidth: name.width,
    minHeight: name.height,
    style,
    data: (box: Rect) => ({ nameLines: arrangeNameCompartment(name, { ...box, height: name.height }) }),
    regions: (box: Rect) => nameRegion(model, { ...box, height: name.height }, name, style.font)
  })
}

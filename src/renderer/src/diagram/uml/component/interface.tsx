/**
 * Interface in component / deployment diagrams (spec 21 §5): the lollipop circle is a ball when
 * only realizations end on it, a socket (arcs drawn by the dependency edges, no circle) when only
 * dependencies end on it, and a ball-and-socket (ball inset 3) when both do.
 */
import type React from 'react'
import { isKindOf, type EdgeView, type NodeView } from '../../../model'
import type { LayoutContext, NodeLayout } from '../../layout/types'
import { SvgLines } from '../../render/primitives'
import { layoutClassifier, type ClassifierData } from '../class/layout'
import { ClassifierIcon, ClassifierNode } from '../class/render'

type LollipopKind = 'ball' | 'socket' | 'ball-and-socket'

export interface InterfaceData extends ClassifierData {
  readonly lollipop: LollipopKind | null
}

const STRUCTURE_DIAGRAMS = new Set(['UMLComponentDiagram', 'UMLDeploymentDiagram'])

/** Which parts of the lollipop to draw, from the edges ending on the interface view. */
function lollipopKind(view: NodeView, edges: readonly EdgeView[]): LollipopKind {
  let realizations = 0
  let dependencies = 0
  for (const e of edges) {
    if (e.head !== view) continue
    if (isKindOf(e.model, 'UMLRealization')) realizations++
    else if (isKindOf(e.model, 'UMLDependency')) dependencies++
  }
  if (dependencies > 0 && realizations > 0) return 'ball-and-socket'
  return dependencies > 0 ? 'socket' : 'ball'
}

export function layoutInterface(view: NodeView, ctx: LayoutContext): NodeLayout<InterfaceData> {
  const base = layoutClassifier(view, ctx) as NodeLayout<ClassifierData>
  const iconic = base.data.form === 'icon' && base.data.icon?.kind === 'interface'
  if (!iconic || !STRUCTURE_DIAGRAMS.has(ctx.diagram._type)) return { ...base, data: { ...base.data, lollipop: null } }
  const edges = ctx.diagram.ownedViews.filter((v): v is EdgeView => isKindOf(v, 'EdgeView'))
  return { ...base, data: { ...base.data, lollipop: lollipopKind(view, edges) } }
}

export function InterfaceNode({ layout }: { layout: NodeLayout<InterfaceData> }): React.JSX.Element {
  const { style, data } = layout
  if (!data.lollipop || data.lollipop === 'ball' || !data.icon) return <ClassifierNode layout={layout} />
  return (
    <g>
      {data.lollipop === 'ball-and-socket' && <ClassifierIcon kind="interface" rect={data.icon.rect} style={style} inset={3} />}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

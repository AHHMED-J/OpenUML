/**
 * Class-diagram relationship edges (spec 03 §3.6): association (ends, roles, multiplicities,
 * navigability, aggregation/composition, owned-end dots), generalization, dependency,
 * realization and interface realization (solid and arrowless into a lollipop interface, with a
 * socket arc for dependencies).
 */
import type React from 'react'
import { isKindOf, type EdgeView, type Elem, type UMLAssociation, type View } from '../../../model'
import { fmt, relationshipNotation, type AssociationEndInfo, type Point, type RelationshipKind } from '../../core'
import { buildEdgeLayout } from '../../layout/edges'
import { braceList, nameOf, tagStrings } from '../../layout/helpers'
import type { EdgeLayout, LayoutContext } from '../../layout/types'
import { standardEdgeLabels } from '../../render/generic'
import { EdgeShape } from '../../render/primitives'
import type { EdgeNotation } from '../../render/registry'
import { associationEndLabels } from './endLabels'

function endInfo(end: Elem | null | undefined): AssociationEndInfo {
  if (!end) return {}
  return {
    navigable: (end['navigable'] as AssociationEndInfo['navigable']) ?? 'unspecified',
    aggregation: (end['aggregation'] as AssociationEndInfo['aggregation']) ?? 'none',
    ownedByOpposite: end['ownerAttribute'] != null
  }
}

const associationNotation: EdgeNotation = {
  connectKind: 'Association',
  layout(edge, ctx) {
    const a = isKindOf(edge.model, 'UMLAssociation') ? (edge.model as UMLAssociation) : null
    const n = relationshipNotation('association', { end1: endInfo(a?.end1), end2: endInfo(a?.end2) })
    const labels = standardEdgeLabels(edge)
    if (a?.isDerived && labels[0]) labels[0] = { ...labels[0], text: `/${nameOf(a)}` }
    if (labels[2]) labels[2] = { ...labels[2], text: edge['showProperty'] === false ? '' : braceList(tagStrings(a)) }
    return buildEdgeLayout(edge, ctx, {
      dash: n.dash,
      tailEnd: n.tail,
      headEnd: n.head,
      labels: [...labels, ...associationEndLabels(edge, a?.end1, 'tail'), ...associationEndLabels(edge, a?.end2, 'head')]
    })
  }
}

/** True when `view` shows an interface in iconic (lollipop) form. */
export function isLollipop(view: View | null | undefined): boolean {
  if (!view || !isKindOf(view.model, 'UMLInterface')) return false
  const display = view['stereotypeDisplay']
  return display === 'icon' || display === 'icon-label'
}

interface SocketData {
  /** Socket arc path (dependency into a lollipop), '' when none. */
  readonly socket: string
}

function socketArc(edge: EdgeView, layoutPoints: readonly Point[], ctx: LayoutContext): { path: string; bounds: { left: number; top: number; width: number; height: number } } | null {
  const head = edge.head ? ctx.nodeLayout(edge.head._id) : undefined
  const ball = head?.endpoint?.box
  const end = layoutPoints[layoutPoints.length - 1]
  if (!ball || !end) return null
  const cx = ball.left + ball.width / 2
  const cy = ball.top + ball.height / 2
  const r = Math.min(ball.width, ball.height) / 2 + 4
  const theta = Math.atan2(end.y - cy, end.x - cx)
  const p = (a: number): string => `${fmt(cx + r * Math.cos(a))} ${fmt(cy + r * Math.sin(a))}`
  return {
    path: `M${p(theta - Math.PI / 2)} A${fmt(r)} ${fmt(r)} 0 0 1 ${p(theta + Math.PI / 2)}`,
    bounds: { left: cx - r, top: cy - r, width: 2 * r, height: 2 * r }
  }
}

function directedNotation(kind: RelationshipKind, connectKind: EdgeNotation['connectKind']): EdgeNotation<SocketData> {
  return {
    connectKind,
    layout(edge, ctx): EdgeLayout<SocketData> {
      const lollipop = (kind === 'dependency' || kind === 'realization' || kind === 'interfaceRealization') && isLollipop(edge.head)
      const n = relationshipNotation(kind, { headIsLollipop: lollipop })
      const base = buildEdgeLayout<SocketData>(edge, ctx, {
        dash: n.dash,
        tailEnd: n.tail,
        headEnd: n.head,
        labels: standardEdgeLabels(edge, n.fixedKeyword),
        data: { socket: '' }
      })
      if (!lollipop || kind !== 'dependency') return base
      const arc = socketArc(edge, base.points, ctx)
      return arc ? { ...base, data: { socket: arc.path }, extraBounds: [arc.bounds] } : base
    },
    Render: DirectedEdge
  }
}

function DirectedEdge({ layout }: { layout: EdgeLayout<SocketData> }): React.JSX.Element {
  return (
    <EdgeShape layout={layout}>
      {layout.data?.socket && <path d={layout.data.socket} fill="none" stroke={layout.style.lineColor} strokeWidth={1} />}
    </EdgeShape>
  )
}

export const CLASS_EDGE_NOTATIONS: ReadonlyArray<readonly [string, EdgeNotation]> = [
  ['UMLAssociationView', associationNotation],
  ['UMLGeneralizationView', directedNotation('generalization', 'Generalization') as EdgeNotation],
  ['UMLInterfaceRealizationView', directedNotation('interfaceRealization', 'InterfaceRealization') as EdgeNotation],
  ['UMLRealizationView', directedNotation('realization', 'Realization') as EdgeNotation],
  ['UMLDependencyView', directedNotation('dependency', 'Dependency') as EdgeNotation]
]

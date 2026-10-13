/**
 * Information flow edges (spec 30 §5): a dashed line with a flat tail and a stick-arrow head.
 * The stereotype slot always reads «flow»; the middle slot shows the conveyed classifiers'
 * names joined with `, ` (the flow's own name when it conveys nothing).
 */
import type { Elem } from '../../../model'
import { relationshipNotation } from '../../core'
import { buildEdgeLayout } from '../../layout/edges'
import { nameOf } from '../../layout/helpers'
import { standardEdgeLabels } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'

/** The keyword always shown on an information flow. */
const FLOW_KEYWORD = 'flow'

/** Conveyed classifier names joined with `, `. */
export function conveyedText(flow: Elem | null | undefined): string {
  const conveyed = flow?.['conveyed']
  return Array.isArray(conveyed) ? (conveyed as Elem[]).map((c) => nameOf(c)).filter((n) => n !== '').join(', ') : ''
}

export const informationFlowNotation: EdgeNotation = {
  connectKind: 'InformationFlow',
  layout(edge, ctx) {
    const n = relationshipNotation('dependency')
    const labels = standardEdgeLabels(edge, FLOW_KEYWORD)
    const conveyed = conveyedText(edge.model)
    if (conveyed && labels[0]) labels[0] = { ...labels[0], text: conveyed }
    return buildEdgeLayout(edge, ctx, { dash: 'dot', tailEnd: n.tail, headEnd: { style: 'stickArrow' }, labels })
  }
}

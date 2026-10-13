/**
 * Diagram-wide sequence analysis, computed from the model only (no text measurement), once per
 * layout pass: message order and sequence numbers, activation bars (vertical extent and nesting
 * level), lifeline creation/destruction and the lowest used y. Lifeline layouts use it to size
 * their line and draw bars; message layouts use it (with the lifeline layouts) to route.
 *
 * Rules (spec 03 §4.4):
 * - A message's y is the y of its first stored point; self messages arrive 20 lower.
 * - Messages are ordered by y, then by x, then by list order; `auto` numbering follows that order.
 * - Synchronous and asynchronous calls start an activation bar on the receiver at the arrival y
 *   (diagram flag `showActivation`), at least 25 tall (or the stored activation height). A
 *   synchronous call's bar reaches down to the matching reply (first unmatched reply from the
 *   receiver back to the sender below it; inner calls match first). A bar grows so its bottom is
 *   at least 3 below the bottom of any bar starting within it, and nested bars shift right by
 *   one nesting level each.
 * - Delete messages destroy the target lifeline at their y (OpenUML cuts the line there, so they
 *   start no bar); create messages place the target's header on their y.
 */
import { isKindOf, type Diagram, type Elem, type NodeView, type UMLSeqMessageView, type View } from '../../../model'
import { MIN_SIZES, SPACING, messageNotation, type MessageSort } from '../../core'
import { topLevelOf } from '../../layout/edges'
import type { LayoutContext } from '../../layout/types'

interface ActivationInfo {
  readonly messageId: string
  readonly lifelineId: string
  readonly top: number
  readonly bottom: number
  /** Nesting level on its lifeline (0 = centered on the line). */
  readonly level: number
}

export interface MessageInfo {
  readonly view: UMLSeqMessageView
  readonly sort: MessageSort
  /** y of the message (its tail). */
  readonly y: number
  /** y where the message arrives (self messages: y + 20). */
  readonly arrivalY: number
  /** Top-level views at the ends: lifeline views, or endpoint/gate nodes. */
  readonly tail: View | null
  readonly head: View | null
  /** IDs of the lifeline views at the ends (null when the end is not a lifeline). */
  readonly tailLifeline: string | null
  readonly headLifeline: string | null
  readonly self: boolean
  /** 0-based position in the vertical order. */
  readonly index: number
  /** Sequence number to show ('' when hidden). */
  readonly sequenceNumber: string
  readonly activation: ActivationInfo | null
}

export interface LifelineInfo {
  /** y of the first create message targeting the lifeline. */
  readonly createdAt: number | null
  /** y of the first delete message targeting the lifeline. */
  readonly destroyedAt: number | null
  /** Activation bars on the lifeline, by top. */
  readonly activations: readonly ActivationInfo[]
}

export interface SequenceInfo {
  readonly messages: ReadonlyMap<string, MessageInfo>
  /** Messages in vertical order. */
  readonly ordered: readonly MessageInfo[]
  readonly lifelines: ReadonlyMap<string, LifelineInfo>
  /** Lowest y used by messages and activation bars (null when there are none). */
  readonly lowestY: number | null
  /** y of the (first) message attached to an endpoint or gate view, by view ID. */
  readonly endpointY: ReadonlyMap<string, number>
}

const SORTS: readonly MessageSort[] = ['synchCall', 'asynchCall', 'asynchSignal', 'createMessage', 'deleteMessage', 'reply']

export function messageSortOf(model: Elem | null | undefined): MessageSort {
  const s = model?.['messageSort']
  return SORTS.includes(s as MessageSort) ? (s as MessageSort) : 'synchCall'
}

/** The lifeline view at one end of a message (the end view may be the lifeline's line part). */
function lifelineOf(end: View | null): View | null {
  return end && isKindOf(end, 'UMLSeqLifelineView') ? end : null
}

/** Bar gap: a bar ends at least this far below a bar nested in it. */
const NEST_GAP = 3

const cache = new WeakMap<LayoutContext, SequenceInfo>()

/** The sequence analysis of the diagram being laid out (computed once per layout pass). */
export function sequenceInfo(ctx: LayoutContext): SequenceInfo {
  let info = cache.get(ctx)
  if (!info) {
    info = analyzeSequence(ctx.diagram)
    cache.set(ctx, info)
  }
  return info
}

interface Draft {
  view: UMLSeqMessageView
  sort: MessageSort
  y: number
  x: number
  arrivalY: number
  tail: View | null
  head: View | null
  tailLifeline: string | null
  headLifeline: string | null
  self: boolean
  listIndex: number
}

interface Bar {
  messageId: string
  lifelineId: string
  top: number
  bottom: number
  order: number
  level: number
}

function analyzeSequence(diagram: Diagram): SequenceInfo {
  const views = (diagram.ownedViews ?? []).filter(
    (v): v is UMLSeqMessageView => isKindOf(v, 'UMLSeqMessageView') && v.visible !== false
  )
  const drafts: Draft[] = views.map((view, listIndex) => {
    const p0 = view.points?.[0]
    const y = Math.round(p0?.y ?? 0)
    const tail = view.tail ? topLevelOf(view.tail) : null
    const head = view.head ? topLevelOf(view.head) : null
    const tl = lifelineOf(tail)
    const hl = lifelineOf(head)
    const self = tl !== null && tl === hl
    return {
      view,
      sort: messageSortOf(view.model),
      y,
      x: Math.round(p0?.x ?? 0),
      arrivalY: self ? y + SPACING.selfMessageHeight : y,
      tail,
      head,
      tailLifeline: tl?._id ?? null,
      headLifeline: hl?._id ?? null,
      self,
      listIndex
    }
  })
  drafts.sort((a, b) => a.y - b.y || a.x - b.x || a.listIndex - b.listIndex)

  // Sequence numbers.
  const showNumbers = diagram['showSequenceNumber'] !== false
  const custom = diagram['sequenceNumbering'] === 'custom'
  const numberOf = (d: Draft, i: number): string => {
    if (!showNumbers) return ''
    if (!custom) return String(i + 1)
    const s = d.view.model?.['sequenceNumber']
    return typeof s === 'string' ? s : ''
  }

  // Creation / destruction.
  const created = new Map<string, number>()
  const destroyed = new Map<string, number>()
  for (const d of drafts) {
    if (!d.headLifeline || d.self) continue
    if (d.sort === 'createMessage' && !created.has(d.headLifeline)) created.set(d.headLifeline, d.y)
    if (d.sort === 'deleteMessage' && !destroyed.has(d.headLifeline)) destroyed.set(d.headLifeline, d.y)
  }

  // Activation bars.
  const showActivation = diagram['showActivation'] !== false
  const bars = new Map<string, Bar>()
  if (showActivation) {
    drafts.forEach((d, order) => {
      if (!d.headLifeline || d.sort === 'deleteMessage' || !messageNotation(d.sort).activation) return
      const stored = (d.view.activation as NodeView | null | undefined)?.height
      const height = Math.max(MIN_SIZES.activation.height, typeof stored === 'number' ? stored : 0)
      bars.set(d.view._id, { messageId: d.view._id, lifelineId: d.headLifeline, top: d.arrivalY, bottom: d.arrivalY + height, order, level: 0 })
    })
    // Synchronous calls last until their reply (inner calls match first).
    const used = new Set<Draft>()
    for (let i = drafts.length - 1; i >= 0; i--) {
      const call = drafts[i] as Draft
      const bar = bars.get(call.view._id)
      if (!bar || call.sort !== 'synchCall' || call.self) continue
      const reply = drafts.find(
        (r) => !used.has(r) && r.sort === 'reply' && r.y > call.y && r.tailLifeline === call.headLifeline && r.headLifeline === call.tailLifeline
      )
      if (reply) {
        used.add(reply)
        bar.bottom = Math.max(bar.bottom, reply.y)
      }
    }
  }
  const byLifeline = new Map<string, Bar[]>()
  for (const bar of bars.values()) {
    const list = byLifeline.get(bar.lifelineId) ?? []
    list.push(bar)
    byLifeline.set(bar.lifelineId, list)
  }
  for (const list of byLifeline.values()) {
    list.sort((a, b) => a.top - b.top || a.order - b.order)
    // Bottoms, innermost first: a bar encloses every bar that starts within it.
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i] as Bar
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j] as Bar
        if (b.top <= a.bottom) a.bottom = Math.max(a.bottom, b.bottom + NEST_GAP)
      }
    }
    // Nesting levels.
    const open: Bar[] = []
    for (const bar of list) {
      while (open.length > 0 && (open[open.length - 1] as Bar).bottom < bar.top) open.pop()
      bar.level = open.length
      open.push(bar)
    }
  }

  const activationOf = (bar: Bar | undefined): ActivationInfo | null =>
    bar ? { messageId: bar.messageId, lifelineId: bar.lifelineId, top: bar.top, bottom: bar.bottom, level: bar.level } : null

  const messages = new Map<string, MessageInfo>()
  const ordered: MessageInfo[] = []
  const endpointY = new Map<string, number>()
  let lowestY: number | null = null
  drafts.forEach((d, i) => {
    const info: MessageInfo = {
      view: d.view,
      sort: d.sort,
      y: d.y,
      arrivalY: d.arrivalY,
      tail: d.tail,
      head: d.head,
      tailLifeline: d.tailLifeline,
      headLifeline: d.headLifeline,
      self: d.self,
      index: i,
      sequenceNumber: numberOf(d, i),
      activation: activationOf(bars.get(d.view._id))
    }
    messages.set(d.view._id, info)
    ordered.push(info)
    lowestY = Math.max(lowestY ?? -Infinity, d.arrivalY, info.activation?.bottom ?? -Infinity)
    for (const end of [d.tail, d.head]) {
      if (end && !lifelineOf(end) && !endpointY.has(end._id)) endpointY.set(end._id, d.y)
    }
  })

  const lifelines = new Map<string, LifelineInfo>()
  const ids = new Set<string>([...created.keys(), ...destroyed.keys(), ...byLifeline.keys()])
  for (const id of ids) {
    lifelines.set(id, {
      createdAt: created.get(id) ?? null,
      destroyedAt: destroyed.get(id) ?? null,
      activations: (byLifeline.get(id) ?? []).map((b) => activationOf(b) as ActivationInfo)
    })
  }
  return { messages, ordered, lifelines, lowestY, endpointY }
}

export const EMPTY_LIFELINE_INFO: LifelineInfo = { createdAt: null, destroyedAt: null, activations: [] }

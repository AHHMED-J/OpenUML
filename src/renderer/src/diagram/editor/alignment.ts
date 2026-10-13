/**
 * Alignment, distribution, equal sizing and z-order of selected node views (spec 02 §7.9).
 * Each command is one undoable operation; edges and labels in the selection are ignored.
 */
import { moveViews, setViewBounds } from '../../commands'
import { isKindOf, type NodeView, type View } from '../../model'
import type { Rect } from '../core'
import { layoutOf, withGeometry, type DiagramEnv } from './actions'

export type AlignOp =
  | 'align-left'
  | 'align-right'
  | 'align-center'
  | 'align-top'
  | 'align-bottom'
  | 'align-middle'
  | 'space-equally-horizontally'
  | 'space-equally-vertically'
  | 'set-width-equally'
  | 'set-height-equally'
  | 'set-size-equally'
  | 'make-same-size'

export const ALIGN_OPS: readonly AlignOp[] = [
  'align-left',
  'align-right',
  'align-center',
  'align-top',
  'align-bottom',
  'align-middle',
  'space-equally-horizontally',
  'space-equally-vertically',
  'set-width-equally',
  'set-height-equally',
  'set-size-equally',
  'make-same-size'
]

/** Target boxes for `op` (same order as `boxes`). Pure. */
export function alignBoxes(op: AlignOp, boxes: readonly Rect[]): Rect[] {
  const out = boxes.map((b) => ({ ...b }))
  if (out.length < 2) return out
  const minLeft = Math.min(...out.map((b) => b.left))
  const maxRight = Math.max(...out.map((b) => b.left + b.width))
  const minTop = Math.min(...out.map((b) => b.top))
  const maxBottom = Math.max(...out.map((b) => b.top + b.height))
  const maxW = Math.max(...out.map((b) => b.width))
  const maxH = Math.max(...out.map((b) => b.height))
  switch (op) {
    case 'align-left':
      out.forEach((b) => (b.left = minLeft))
      break
    case 'align-right':
      out.forEach((b) => (b.left = maxRight - b.width))
      break
    case 'align-center': {
      const cx = (minLeft + maxRight) / 2
      out.forEach((b) => (b.left = Math.round(cx - b.width / 2)))
      break
    }
    case 'align-top':
      out.forEach((b) => (b.top = minTop))
      break
    case 'align-bottom':
      out.forEach((b) => (b.top = maxBottom - b.height))
      break
    case 'align-middle': {
      const cy = (minTop + maxBottom) / 2
      out.forEach((b) => (b.top = Math.round(cy - b.height / 2)))
      break
    }
    case 'space-equally-horizontally':
    case 'space-equally-vertically': {
      if (out.length < 3) break
      const horizontal = op === 'space-equally-horizontally'
      const pos = (b: Rect): number => (horizontal ? b.left : b.top)
      const size = (b: Rect): number => (horizontal ? b.width : b.height)
      const sorted = [...out].sort((a, b) => pos(a) - pos(b))
      const first = sorted[0] as Rect
      const last = sorted[sorted.length - 1] as Rect
      const total = pos(last) + size(last) - pos(first)
      const gap = (total - sorted.reduce((s, b) => s + size(b), 0)) / (sorted.length - 1)
      let at = pos(first)
      for (const b of sorted) {
        const value = Math.round(at)
        if (horizontal) b.left = value
        else b.top = value
        at += size(b) + gap
      }
      break
    }
    case 'set-width-equally':
      out.forEach((b) => (b.width = maxW))
      break
    case 'set-height-equally':
      out.forEach((b) => (b.height = maxH))
      break
    case 'set-size-equally':
      out.forEach((b) => {
        b.width = maxW
        b.height = maxH
      })
      break
    case 'make-same-size': {
      // The first box (the primary selection) gives the size; positions stay.
      const first = boxes[0] as Rect
      out.forEach((b) => {
        b.width = first.width
        b.height = first.height
      })
      break
    }
  }
  return out
}

const OP_NAMES: Record<AlignOp, string> = {
  'align-left': 'Align Left',
  'align-right': 'Align Right',
  'align-center': 'Align Center',
  'align-top': 'Align Top',
  'align-bottom': 'Align Bottom',
  'align-middle': 'Align Middle',
  'space-equally-horizontally': 'Space Equally',
  'space-equally-vertically': 'Space Equally',
  'set-width-equally': 'Set Width Equally',
  'set-height-equally': 'Set Height Equally',
  'set-size-equally': 'Set Size Equally',
  'make-same-size': 'Make Same Size'
}

function selectedNodes(env: DiagramEnv, ids: readonly string[]): NodeView[] {
  const repo = env.engine.repository
  return ids
    .map((id) => repo.get(id))
    .filter((v): v is NodeView => isKindOf(v, 'NodeView') && v._parent === env.diagram)
}

/** Applies an alignment operation to the selected node views (one undo step). */
export function alignViews(env: DiagramEnv, ids: readonly string[], op: AlignOp): void {
  const nodes = selectedNodes(env, ids)
  if (nodes.length < 2) return
  const layout = layoutOf(env)
  const boxes = nodes.map((n) => layout.nodes.get(n._id)?.box ?? { left: n.left, top: n.top, width: n.width, height: n.height })
  const targets = alignBoxes(op, boxes)
  withGeometry(env, OP_NAMES[op], () => {
    nodes.forEach((n, i) => {
      const from = boxes[i] as Rect
      const to = targets[i] as Rect
      if (to.left !== from.left || to.top !== from.top) moveViews(env.engine, [n], to.left - from.left, to.top - from.top)
      if (to.width !== from.width || to.height !== from.height) setViewBounds(env.engine, n, { width: to.width, height: to.height })
    })
  })
}

/** Brings the selected top-level views to the front (end of the list) or sends them to the back. */
export function reorderViews(env: DiagramEnv, ids: readonly string[], where: 'front' | 'back'): void {
  const repo = env.engine.repository
  const views = ids.map((id) => repo.get(id)).filter((v): v is View => isKindOf(v, 'View') && v._parent === env.diagram)
  if (views.length === 0) return
  const list = env.diagram.ownedViews
  const ordered = [...views].sort((a, b) => list.indexOf(a) - list.indexOf(b))
  env.engine.transact(where === 'front' ? 'Bring to Front' : 'Send to Back', (b) => {
    if (where === 'front') for (const v of ordered) b.reorder(env.diagram, 'ownedViews', v, list.length - 1)
    else for (const v of [...ordered].reverse()) b.reorder(env.diagram, 'ownedViews', v, 0)
  })
}

/**
 * Screen-only parts of the box table of a parent arrow (`assignPopover.ts`): the popover next to
 * the arrow (`AssignPopover`, an HTML overlay) and the ghost of the arrows it would draw or remove
 * (`AssignGhost`, an SVG overlay inside the zoomed diagram).
 */
import type React from 'react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Elem, View } from '../../model'
import type { Point, Rect } from '../core'
import type { OverlayProps } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'
import { arrowToBox, assignParentArrow, portAssignment } from './assignment'
import {
  arrowHeader,
  assignPopoverState,
  assignResult,
  boxChoices,
  closeAssignPopover,
  lossWarning,
  subscribeAssignPopover,
  toggleAssignBox,
  type AssignPopoverState
} from './assignPopover'
import { IDEF0_ROLE_COLORS } from './colors'
import type { PortData } from './layout'

const LOSS_COLOR = '#c4372f'

function useAssignPopover(): AssignPopoverState | null {
  return useSyncExternalStore(subscribeAssignPopover, assignPopoverState, assignPopoverState)
}

/** The open popover's port on this diagram with its layout, or null. */
function openPort(props: OverlayProps, state: AssignPopoverState | null): { port: Elem; data: PortData } | null {
  if (!state || state.diagramId !== props.env.diagram._id) return null
  const port = props.env.engine.repository.get(state.portId) as Elem | undefined
  if (!port || !portAssignment(port)) return null
  const view = props.env.diagram.ownedViews.find((v) => v.model === port)
  const data = view ? (props.layout.nodes.get(view._id)?.data as PortData | undefined) : undefined
  return data ? { port, data } : null
}

function boxRect(layout: DiagramLayout, diagramViews: readonly View[], box: Elem): Rect | null {
  const view = diagramViews.find((v) => v._type === 'IDEF0FunctionView' && v.model === box)
  return view ? (layout.nodes.get(view._id)?.box ?? null) : null
}

/** An orthogonal path from the port anchor `a` to the side of `box` the role uses (reversed for outputs). */
function ghostPath(role: string, a: Point, box: Rect): Point[] {
  const midX = box.left + box.width / 2
  const midY = box.top + box.height / 2
  switch (role) {
    case 'control': {
      const y = box.top - 16
      return [a, { x: a.x, y }, { x: midX, y }, { x: midX, y: box.top }]
    }
    case 'mechanism': {
      const y = box.top + box.height + 16
      return [a, { x: a.x, y }, { x: midX, y }, { x: midX, y: box.top + box.height }]
    }
    case 'output': {
      const x = box.left + box.width + 16
      return [{ x: box.left + box.width, y: midY }, { x, y: midY }, { x, y: a.y }, a]
    }
    default: {
      const x = box.left - 16
      return [a, { x, y: a.y }, { x, y: midY }, { x: box.left, y: midY }]
    }
  }
}

/** Arrowhead at the last point of `points`, pointing along its last segment. */
function head(points: readonly Point[], size: number): string {
  const tip = points[points.length - 1] as Point
  const from = points[points.length - 2] as Point
  const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1
  const ux = (tip.x - from.x) / len
  const uy = (tip.y - from.y) / len
  const bx = tip.x - ux * size
  const by = tip.y - uy * size
  return `${tip.x},${tip.y} ${bx - uy * size * 0.45},${by + ux * size * 0.45} ${bx + uy * size * 0.45},${by - ux * size * 0.45}`
}

/** Ghost of the open popover's choice: the arrows it would add (dashed, role color) and remove (red). */
export function AssignGhost(props: OverlayProps): React.JSX.Element | null {
  const state = useAssignPopover()
  const open = openPort(props, state)
  if (!open || !state) return null
  const { port, data } = open
  const assignment = portAssignment(port)
  if (!assignment) return null
  const views = props.env.diagram.ownedViews
  const color = IDEF0_ROLE_COLORS[assignment.role] ?? IDEF0_ROLE_COLORS.input
  const width = 2 / props.zoom
  const added: Point[][] = []
  for (const id of state.checked) {
    const box = props.env.engine.repository.get(id) as Elem | undefined
    const rect = box && !assignment.boxes.includes(box) ? boxRect(props.layout, views, box) : null
    if (rect) added.push(ghostPath(assignment.role, data.anchor, rect))
  }
  const removed: Point[][] = []
  for (const box of assignment.boxes) {
    if (state.checked.includes(box._id)) continue
    const arrow = arrowToBox(port, box)
    const view = arrow ? views.find((v) => v.model === arrow) : undefined
    const points = view ? props.layout.edges.get(view._id)?.points : undefined
    if (points && points.length > 1) removed.push([...points])
  }
  return (
    <g className="idef0-assign-ghost" pointerEvents="none">
      {added.map((pts, i) => (
        <g key={`a${i}`} opacity={0.6}>
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeDasharray={`${6 / props.zoom} ${4 / props.zoom}`} />
          <polygon points={head(pts, 9)} fill={color} />
        </g>
      ))}
      {removed.map((pts, i) => (
        <polyline key={`r${i}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={LOSS_COLOR} strokeOpacity={0.7} strokeWidth={width * 2} strokeDasharray={`${4 / props.zoom} ${4 / props.zoom}`} />
      ))}
    </g>
  )
}

/**
 * Where the popover goes next to the arrow: beside the stub's free end, toward the sheet, off the
 * line the arrow runs along from the frame so its ghost stays in sight.
 */
function popoverPosition(role: string, data: PortData, zoom: number): React.CSSProperties {
  const at = data.pending?.handle ?? data.anchor
  const x = at.x * zoom
  const y = at.y * zoom
  switch (role) {
    case 'control':
      return { left: x + 18, top: y + 14 }
    case 'mechanism':
      return { left: x + 18, bottom: `calc(100% - ${y - 14}px)` }
    case 'output':
      return { right: `calc(100% - ${x - 14}px)`, top: y + 18 }
    default:
      return { left: x + 14, top: y + 18 }
  }
}

/** The box table of a parent arrow, next to it on the canvas. */
export function AssignPopover(props: OverlayProps): React.JSX.Element | null {
  const state = useAssignPopover()
  const open = openPort(props, state)
  const ref = useRef<HTMLDivElement>(null)
  const isOpen = !!open
  // A press anywhere else closes it (the editor below still gets the press).
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeAssignPopover()
    }
    document.addEventListener('pointerdown', onDown, true)
    ref.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [isOpen, state?.portId])
  if (!open || !state) return null
  const { port, data } = open
  const assignment = portAssignment(port)
  if (!assignment) return null
  const header = arrowHeader(props.env.diagram, port)
  const choices = boxChoices(props.env.diagram)
  const checked = choices.filter((c) => state.checked.includes(c.box._id)).map((c) => c.box)
  const loss = assignment.readOnly ? null : lossWarning(port, checked)
  const connect = (): void => {
    try {
      assignParentArrow(props.env, port, checked)
    } catch (err) {
      props.notify(err instanceof Error ? err.message : String(err))
    }
    closeAssignPopover()
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    // Keys stay in the popover: Delete, arrows and shortcuts must not reach the diagram.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAssignPopover()
    } else if (e.key === 'Enter' && !assignment.readOnly) {
      e.preventDefault()
      connect()
    }
  }
  return (
    <div
      ref={ref}
      className="idef0-assign-popover"
      role="dialog"
      aria-label={`Connect ${header.code} ${header.name}`}
      style={popoverPosition(header.role, data, props.zoom)}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="idef0-assign-header">
        <span className={`idef0-role-pill role-${header.role}`}>{header.code || header.role[0]?.toUpperCase()}</span>
        <span className={header.name === '(unnamed)' ? 'idef0-assign-name muted' : 'idef0-assign-name'}>{header.name}</span>
      </div>
      <div className="idef0-assign-subtitle muted">{header.subtitle}</div>
      {assignment.readOnly ? (
        <div className="idef0-assign-note">{assignment.readOnly}</div>
      ) : (
        <div className="idef0-assign-boxes" role="group" aria-label="Boxes">
          {choices.map((c) => (
            <label key={c.box._id} className="idef0-assign-box">
              <input type="checkbox" checked={state.checked.includes(c.box._id)} onChange={() => toggleAssignBox(c.box._id)} />
              <span className="idef0-assign-number">{c.number}</span>
              <span className="idef0-assign-boxname">{c.name}</span>
            </label>
          ))}
        </div>
      )}
      {!assignment.readOnly && (
        <div className={checked.length === 0 ? 'idef0-assign-result warn' : 'idef0-assign-result muted'}>
          {checked.length === 0 ? 'No box: stays a pending arrow' : `${checked.length} box${checked.length === 1 ? '' : 'es'} → ${assignResult(header.role, checked.length)}`}
        </div>
      )}
      {loss && (
        <div className="idef0-assign-loss" role="alert">
          {loss}
        </div>
      )}
      <div className="idef0-assign-buttons">
        <button className="button" onClick={closeAssignPopover}>
          {assignment.readOnly ? 'Close' : 'Cancel'}
        </button>
        {!assignment.readOnly && (
          <button className="button primary" onClick={connect}>
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

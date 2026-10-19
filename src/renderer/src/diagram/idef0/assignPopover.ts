/**
 * The box table of a parent arrow (Forma 2): clicking a pending arrow, or Connect to... on a
 * boundary arrow, opens a popover listing the boxes of its diagram; the checked boxes are previewed
 * on the canvas and Connect applies them with `assignParentArrow`. This module holds the open
 * popover (one at a time, screen only) and the texts both the popover and the Advanced Arrows panel
 * show; `assignOverlay.tsx` draws it.
 */
import { diagramNodeNumber, diagramOfScope, effectiveArrowName, icomCodes, isKindOf, nodeNumber, roleOf, type Elem, type Idef0Role } from '../../model'
import { assignmentLosses, portAssignment } from './assignment'

export interface AssignPopoverState {
  readonly diagramId: string
  readonly portId: string
  /** IDs of the checked boxes. */
  readonly checked: readonly string[]
}

let current: AssignPopoverState | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Opens the box table of `port` (a boundary port of `diagram` standing for a parent arrow), its current boxes checked. */
export function openAssignPopover(diagram: Elem, port: Elem): void {
  const assignment = portAssignment(port)
  if (!assignment) return
  current = { diagramId: diagram._id, portId: port._id, checked: assignment.boxes.map((b) => b._id) }
  notify()
}

/** Checks or unchecks a box in the open popover. */
export function toggleAssignBox(boxId: string): void {
  if (!current) return
  const checked = current.checked.includes(boxId) ? current.checked.filter((id) => id !== boxId) : [...current.checked, boxId]
  current = { ...current, checked }
  notify()
}

export function closeAssignPopover(): void {
  if (!current) return
  current = null
  notify()
}

export function assignPopoverState(): AssignPopoverState | null {
  return current
}

export function subscribeAssignPopover(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const ROLE_NAMES: Readonly<Record<string, string>> = { input: 'Input', control: 'Control', output: 'Output', mechanism: 'Mechanism' }
const ROLE_SIDES: Readonly<Record<string, string>> = { input: 'enters from the left of', control: 'enters from the top of', output: 'leaves from the right of', mechanism: 'enters from the bottom of' }

/**
 * Header texts of a parent arrow: ICOM code on its diagram, name (or "(unnamed)"), and the role
 * line. `codes` is the diagram's `icomCodes`, passed when several headers are built at once.
 */
export function arrowHeader(diagram: Elem, port: Elem, codes: ReadonlyMap<string, string> = icomCodes(diagram)): { code: string; name: string; role: Idef0Role; subtitle: string } {
  const role = roleOf(port)
  const name = effectiveArrowName(port['corresponds'] as Elem).trim()
  return { code: codes.get(port._id) ?? '', name: name || '(unnamed)', role, subtitle: `${ROLE_NAMES[role] ?? role} · ${ROLE_SIDES[role] ?? 'goes to'}:` }
}

/** The boxes of a diagram a parent arrow can go to, in box-number order, with their node number and name. */
export function boxChoices(diagram: Elem): Array<{ box: Elem; number: string; name: string }> {
  const scope = diagram._parent
  const boxes = ((scope?.['functions'] as Elem[] | undefined) ?? []).filter((f) => isKindOf(f, 'IDEF0Function'))
  return [...boxes]
    .sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))
    .map((box) => ({ box, number: nodeNumber(box), name: ((box['name'] as string | undefined) ?? '').trim() }))
}

/** What `count` checked boxes make of an arrow of `role`. */
export function assignResult(role: Idef0Role, count: number): string {
  if (count === 0) return 'not assigned'
  if (count === 1) return '1 box'
  return role === 'output' ? `join from ${count}` : `fork to ${count}`
}

/**
 * The warning shown before boxes with their own child diagram lose this arrow: "Removes 3 arrows
 * inside A2 Diagram", or null when nothing below goes away.
 */
export function lossWarning(port: Elem, boxes: readonly Elem[]): string | null {
  const losses = assignmentLosses(port, boxes)
  if (losses.length === 0) return null
  const diagrams = [...new Set(losses.map((a) => diagramOfScope(a._parent)).filter((d): d is Elem => !!d))]
  const where = diagrams.map((d) => `${diagramNodeNumber(d)} Diagram`).join(', ')
  return `Removes ${losses.length} arrow${losses.length === 1 ? '' : 's'} inside ${where}`
}

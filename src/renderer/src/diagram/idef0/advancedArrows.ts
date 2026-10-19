/**
 * The Advanced Arrows panel (Forma 1): the parent arrows of a decomposition diagram as a matrix,
 * one row per parent arrow (its boundary port) and one column per box. A checked cell means the
 * arrow reaches that box; toggling a cell applies at once through `assignParentArrow` (one undo
 * step per toggle). This module builds the matrix the panel shows; the panel lives in the shell.
 */
import { isContextDiagram, isIdef0Function, listField, type Elem, type Idef0Role } from '../../model'
import { portAssignment } from './assignment'
import { arrowHeader, assignResult, boxChoices } from './assignPopover'

/** One parent arrow of the diagram. */
export interface ArrowRow {
  readonly port: Elem
  /** ICOM code on this diagram (`I1`, `C2`...). */
  readonly code: string
  /** Effective name of the parent arrow, or "(unnamed)". */
  readonly name: string
  readonly unnamed: boolean
  readonly role: Idef0Role
  /** One flag per column of the matrix: does the arrow reach that box? */
  readonly checked: readonly boolean[]
  /** "not assigned", "1 box", "fork to N" or "join from N". */
  readonly result: string
  /** Why its boxes can't be changed here (tunneled, branches elsewhere), or null. */
  readonly readOnly: string | null
}

export interface ArrowMatrix {
  /** The columns: the boxes of the diagram in box-number order. */
  readonly boxes: ReturnType<typeof boxChoices>
  /** Inputs, controls, outputs, mechanisms, each in ICOM-code order. */
  readonly rows: readonly ArrowRow[]
}

const ROLE_ORDER: readonly Idef0Role[] = ['input', 'control', 'output', 'mechanism']

/** True for a diagram that details a box (A0, A1...): the only kind with parent arrows to assign. */
export function hasParentArrows(diagram: Elem | null | undefined): diagram is Elem {
  return !!diagram && diagram._type === 'IDEF0Diagram' && !isContextDiagram(diagram) && isIdef0Function(diagram._parent)
}

/** The matrix of `diagram`, or null when it is not a decomposition diagram. */
export function arrowMatrix(diagram: Elem): ArrowMatrix | null {
  if (!hasParentArrows(diagram)) return null
  const boxes = boxChoices(diagram)
  const rows: ArrowRow[] = []
  for (const port of listField(diagram._parent, 'ports')) {
    const assignment = portAssignment(port)
    if (!assignment) continue
    const header = arrowHeader(diagram, port)
    rows.push({
      port,
      code: header.code,
      name: header.name,
      unnamed: header.name === '(unnamed)',
      role: assignment.role,
      checked: boxes.map((b) => assignment.boxes.includes(b.box)),
      result: assignResult(assignment.role, assignment.boxes.length),
      readOnly: assignment.readOnly
    })
  }
  const number = (code: string): number => (code ? Number(code.slice(1)) : Number.POSITIVE_INFINITY)
  rows.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || number(a.code) - number(b.code))
  return { boxes, rows }
}

/** The boxes `port` reaches once `box` is toggled, in box-number order. */
export function toggledBoxes(diagram: Elem, port: Elem, box: Elem): Elem[] {
  const current = portAssignment(port)?.boxes ?? []
  const next = current.includes(box) ? current.filter((b) => b !== box) : [...current, box]
  return boxChoices(diagram)
    .map((c) => c.box)
    .filter((b) => next.includes(b))
}

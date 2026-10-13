/**
 * IDEF0 consistency warnings W01-W18 (spec 11 §4.4). Warnings only: they never block editing or
 * saving. `validateIdef0(model)` walks the whole model; `validateDiagram` filters to one diagram.
 */
import {
  diagramOfScope,
  functionViewsOf,
  isContextDiagram,
  isIdef0Function,
  isKindOf,
  planRenumber,
  rootArrow,
  roleOf,
  type Elem
} from '../../model'

export type IdefIssueId = `W${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18'}`

export interface IdefIssue {
  readonly id: IdefIssueId
  readonly severity: 'warning'
  /** The element to select when the issue is clicked. */
  readonly elementId: string
  /** The diagram the issue belongs to, when there is one. */
  readonly diagramId: string | null
  readonly message: string
}

const GENERIC_NAMES = new Set(['function', 'activity', 'process', 'input', 'output', 'control', 'mechanism'])

/** Common imperative verbs accepted as one-word box names (W06 heuristic; "Order" is deliberately absent, it reads as a noun). */
const VERBS = new Set(
  `accept add analyze approve archive assemble assess assign audit authorize bill build calculate cancel check classify close collect compile complete compute configure confirm control convert coordinate create decide define deliver deploy design detect develop diagnose dispatch distribute document edit enter estimate evaluate examine execute export extract fill filter forecast generate handle identify implement import inspect install integrate invoice issue launch load log maintain manage manufacture map measure merge monitor negotiate notify open operate optimize organize pack pay perform pick plan post prepare print process procure produce program publish purchase queue rate receive record register reject release repair replace report request reserve resolve review route sample save schedule screen search select sell send serve ship sign sort store submit supply support test track train transfer transform translate transmit update upload validate verify view weigh write`.split(/\s+/)
)

function list(el: Elem | null | undefined, field: string): Elem[] {
  const value = el?.[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

function nameOf(el: Elem): string {
  return ((el['name'] as string | undefined) ?? '').trim()
}

function isGeneric(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  return words.length > 0 && words.every((w) => GENERIC_NAMES.has(w))
}

function isBranch(arrow: Elem): boolean {
  return isKindOf(arrow['source'] as Elem | null, 'IDEF0Arrow') || isKindOf(arrow['target'] as Elem | null, 'IDEF0Arrow')
}

function descr(el: Elem): string {
  return nameOf(el) || `(${el._type.replace(/^IDEF0/, '')})`
}

/** Warnings for one scope (the model or a function) and the diagram it owns. */
function validateScope(scope: Elem, issues: IdefIssue[]): void {
  const diagram = diagramOfScope(scope)
  const diagramId = diagram?._id ?? null
  const add = (id: IdefIssueId, el: Elem, message: string): void => {
    issues.push({ id, severity: 'warning', elementId: el._id, diagramId, message })
  }
  const isModel = isKindOf(scope, 'IDEF0Model')
  const arrows = list(scope, 'arrows')
  const ports = list(scope, 'ports')
  const boxes: Elem[] = isModel ? (scope['topFunction'] ? [scope['topFunction'] as Elem] : []) : list(scope, 'functions')
  const views = diagram ? functionViewsOf(diagram) : []

  // W01 / W02 / W10: box counts and numbering.
  if (!isModel && diagram && !isContextDiagram(diagram)) {
    if (boxes.length < 3 || boxes.length > 6) add('W01', diagram, `Diagram "${descr(diagram)}" has ${boxes.length} boxes (3 to 6 expected)`)
    for (const fn of boxes) {
      if ((fn['boxNumber'] as number) > 9) add('W01', fn, `Box number ${fn['boxNumber']} of "${descr(fn)}" makes node numbers ambiguous`)
    }
    const numbers = boxes.map((f) => f['boxNumber'] as number).sort((a, b) => a - b)
    const consecutive = numbers.every((n, i) => n === i + 1)
    // Box numbers are kept where the user put them; only a diagram that follows the staircase
    // automatically (`autoNumber`) also warns when the numbers disagree with it.
    const offStaircase = diagram['autoNumber'] === true && planRenumber(diagram).length > 0
    if (!consecutive || offStaircase) add('W10', diagram, `Box numbers of "${descr(diagram)}" are duplicated, have gaps or disagree with the staircase order (Renumber Boxes)`)
  }
  if (isModel && diagram) {
    if (views.length !== 1) add('W02', diagram, `The context diagram must have exactly one box (found ${views.length})`)
    const top = boxes[0]
    if (top && top['boxNumber'] !== 0) add('W02', top, `The box of the context diagram must have box number 0`)
    // W15: purpose and viewpoint.
    if (!((scope['purpose'] as string) ?? '').trim() || !((scope['viewpoint'] as string) ?? '').trim()) add('W15', scope, 'The context diagram has no purpose or no viewpoint statement')
  }

  const labelsSeen = new Map<string, Elem>()
  const namesSeen = new Map<string, Elem>()
  for (const fn of boxes) {
    const name = nameOf(fn)
    // W05 / W06: names.
    if (!name) add('W05', fn, 'A function box has no name')
    else if (isGeneric(name)) add('W05', fn, `The name "${name}" only repeats a generic word`)
    else if (!/\(v\)\s*$/i.test(name) && /^[A-Za-z]+$/.test(name) && !VERBS.has(name.toLowerCase())) {
      add('W06', fn, `"${name}" does not look like a verb phrase (append "(v)" to confirm)`)
    }
    // W13: duplicate box names.
    if (name) {
      if (namesSeen.has(name.toLowerCase())) add('W13', fn, `Another box on this diagram is also named "${name}"`)
      else namesSeen.set(name.toLowerCase(), fn)
    }
    const attached = arrows.filter((a) => a['source'] === fn || a['target'] === fn)
    // W03: control and output.
    if (!attached.some((a) => a['target'] === fn && roleOf(a) === 'control')) add('W03', fn, `"${descr(fn)}" has no control arrow`)
    if (!attached.some((a) => a['source'] === fn && roleOf(a) !== 'call')) add('W03', fn, `"${descr(fn)}" has no output arrow`)
    // W04: one call arrow at most.
    const calls = attached.filter((a) => a['source'] === fn && roleOf(a) === 'call')
    calls.slice(1).forEach((a) => add('W04', a, `"${descr(fn)}" has more than one call arrow`))
    // W14: call arrows need a target.
    for (const call of calls) {
      if (!fn['calledFunction'] && !((call['calledNode'] as string) ?? '')) add('W14', call, `The call arrow of "${descr(fn)}" does not say which box it calls`)
    }
    // W16: no arrows at all.
    if (attached.length === 0 && !arrows.some((a) => rootArrow(a) && (a['source'] === fn || a['target'] === fn))) add('W16', fn, `"${descr(fn)}" has no arrows`)
    // W11: child diagram consistency.
    const child = fn['childDiagram'] as Elem | null
    if (child) {
      if (child._parent !== fn) add('W11', fn, `The child diagram of "${descr(fn)}" is not owned by it`)
      else if (nameOf(child) !== name) add('W11', child, `Diagram "${descr(child)}" is not named like its parent box "${name}"`)
    }
    // W09: every untunneled parent arrow appears on the child diagram.
    if (child && child._parent === fn) {
      const childPorts = list(fn, 'ports')
      for (const a of arrows) {
        const entering = a['target'] === fn && roleOf(a) !== 'call'
        const leaving = a['source'] === fn && roleOf(a) !== 'call'
        if (!entering && !leaving) continue
        if (entering ? a['tunnelTarget'] : a['tunnelSource']) continue
        const root = rootArrow(a)
        if (!childPorts.some((p) => p['corresponds'] === a || (p['corresponds'] && rootArrow(p['corresponds'] as Elem) === root))) {
          add('W09', a, `Arrow "${descr(a)}" of "${descr(fn)}" has no boundary arrow on its child diagram`)
        }
      }
    }
  }

  for (const a of arrows) {
    const label = nameOf(a)
    const branch = isBranch(a)
    const call = roleOf(a) === 'call'
    // W05 / W07 / W13: arrow labels.
    if (!call) {
      if (!label && !branch) add('W05', a, 'An arrow has no label')
      else if (label && isGeneric(label)) add('W05', a, `The label "${label}" only repeats a generic word`)
      if (!label && branch && !nameOf(rootArrow(a))) add('W07', a, 'A branch and its trunk are both unlabeled')
      if (label && !branch) {
        const key = label.toLowerCase()
        if (labelsSeen.has(key)) add('W13', a, `Another arrow on this diagram is also labeled "${label}"`)
        else labelsSeen.set(key, a)
      }
    }
    // W12: a function feeding itself.
    if (a['source'] && a['source'] === a['target'] && isIdef0Function(a['source'] as Elem)) add('W12', a, `"${descr(a['source'] as Elem)}" feeds itself`)
    // W18: cycles and trunks on another diagram.
    const seen = new Set<Elem>()
    let cur: Elem | null = a
    let broken = false
    while (cur && isKindOf(cur, 'IDEF0Arrow')) {
      if (seen.has(cur)) {
        broken = true
        break
      }
      seen.add(cur)
      const next: Elem | null = isKindOf(cur['source'] as Elem | null, 'IDEF0Arrow') ? (cur['source'] as Elem) : isKindOf(cur['target'] as Elem | null, 'IDEF0Arrow') ? (cur['target'] as Elem) : null
      if (next && next._parent !== a._parent) broken = true
      cur = next
      if (broken) break
    }
    if (broken) add('W18', a, 'The branch structure of this arrow is inconsistent (cycle or trunk on another diagram)')
    // W17: connected-end tunnel whose boundary counterpart is missing.
    const toPort = isKindOf(a['source'] as Elem | null, 'IDEF0Port') ? (a['source'] as Elem) : isKindOf(a['target'] as Elem | null, 'IDEF0Port') ? (a['target'] as Elem) : null
    const connectedTunnel = toPort && (toPort === a['source'] ? a['tunnelTarget'] : a['tunnelSource'])
    if (toPort && connectedTunnel && !isModel && !toPort['corresponds']) add('W17', a, `A tunneled end of "${descr(a)}" has no matching arrow on the parent diagram`)
  }

  // W08: boundary arrows on decomposition diagrams.
  if (!isModel) {
    for (const port of ports) {
      if (port['corresponds']) continue
      const touching = arrows.filter((a) => a['source'] === port || a['target'] === port)
      const tunneled = touching.some((a) => (a['source'] === port ? a['tunnelSource'] : a['tunnelTarget']) === true)
      if (!tunneled) add('W08', port, `A boundary arrow of "${descr(scope)}" stands for no arrow of the parent box`)
    }
  }
}

/** All warnings of an IDEF0 model, in model order. */
export function validateIdef0(model: Elem): IdefIssue[] {
  const issues: IdefIssue[] = []
  const visit = (scope: Elem): void => {
    validateScope(scope, issues)
    for (const fn of list(scope, 'functions')) visit(fn)
  }
  const top = model['topFunction'] as Elem | null
  validateScope(model, issues)
  if (top) visit(top)
  return issues
}

/** Warnings that belong to one diagram. */
export function validateDiagram(model: Elem, diagram: Elem): IdefIssue[] {
  return validateIdef0(model).filter((i) => i.diagramId === diagram._id)
}

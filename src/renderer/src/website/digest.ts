/**
 * The data of an interactive website export (`WebsiteDigest`): the model tree as the Model
 * Explorer shows it, every exported diagram as the SVG export draws it, which element each view
 * shows, and the IDEF0 navigation between diagrams. Only what the viewer needs; never the full
 * project file.
 */
import {
  WEBSITE_DIGEST_VERSION,
  type BoxDigest,
  type DiagramDigest,
  type ElementDigest,
  type IcomEntry,
  type TreeEntry,
  type WalkStep,
  type WebsiteDigest
} from '../../../shared/website'
import {
  arrowDisplayName,
  boxArrowGroups,
  ICOM_LETTER,
  icomCodes,
  isContextDiagram,
  isIdef0Function,
  isKindOf,
  listField,
  nodeNumber,
  rootArrow,
  scopeOf,
  typeDisplayName,
  type Diagram,
  type Elem,
  type Idef0Role,
  type Repository,
  type View
} from '../model'
import { childTarget, parentTarget } from '../diagram/idef0/navigation'
import type { TextMeasurer } from '../diagram/core'
import { renderDiagramSvg } from '../export'
import { elementNode, explorerLabel, otherEndText, treeChildren, treeLabel, treeTooltip, type TreeNode } from '../ui/explorer/tree'

export interface DigestOptions {
  readonly title: string
  /** "OpenUML 0.1.4". */
  readonly generator: string
  /** Diagrams to export (default: all), kept in model order. */
  readonly diagramIds?: readonly string[]
  /** The diagram shown first when exported (default: the first exported one). */
  readonly start?: string | null
  readonly measurer: TextMeasurer
}

/**
 * A tree row and its children, as in the Model Explorer but without the IDEF0 role folders and
 * arrow rows (a box's arrows are listed under the diagram instead).
 */
function treeEntry(node: TreeNode): TreeEntry {
  return {
    key: node.key,
    label: treeLabel(node),
    tooltip: treeTooltip(node),
    ...(node.kind !== 'folder' ? { element: node.el._id, type: node.el._type } : {}),
    children: treeChildren(node)
      .filter((child) => child.kind === 'element')
      .map(treeEntry)
  }
}

// ---------------------------------------------------------------------------------------------
// IDEF0: ICOM lists and the guided walk

function arrowViewsOn(repository: Repository, arrow: Elem, diagram: Diagram): string[] {
  return repository
    .viewsOf(arrow)
    .filter((v) => v._type === 'IDEF0ArrowView' && repository.diagramOf(v) === diagram)
    .map((v) => v._id)
}

/** An arrow's label; an unlabeled branch takes the label of the arrow it branches from. */
function arrowName(arrow: Elem): string {
  return arrowDisplayName(arrow) || arrowDisplayName(rootArrow(arrow))
}

/** The arrows of a box by role, numbered along each side (`I1`, `C2`, ...), with where they go. */
function boxIcom(repository: Repository, diagram: Diagram, fn: Elem): IcomEntry[] {
  return boxArrowGroups(fn).flatMap((group) =>
    group.arrows.map((arrow, i) => ({
      role: group.role,
      code: group.role === 'call' ? 'Call' : `${ICOM_LETTER[group.role] ?? ''}${i + 1}`,
      name: arrowName(arrow),
      detail: otherEndText(arrow, group.role),
      views: arrowViewsOn(repository, arrow, diagram)
    }))
  )
}

/** The boxes a boundary arrow reaches (through its forks or joins), as `A1, A3`. */
function boxesReached(port: Elem, arrows: readonly Elem[], entering: boolean): string {
  const from = entering ? 'source' : 'target'
  const to = entering ? 'target' : 'source'
  const seen = new Set<Elem>()
  const boxes: string[] = []
  const queue = arrows.filter((a) => a[from] === port)
  while (queue.length > 0) {
    const arrow = queue.shift() as Elem
    if (seen.has(arrow)) continue
    seen.add(arrow)
    const end = arrow[to] as Elem | null
    if (isIdef0Function(end) && !boxes.includes(nodeNumber(end))) boxes.push(nodeNumber(end))
    queue.push(...arrows.filter((a) => a[from] === arrow))
  }
  return boxes.join(', ')
}

const ROLE_RANK: Readonly<Record<string, number>> = { input: 0, control: 1, output: 2, mechanism: 3, call: 4 }

/** The boundary arrows of a sheet in ICOM order (on A-0: the arrows of its single box). */
function sheetIcom(repository: Repository, diagram: Diagram): IcomEntry[] {
  const scope = scopeOf(diagram)
  if (!scope) return []
  if (isContextDiagram(diagram)) {
    const top = scope['topFunction'] as Elem | null
    return top ? boxIcom(repository, diagram, top) : []
  }
  const codes = icomCodes(diagram)
  const arrows = listField(scope, 'arrows').filter((a) => isKindOf(a, 'IDEF0Arrow'))
  const entries: IcomEntry[] = []
  for (const port of listField(scope, 'ports')) {
    const role = port['role'] as Idef0Role
    const code = codes.get(port._id) ?? ICOM_LETTER[role] ?? ''
    const entering = role !== 'output'
    const touching = arrows.filter((a) => a['source'] === port || a['target'] === port)
    const reached = boxesReached(port, arrows, entering)
    entries.push({
      role,
      code,
      name: touching.map(arrowName).find(Boolean) ?? '',
      detail: reached ? `${entering ? 'to' : 'from'} ${reached}` : '',
      views: touching.flatMap((a) => arrowViewsOn(repository, a, diagram))
    })
  }
  const number = (code: string): number => Number(code.replace(/^\D+/, '')) || 0
  return entries.sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || number(a.code) - number(b.code))
}

/** The function box views of a diagram in box-number order. */
function boxViews(diagram: Diagram): View[] {
  return topViews(diagram)
    .filter((v) => v._type === 'IDEF0FunctionView' && isIdef0Function(v.model))
    .sort((a, b) => ((a.model as Elem)['boxNumber'] as number) - ((b.model as Elem)['boxNumber'] as number))
}

/**
 * The guided walk: every exported diagram in tree order; on an IDEF0 diagram, after the whole
 * sheet, each box in box-number order, and right after a decomposed box its child diagram's walk
 * (A-0, A0, A1, A2, A3, A3's diagram, A31, A32, A4, ...). The A-0 box itself is not a step: its
 * child A0 follows A-0 directly.
 */
function walkSteps(diagrams: readonly DiagramDigest[]): WalkStep[] {
  const byId = new Map(diagrams.map((d) => [d.id, d]))
  const steps: WalkStep[] = []
  const visited = new Set<string>()
  const visit = (d: DiagramDigest): void => {
    if (visited.has(d.id)) return
    visited.add(d.id)
    steps.push({ diagram: d.id, view: null })
    for (const view of Object.keys(d.boxes)) {
      if (!d.context) steps.push({ diagram: d.id, view })
      const child = byId.get(d.drill[view] ?? '')
      if (child) visit(child)
    }
  }
  for (const d of diagrams) if (!d.parent) visit(d)
  for (const d of diagrams) visit(d)
  return steps
}

function topViews(diagram: Diagram): View[] {
  return ((diagram.ownedViews ?? []) as View[]).filter((v) => isKindOf(v, 'View'))
}

/** Ids of the elements of `entries`, depth first (the order the Model Explorer lists them in). */
function treeOrder(entries: readonly TreeEntry[], out: string[] = []): string[] {
  for (const entry of entries) {
    if (entry.element) out.push(entry.element)
    treeOrder(entry.children, out)
  }
  return out
}

function modelTree(repository: Repository): TreeEntry[] {
  const project = repository.project
  return project ? [treeEntry(elementNode(project))] : []
}

function sortedLikeTree(diagrams: Diagram[], tree: readonly TreeEntry[]): Diagram[] {
  const position = new Map(treeOrder(tree).map((id, i) => [id, i]))
  return diagrams.sort((a, b) => (position.get(a._id) ?? Infinity) - (position.get(b._id) ?? Infinity))
}

/** Every diagram of the model in the order the Model Explorer lists them. */
export function diagramsInTreeOrder(repository: Repository): Diagram[] {
  return sortedLikeTree(repository.diagrams() as Diagram[], modelTree(repository))
}

export function buildWebsiteDigest(repository: Repository, options: DigestOptions): WebsiteDigest {
  const tree = modelTree(repository)
  const wanted = options.diagramIds ? new Set(options.diagramIds) : null
  const diagrams = sortedLikeTree(repository.diagrams().filter((d) => !wanted || wanted.has(d._id)) as Diagram[], tree)
  if (diagrams.length === 0) throw new Error('Choose at least one diagram to export.')
  const exported = new Set(diagrams.map((d) => d._id))

  const elements: Record<string, ElementDigest & { views: { diagram: string; view: string }[] }> = {}
  const elementOf = (el: Elem): ElementDigest & { views: { diagram: string; view: string }[] } => {
    let digest = elements[el._id]
    if (!digest) {
      digest = { id: el._id, type: el._type, typeLabel: typeDisplayName(el._type), label: explorerLabel(el), views: [] }
      elements[el._id] = digest
    }
    return digest
  }

  const digests: Record<string, DiagramDigest> = {}
  for (const diagram of diagrams) {
    const { svg, bounds } = renderDiagramSvg(diagram, repository, options.measurer)
    const views: Record<string, string | null> = {}
    const drill: Record<string, string> = {}
    for (const view of topViews(diagram)) {
      const model = view.model ?? null
      views[view._id] = model?._id ?? null
      if (model) elementOf(model).views.push({ diagram: diagram._id, view: view._id })
      const child = view._type === 'IDEF0FunctionView' ? childTarget(model) : null
      if (child && exported.has(child._id)) drill[view._id] = child._id
    }
    const idef0 = isKindOf(diagram, 'IDEF0Diagram')
    const parent = idef0 ? parentTarget(diagram) : null
    const boxes: Record<string, BoxDigest> = {}
    if (idef0) for (const view of boxViews(diagram)) boxes[view._id] = { label: explorerLabel(view.model as Elem), icom: boxIcom(repository, diagram, view.model as Elem) }
    digests[diagram._id] = {
      id: diagram._id,
      type: diagram._type,
      label: explorerLabel(diagram),
      svg,
      bounds,
      views,
      drill,
      parent: parent && exported.has(parent.diagram._id) ? { diagram: parent.diagram._id, view: parent.view?._id ?? null } : null,
      context: idef0 && isContextDiagram(diagram),
      boxes,
      icom: idef0 ? sheetIcom(repository, diagram) : []
    }
    elementOf(diagram)
  }

  const visit = (entries: readonly TreeEntry[]): void => {
    for (const entry of entries) {
      const el = entry.element ? repository.get(entry.element) : undefined
      if (el) elementOf(el)
      visit(entry.children)
    }
  }
  visit(tree)

  const start = options.start && exported.has(options.start) ? options.start : (diagrams[0] as Diagram)._id
  return {
    version: WEBSITE_DIGEST_VERSION,
    title: options.title,
    generator: options.generator,
    tree,
    elements,
    diagrams: digests,
    diagramOrder: diagrams.map((d) => d._id),
    start,
    steps: walkSteps(diagrams.map((d) => digests[d._id] as DiagramDigest))
  }
}

/**
 * The data of an interactive website export (`WebsiteDigest`): the model tree as the Model
 * Explorer shows it, every exported diagram as the SVG export draws it, which element each view
 * shows, and the IDEF0 navigation between diagrams. Only what the viewer needs; never the full
 * project file.
 */
import { WEBSITE_DIGEST_VERSION, type DiagramDigest, type ElementDigest, type TreeEntry, type WebsiteDigest } from '../../../shared/website'
import { isKindOf, typeDisplayName, type Diagram, type Elem, type Repository, type View } from '../model'
import { childTarget, parentTarget } from '../diagram/idef0/navigation'
import type { TextMeasurer } from '../diagram/core'
import { renderDiagramSvg } from '../export'
import { elementNode, explorerLabel, treeChildren, treeLabel, treeTooltip, type TreeNode } from '../ui/explorer/tree'

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

function treeEntry(node: TreeNode): TreeEntry {
  return {
    key: node.key,
    label: treeLabel(node),
    tooltip: treeTooltip(node),
    ...(node.kind !== 'folder' ? { element: node.el._id, type: node.el._type } : {}),
    children: treeChildren(node).map(treeEntry)
  }
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
    const parent = isKindOf(diagram, 'IDEF0Diagram') ? parentTarget(diagram) : null
    digests[diagram._id] = {
      id: diagram._id,
      type: diagram._type,
      label: explorerLabel(diagram),
      svg,
      bounds,
      views,
      drill,
      parent: parent && exported.has(parent.diagram._id) ? { diagram: parent.diagram._id, view: parent.view?._id ?? null } : null
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
    start
  }
}

/** Reading and writing whole `.mdj` projects, including load-time repairs and version migration. */
import {
  fieldOf,
  findContainment,
  isElem,
  isKindOf,
  referenceFields,
  Repository,
  walk,
  type Diagram,
  type Elem,
  type Project
} from '../model'
import { ElementReader, serializeElement, type WriteOptions } from './codec'
import { FormatError, isElementJson, parseJsonText, stringifyJson } from './json'

/** Document version written by OpenUML (`Project.documentVersion`). */
export const DOCUMENT_VERSION = 1

export interface ReadResult {
  readonly repository: Repository
  readonly project: Project
  /** Non-fatal problems found while loading (unknown types, dangling references, repairs). */
  readonly warnings: string[]
}

/**
 * Reads a `.mdj` project. Accepts both the compact (defaults omitted) and verbose writer styles,
 * tolerates a BOM, resolves references, applies the load-time repairs and migrates old documents.
 * Throws `FormatError` when the text is not JSON or the root is not a Project.
 */
export function readMdj(text: string): ReadResult {
  const json = parseJsonText(text)
  if (!isElementJson(json) || json._type !== 'Project') {
    throw new FormatError('Not a project file: the root element must be of type "Project"')
  }
  const reader = new ElementReader()
  const root = reader.read(json) as Project
  reader.resolve()
  const warnings = [...reader.warnings]
  repairModel(root, reader.missingParent, warnings)
  migrateDocument(root, warnings)
  return { repository: new Repository(root), project: root, warnings }
}

/** Serializes a project (or any element) in the `.mdj` style: TAB-indented, no trailing newline. */
export function writeMdj(root: Elem, options: WriteOptions = {}): string {
  return stringifyJson(serializeElement(root, options))
}

// =============================================================================================
// Load-time repairs

/** Named embedded sub-view refs whose absence makes a top-level view invalid. */
const REQUIRED_EMBEDDED = [
  'nameLabel',
  'stereotypeLabel',
  'propertyLabel',
  'tailRoleNameLabel',
  'tailPropertyLabel',
  'tailMultiplicityLabel',
  'headRoleNameLabel',
  'headPropertyLabel',
  'headMultiplicityLabel',
  'tailQualifiersCompartment',
  'headQualifiersCompartment'
]

function detach(el: Elem, warnings: string[], reason: string): void {
  const c = findContainment(el)
  if (!c) return
  const value = c.owner[c.field]
  if (Array.isArray(value)) value.splice(c.index, 1)
  else c.owner[c.field] = null
  warnings.push(`Removed ${el._type} ${el._id}: ${reason}`)
}

function isBrokenRelationship(el: Elem): boolean {
  if (isKindOf(el, 'UndirectedRelationship')) {
    return !el.end1 || !el.end2 || !el.end1.reference || !el.end2.reference
  }
  if (isKindOf(el, 'DirectedRelationship')) return !el.source || !el.target
  return false
}

function invalidViewReason(view: Elem, live: Set<Elem>, missingParent: Set<string>): string | null {
  if ((isKindOf(view, 'UMLGeneralNodeView') || isKindOf(view, 'UMLGeneralEdgeView')) && !view['model']) {
    return 'view has no model'
  }
  if (missingParent.has(view._id)) return 'view has no _parent'
  if (isKindOf(view, 'EdgeView') && !isKindOf(view, 'FreelineEdgeView') && (!view.head || !view.tail)) {
    return 'edge has no head or tail'
  }
  const model = view['model']
  if (isElem(model) && !live.has(model)) return 'its model was removed'
  for (const name of REQUIRED_EMBEDDED) {
    if (fieldOf(view, name)?.kind === 'ref' && !isElem(view[name])) return `embedded ${name} is missing`
  }
  if (view._type === 'UMLCommMessageView' && !view['hostEdge']) return 'message has no host edge'
  return null
}

/** Drops references to elements that are no longer in the tree. */
function clearDanglingRefs(live: Set<Elem>): number {
  let cleared = 0
  for (const el of live) {
    for (const field of referenceFields(el)) {
      const value = el[field.name]
      if (Array.isArray(value)) {
        const kept = value.filter((v) => !isElem(v) || live.has(v))
        if (kept.length !== value.length) {
          el[field.name] = kept
          cleared++
        }
      } else if (isElem(value) && !live.has(value)) {
        el[field.name] = null
        cleared++
      }
    }
  }
  return cleared
}

/**
 * Silently cleans damaged content so that files other tools accept also open here:
 * broken relationships, invalid top-level diagram views, out-of-range label distances,
 * and references left dangling by those removals.
 */
export function repairModel(root: Elem, missingParent: Set<string>, warnings: string[]): void {
  for (const el of [...walk(root)]) {
    if (isBrokenRelationship(el)) detach(el, warnings, 'relationship is missing an end')
    if (isKindOf(el, 'ParasiticView') && el.distance > 5000) el.distance = 10
  }
  // Removing a view can invalidate edges attached to it, so repeat until stable.
  for (;;) {
    let live = new Set(walk(root))
    let changed = false
    for (const el of live) {
      if (!isKindOf(el, 'Diagram')) continue
      for (const view of [...el.ownedViews]) {
        if (!live.has(view)) continue
        const reason = invalidViewReason(view, live, missingParent)
        if (reason) {
          detach(view, warnings, reason)
          changed = true
        }
      }
    }
    live = new Set(walk(root))
    if (clearDanglingRefs(live) > 0) changed = true
    if (!changed) break
  }
}

/** Upgrades documents older than `DOCUMENT_VERSION`: subject views are moved behind other views. */
export function migrateDocument(project: Project, warnings: string[]): void {
  const version = typeof project.documentVersion === 'number' ? project.documentVersion : 0
  if (version > DOCUMENT_VERSION) {
    warnings.push(`Document version ${version} is newer than supported (${DOCUMENT_VERSION})`)
    return
  }
  if (version >= DOCUMENT_VERSION) return
  for (const el of walk(project)) {
    if (!isKindOf(el, 'Diagram')) continue
    const diagram: Diagram = el
    const subjects = diagram.ownedViews.filter((v) => v._type === 'UMLUseCaseSubjectView')
    if (subjects.length > 0) {
      diagram.ownedViews = [...subjects, ...diagram.ownedViews.filter((v) => v._type !== 'UMLUseCaseSubjectView')]
    }
  }
  project.documentVersion = DOCUMENT_VERSION
}

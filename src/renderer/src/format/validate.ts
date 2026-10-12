/** Structural checks that every written project should pass. */
import { fieldsOf, findContainment, isElem, isKindOf, referenceFields, walk, type Elem, type View } from '../model'

/**
 * Returns a list of problems (empty when valid):
 * unique IDs; `_parent` matches the containing element; references point into the tree; named
 * embedded sub-view refs point into the view's `subViews`; edge views have head and tail whose
 * models match the relationship ends; general node/edge views have a model.
 */
export function validateModel(root: Elem): string[] {
  const problems: string[] = []
  const all = [...walk(root)]
  const live = new Set(all)
  const ids = new Set<string>()

  for (const el of all) {
    const at = `${el._type} ${el._id}`
    if (!el._id) problems.push(`${el._type} has no _id`)
    else if (ids.has(el._id)) problems.push(`Duplicate _id ${el._id}`)
    ids.add(el._id)

    if (el !== root && (!el._parent || !findContainment(el))) problems.push(`${at}: _parent does not contain it`)

    for (const field of referenceFields(el)) {
      const value = el[field.name]
      const targets = Array.isArray(value) ? value : [value]
      for (const t of targets) if (isElem(t) && !live.has(t)) problems.push(`${at}.${field.name}: dangling reference`)
    }

    if (isKindOf(el, 'View')) {
      for (const field of fieldsOf(el)) {
        if (!field.embedded) continue
        const sub = el[field.name]
        if (!isElem(sub)) {
          if (isKindOf(el, 'UMLGeneralEdgeView') || field.name === 'nameCompartment') {
            problems.push(`${at}: missing embedded ${field.name}`)
          }
        } else if (!(el.subViews as Elem[]).includes(sub)) {
          problems.push(`${at}: embedded ${field.name} is not in subViews`)
        }
      }
      if ((isKindOf(el, 'UMLGeneralNodeView') || isKindOf(el, 'UMLGeneralEdgeView')) && !el.model) {
        problems.push(`${at}: view has no model`)
      }
    }

    if (isKindOf(el, 'EdgeView') && !isKindOf(el, 'FreelineEdgeView')) {
      // An IDEF0 call arrow leaves a function box and has no head view.
      const headless = el._type === 'IDEF0ArrowView' && el.model?.['role'] === 'call'
      if ((!el.head && !headless) || !el.tail) problems.push(`${at}: edge without head or tail`)
      const model = el.model
      if (el.head && el.tail && model) {
        const [src, dst] = isKindOf(model, 'UndirectedRelationship')
          ? [model.end1?.reference, model.end2?.reference]
          : isKindOf(model, 'DirectedRelationship')
            ? [model.source, model.target]
            : [undefined, undefined]
        // A timing message joins time segments (state invariants) whose `covered` lifelines are its ends.
        const endIs = (view: View, expected: unknown): boolean =>
          view.model === expected ||
          (isKindOf(view.model, 'UMLStateInvariant') && view.model?.['covered'] === expected) ||
          // A communication connector joins lifelines; its ends reference the roles they represent.
          (isKindOf(view.model, 'UMLLifeline') && view.model['represent'] === expected)
        if (src !== undefined && (!endIs(el.tail, src) || !endIs(el.head, dst))) {
          problems.push(`${at}: edge ends do not match the relationship`)
        }
      }
    }
  }
  return problems
}

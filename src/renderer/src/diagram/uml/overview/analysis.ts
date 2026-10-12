/**
 * What an interaction overview node refers to (spec 28 §1, §3): an action of kind callBehavior
 * whose `target` is an interaction use (reference node), a sequence diagram (inline node) or, when
 * no interaction owns the activity, an interaction directly. Pure model lookups.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { nameOf } from '../../layout/helpers'

/** The target of an overview action, or null. */
export function overviewTarget(action: Elem | null | undefined): Elem | null {
  const t = action?.['target']
  return t && typeof t === 'object' ? (t as Elem) : null
}

/** The interaction use behind a reference node, or null. */
export function referencedUse(action: Elem | null | undefined): Elem | null {
  const t = overviewTarget(action)
  return isKindOf(t, 'UMLInteractionUse') ? t : null
}

/** The sequence diagram behind an inline node, or null. */
export function referencedDiagram(action: Elem | null | undefined): Elem | null {
  const t = overviewTarget(action)
  return isKindOf(t, 'UMLSequenceDiagram') ? t : null
}

/** The interaction an overview node stands for. */
export function referencedInteraction(action: Elem | null | undefined): Elem | null {
  const t = overviewTarget(action)
  if (!t) return null
  if (isKindOf(t, 'UMLInteractionUse')) {
    const r = t['refersTo']
    return r && typeof r === 'object' ? (r as Elem) : null
  }
  if (isKindOf(t, 'UMLInteraction')) return t
  if (isKindOf(t, 'UMLSequenceDiagram')) return isKindOf(t._parent, 'UMLInteraction') ? t._parent : null
  return null
}

/**
 * Text of a reference node: `[recipient = ]InteractionName[(arguments)][: returnValue]`
 * (the interaction use's own data; the action's name when it refers to nothing).
 */
export function interactionUseText(action: Elem | null | undefined): string {
  const use = referencedUse(action)
  const interaction = referencedInteraction(action)
  const name = nameOf(interaction) || nameOf(use) || nameOf(action)
  if (!use) return name
  const recipient = nameOf(use['returnValueRecipient'] as Elem | null)
  const args = typeof use['arguments'] === 'string' ? (use['arguments'] as string) : ''
  const ret = typeof use['returnValue'] === 'string' ? (use['returnValue'] as string) : ''
  return `${recipient ? `${recipient} = ` : ''}${name}${args ? `(${args})` : ''}${ret ? `: ${ret}` : ''}`
}

/**
 * Element opened by double-clicking an overview node: the referenced sequence diagram of an
 * inline node, the referenced interaction (to select in the explorer) of a reference node.
 */
export function overviewNavigationTarget(view: View): Elem | null {
  const action = view.model
  if (!isKindOf(action, 'UMLAction')) return null
  if (view._type === 'UMLInteractionInlineView') return referencedDiagram(action) ?? referencedInteraction(action)
  return referencedInteraction(action)
}

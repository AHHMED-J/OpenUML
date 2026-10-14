/**
 * Multiplicity of the ends of the selected association (or link / connector): one command per
 * end and value (`edit.multiplicity.end1.0-n`, ...), labelled by the class each end touches,
 * for the command palette and the canvas context menu ("Multiplicity ▸" for the end the menu was
 * opened near, else one submenu per end). Each change is one undo step.
 */
import { setFields, type CommandRegistry } from '../../commands'
import { getContextEdgeEnd } from '../../diagram'
import { isKindOf, type Elem, type View } from '../../model'
import { projectStore, selectedViews } from '../../store'
import type { MenuNode } from '../menus/menuModel'
import { MULTIPLICITY_OPTIONS } from '../properties/propertyRows'

export type EndKey = 'end1' | 'end2'

/** Values offered: the usual multiplicities, then '' (none). */
const END_MULTIPLICITY_VALUES: readonly string[] = [...MULTIPLICITY_OPTIONS, '']

function slug(value: string): string {
  return value === '' ? 'none' : value.replace(/\.\./g, '-').replace(/\*/g, 'n')
}

export function endMultiplicityCommandId(end: EndKey, value: string): string {
  return `edit.multiplicity.${end}.${slug(value)}`
}

function valueLabel(value: string): string {
  return value === '' ? '(none)' : value
}

/** The selected edge's model when exactly one edge with multiplicity-carrying ends is selected. */
function selectedEndsOwner(): { view: View; end1: Elem; end2: Elem } | null {
  const views = selectedViews(projectStore.getState())
  if (views.length !== 1) return null
  const view = views[0] as View
  if (!isKindOf(view, 'EdgeView')) return null
  const end1 = view.model?.['end1'] as Elem | null | undefined
  const end2 = view.model?.['end2'] as Elem | null | undefined
  if (!isKindOf(end1, 'UMLRelationshipEnd') || !isKindOf(end2, 'UMLRelationshipEnd')) return null
  return { view, end1, end2 }
}

function nameOf(el: unknown): string {
  const n = (el as Elem | null | undefined)?.['name']
  return typeof n === 'string' ? n : ''
}

/** How an end is named in menus: by the class it touches ("Customer end"), or "End 1". */
export function endLabel(end1: Elem, end2: Elem, end: EndKey): string {
  const n1 = nameOf(end1['reference'])
  const n2 = nameOf(end2['reference'])
  const index = end === 'end1' ? 1 : 2
  const name = end === 'end1' ? n1 : n2
  if (!name) return `End ${index}`
  // Self-association: both ends touch the same class.
  return n1 === n2 ? `End ${index}, ${name}` : `${name} end`
}

function multiplicityOf(end: Elem): string {
  return String(end['multiplicity'] ?? '')
}

export function registerAssociationEndCommands(registry: CommandRegistry): void {
  for (const end of ['end1', 'end2'] as const) {
    for (const value of END_MULTIPLICITY_VALUES) {
      const id = endMultiplicityCommandId(end, value)
      if (registry.has(id)) continue
      registry.register({
        id,
        // A getter: the palette names the end by the class it touches in the current selection.
        get label(): string {
          const owner = selectedEndsOwner()
          const which = owner ? endLabel(owner.end1, owner.end2, end) : `End ${end === 'end1' ? 1 : 2}`
          return `Multiplicity (${which}): ${valueLabel(value)}`
        },
        isEnabled: () => selectedEndsOwner() !== null,
        isChecked: () => {
          const owner = selectedEndsOwner()
          return owner !== null && multiplicityOf(owner[end]) === value
        },
        run: () => {
          const owner = selectedEndsOwner()
          if (!owner || multiplicityOf(owner[end]) === value) return
          setFields(projectStore.getState().engine, owner[end], { multiplicity: value }, 'Change Multiplicity')
        }
      })
    }
  }
}

function valuesMenu(end: EndKey): MenuNode[] {
  return END_MULTIPLICITY_VALUES.map((value) => ({ label: valueLabel(value), command: endMultiplicityCommandId(end, value), checkbox: true }))
}

/**
 * Context-menu items for the selected association's end multiplicities: one "Multiplicity"
 * submenu for the end the menu was opened near, else one submenu per end. Empty otherwise.
 */
export function endMultiplicityMenu(): MenuNode[] {
  const owner = selectedEndsOwner()
  if (!owner) return []
  const near = getContextEdgeEnd()
  const nearEnd: EndKey | null =
    near && near.viewId === owner.view._id ? (near.endId === owner.end1._id ? 'end1' : near.endId === owner.end2._id ? 'end2' : null) : null
  if (nearEnd) return [{ label: 'Multiplicity', submenu: valuesMenu(nearEnd) }]
  return (['end1', 'end2'] as const).map((end) => ({ label: `Multiplicity (${endLabel(owner.end1, owner.end2, end)})`, submenu: valuesMenu(end) }))
}

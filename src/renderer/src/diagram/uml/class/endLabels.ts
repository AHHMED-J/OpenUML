/**
 * Labels at the ends of association-style edges (associations, links, connectors): role name,
 * property and multiplicity. Empty role names and multiplicities keep an editor-only slot so
 * they can be double-clicked; the multiplicity (or the role name when multiplicities are hidden)
 * is the end's main edit, opened by double-clicking the line near that end.
 */
import type { EdgeView, Elem } from '../../../model'
import type { EdgeLabelSpec } from '../../layout/edges'
import { nameEditText } from '../../layout/helpers'
import { endPropertyText, roleNameText } from './strings'

export function associationEndLabels(edge: EdgeView, end: Elem | null | undefined, side: 'tail' | 'head'): EdgeLabelSpec[] {
  if (!end) return []
  const showMultiplicity = edge['showMultiplicity'] !== false
  const multiplicity = String(end['multiplicity'] ?? '')
  return [
    {
      field: `${side}RoleNameLabel`,
      defaults: `${side}RoleName`,
      text: roleNameText(end, edge['showVisibility'] === true),
      edit: { kind: 'name', elementId: end._id },
      editText: nameEditText(end),
      placeholder: 'role',
      ...(showMultiplicity ? {} : { endEdit: side })
    },
    {
      field: `${side}PropertyLabel`,
      defaults: `${side}Property`,
      text: edge['showProperty'] === false ? '' : endPropertyText(end)
    },
    {
      field: `${side}MultiplicityLabel`,
      defaults: `${side}Multiplicity`,
      text: showMultiplicity ? multiplicity : '',
      edit: { kind: 'field', elementId: end._id, field: 'multiplicity' },
      ...(showMultiplicity ? { placeholder: 'multiplicity', editText: multiplicity, endEdit: side } : {})
    }
  ]
}

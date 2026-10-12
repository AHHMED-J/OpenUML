/**
 * Textual forms of composite-structure elements (spec 25 §5): the `name: Type[mult]` label of
 * ports and parts, the collaboration-use label and the connector name label.
 */
import type { Elem } from '../../../model'
import { nameOf, visibilitySymbol } from '../../layout/helpers'
import { typeText } from '../class/strings'

export interface TypedFeatureFormat {
  readonly showVisibility?: boolean
  readonly showType?: boolean
  readonly showMultiplicity?: boolean
}

/** `[vis]name: Type[mult]` of a part or port (visibility hidden by default). */
export function typedFeatureText(attr: Elem | null | undefined, format: TypedFeatureFormat = {}): string {
  if (!attr) return ''
  const f = { showVisibility: false, showType: true, showMultiplicity: true, ...format }
  let s = f.showVisibility ? visibilitySymbol(attr['visibility']) : ''
  s += nameOf(attr)
  const type = typeText(attr['type'])
  if (f.showType && type) s += `: ${type}`
  const mult = attr['multiplicity']
  if (f.showMultiplicity && typeof mult === 'string' && mult) s += `[${mult}]`
  return s
}

/** `name: CollaborationName` of a collaboration use (just the name when untyped). */
export function collaborationUseText(use: Elem | null | undefined): string {
  if (!use) return ''
  const type = use['type'] as Elem | null | undefined
  const name = nameOf(use)
  return type ? `${name}: ${nameOf(type)}` : name
}

/** Middle label of a connector: `name` and `: TypeName` when the connector is typed. */
export function connectorLabelText(connector: Elem | null | undefined, showType = true): string {
  if (!connector) return ''
  const type = connector['type'] as Elem | null | undefined
  const name = nameOf(connector)
  return showType && type ? `${name}: ${nameOf(type)}` : name
}

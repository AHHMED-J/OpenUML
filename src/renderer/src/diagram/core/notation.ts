/**
 * Relationship kind → line dash and end decorations (spec 03 §3.6, §4.4 messages).
 *
 * Edges are directed tail → head: tail = source/client/specific, head = target/supplier/general.
 * Association `end1` is drawn at the tail, `end2` at the head.
 */
import type { EndSpec } from './endStyles'
import type { LineDash } from './style'

export type RelationshipKind =
  | 'association'
  | 'generalization'
  | 'dependency'
  | 'realization'
  | 'interfaceRealization'
  | 'include'
  | 'extend'
  | 'controlFlow'
  | 'objectFlow'
  | 'noteLink'
  | 'constraintLink'
  | 'associationClassLink'
  | 'containment'

/** Matches the model's `UMLNavigableKind`. */
type NavigableKind = 'unspecified' | 'navigable' | 'notNavigable'
/** Matches the model's `UMLAggregationKind`. */
type AggregationKind = 'none' | 'shared' | 'composite'
/** Matches the model's `UMLMessageSort`. */
export type MessageSort = 'synchCall' | 'asynchCall' | 'asynchSignal' | 'createMessage' | 'deleteMessage' | 'reply'

export interface AssociationEndInfo {
  navigable?: NavigableKind
  aggregation?: AggregationKind
  /** The end is owned by an attribute of the opposite classifier (draws the "owned end" dot). */
  ownedByOpposite?: boolean
}

export interface EdgeNotation {
  dash: LineDash
  tail: EndSpec
  head: EndSpec
  /** Keyword label always shown on the edge (e.g. «include»), without guillemets. */
  fixedKeyword?: string
}

/**
 * End decoration for one association end:
 *
 * | navigable    | none        | shared                 | composite                |
 * |--------------|-------------|------------------------|--------------------------|
 * | unspecified  | flat        | hollow diamond         | filled diamond           |
 * | navigable    | stick arrow | arrow + hollow diamond | arrow + filled diamond   |
 * | notNavigable | cross (X)   | hollow diamond         | filled diamond           |
 *
 * Owned ends add the dot variant.
 */
export function associationEndSpec(end: AssociationEndInfo = {}): EndSpec {
  const navigable = end.navigable ?? 'unspecified'
  const aggregation = end.aggregation ?? 'none'
  const dot = end.ownedByOpposite === true
  let style: EndSpec['style']
  if (aggregation === 'shared') style = navigable === 'navigable' ? 'arrowDiamond' : 'diamond'
  else if (aggregation === 'composite') style = navigable === 'navigable' ? 'arrowFilledDiamond' : 'filledDiamond'
  else style = navigable === 'navigable' ? 'stickArrow' : navigable === 'notNavigable' ? 'cross' : 'flat'
  return dot ? { style, dot } : { style }
}

export interface RelationshipNotationOptions {
  /** Association ends (`end1` → tail, `end2` → head). */
  end1?: AssociationEndInfo
  end2?: AssociationEndInfo
  /**
   * The head attaches to an interface drawn in iconic (lollipop) form: dependencies and
   * realizations become solid with no arrowhead.
   */
  headIsLollipop?: boolean
}

const FLAT: EndSpec = { style: 'flat' }

/** Line dash and end decorations for a relationship edge. */
export function relationshipNotation(kind: RelationshipKind, opts: RelationshipNotationOptions = {}): EdgeNotation {
  switch (kind) {
    case 'association':
      return { dash: 'solid', tail: associationEndSpec(opts.end1), head: associationEndSpec(opts.end2) }
    case 'generalization':
      return { dash: 'solid', tail: FLAT, head: { style: 'triangle' } }
    case 'dependency':
      if (opts.headIsLollipop) return { dash: 'solid', tail: FLAT, head: FLAT }
      return { dash: 'dot', tail: FLAT, head: { style: 'stickArrow' } }
    case 'realization':
    case 'interfaceRealization':
      if (opts.headIsLollipop) return { dash: 'solid', tail: FLAT, head: FLAT }
      return { dash: 'dot', tail: FLAT, head: { style: 'triangle' } }
    case 'include':
      return { dash: 'dot', tail: FLAT, head: { style: 'stickArrow' }, fixedKeyword: 'include' }
    case 'extend':
      return { dash: 'dot', tail: FLAT, head: { style: 'stickArrow' }, fixedKeyword: 'extend' }
    case 'controlFlow':
    case 'objectFlow':
      return { dash: 'solid', tail: FLAT, head: { style: 'stickArrow' } }
    case 'noteLink':
    case 'constraintLink':
    case 'associationClassLink':
      return { dash: 'dot', tail: FLAT, head: FLAT }
    case 'containment':
      return { dash: 'solid', tail: FLAT, head: { style: 'circlePlus' } }
  }
}

export interface MessageNotation extends EdgeNotation {
  /** The message triggers an activation bar on the receiver. */
  activation: boolean
}

/** Line dash, arrowhead and fixed keyword for a sequence message. */
export function messageNotation(sort: MessageSort): MessageNotation {
  switch (sort) {
    case 'synchCall':
      return { dash: 'solid', tail: FLAT, head: { style: 'solidArrow' }, activation: true }
    case 'asynchCall':
      return { dash: 'solid', tail: FLAT, head: { style: 'stickArrow' }, activation: true }
    case 'asynchSignal':
      return { dash: 'solid', tail: FLAT, head: { style: 'stickArrow' }, activation: false }
    case 'reply':
      return { dash: 'dot', tail: FLAT, head: { style: 'stickArrow' }, activation: false }
    case 'createMessage':
      return { dash: 'dot', tail: FLAT, head: { style: 'stickArrow' }, activation: false, fixedKeyword: 'create' }
    case 'deleteMessage':
      return { dash: 'solid', tail: FLAT, head: { style: 'solidArrow' }, activation: true, fixedKeyword: 'destroy' }
  }
}

/** Wraps a keyword or stereotype name in guillemets: `«name»`. */
export function guillemets(name: string): string {
  return `«${name}»`
}

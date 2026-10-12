/**
 * Model module — element types, metamodel registry, repository and factories. Pure TypeScript.
 *
 * Elements
 * - Elements are plain objects whose properties are the `.mdj` field names (`_type`, `_id`,
 *   `_parent`, `name`, `ownedElements`, `left`, ...). References are object references.
 *   Typed shapes live in `types.ts` (`Elem`, `Project`, `Diagram`, `View`, `NodeView`,
 *   `EdgeView`, `UMLClassifier`, ...). Narrow with `isKindOf(el, 'NodeView')`.
 * - `Font` (`View.font`) and `Points` (`EdgeView.points`) are immutable value objects; assign a
 *   new value to change them. Codec helpers: `parseFont`/`formatFont`, `parsePoints`/`formatPoints`.
 * - Never mutate elements that are in a repository directly; use `commands/` so the change is
 *   undoable and the UI re-renders.
 *
 * Metamodel (`metamodel.ts`)
 * - `getTypeInfo(type)` → fields (name, kind, type, default, embedded) in serialization order.
 * - `fieldsOf(el)`, `fieldOf(el, name)`, `containmentFields(el)`, `referenceFields(el)`.
 * - `isKindOf(el, type)`, `isSubtype(type, base)`, `getEnumLiterals(enumName)`, `typeDisplayName(type)`.
 * - `instantiate(type)` → detached element with constructor defaults (no ID).
 *
 * Repository (`repository.ts`)
 * - `new Repository(project)`; `get(id)`, `has(id)`, `elements()`, `root`, `project`.
 * - Tree: `containmentOf(el)`, `children(el)`, `descendants(el)`, `ancestors(el)`, `diagramOf(view)`.
 * - References: `findReferencing(target)`, `buildReverseIndex()`, `viewsOf(model)`.
 * - `diagrams()`, `defaultDiagram()`, `findByType(type)`, `generateId()`.
 *
 * Factories (`factories.ts`) build detached *plans* (`CreationPlan`: model, view, insertions,
 * refAdditions) that `commands/` applies as one undoable operation:
 * - `createDefaultProject()`; `planDiagram(kind, owner)`.
 * - `planNode({ kind, diagram, left, top, ... })` for every `NodeKind` (Class, Interface,
 *   Enumeration, Actor, UseCase, Subject, Lifeline, CombinedFragment, Action, control nodes,
 *   Partition, pins, Note, Text, ...). `NODE_KINDS` describes each kind.
 * - `planEdge({ kind, diagram, tail, head })` for every `EdgeKind` (associations, generalization,
 *   dependency, realization, include/extend, Message, flows, NoteLink); `canConnect(kind, tail, head)`.
 * - `planFeature(owner, 'Attribute' | 'Operation' | ...)`, `planItemViews(...)`, `createItemView(...)`.
 */
export * from './types'
export * from './values'
export { generateId } from './id'
export * from './metamodel'
export * from './repository'
export * from './view-builders'
export * from './factories'
export { newRegion, newStateMachine, type StateMachineNodeKind } from './factories-statemachine'
export type { TimingNodeKind } from './factories-timing'
export * from './structure-factories'

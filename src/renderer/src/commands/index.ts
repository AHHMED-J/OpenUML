/**
 * Commands module — undoable operations, the history engine, model edits and the command registry.
 *
 * Engine
 * - `new ModelEngine(repository)`; `engine.transact(name, (b) => { ... })` runs one operation:
 *   `b` is an `OperationBuilder` (`insert`, `remove`, `set`, `setAll`, `addRef`, `removeRef`,
 *   `reorder`, `move`) that applies each change immediately and records the matching primitive
 *   step (`I`, `R`, `a`, `i`, `r`, `o`). Nested `transact` calls join the outer operation; a
 *   throwing build is rolled back. `{ bypass: true }` applies without entering history.
 * - `registerTransactionHook(hook)`: runs at the end of every outermost transaction, inside it,
 *   with the recorded steps (derived changes join the same undo step).
 * - `undo()`, `redo()`, `canUndo`, `canRedo`, `undoName`, `redoName`; stacks capped at 100.
 * - `isDirty` / `markSaved()` / `clearHistory()`; `subscribe(listener)` gets
 *   `{ type: 'execute' | 'undo' | 'redo', operation }` after each change.
 *
 * Edits (one gesture = one undo step)
 * - Create: `createNode(engine, NodeRequest)`, `createEdge(engine, EdgeRequest)`,
 *   `createDiagram(engine, kind, owner)`, `createModelElement`, `addFeature` and the shortcuts
 *   `addAttribute`, `addOperation`, `addEnumerationLiteral`, `addExtensionPoint` (these also add
 *   item views to every view of the owner).
 * - Change: `setFields`, `setFieldsOfAll`, `rename`, `moveElement`, `reorderElement`.
 * - Geometry: `moveViews`, `setViewBounds`.
 * - Delete: `deleteFromModel(engine, elements)` (full cascade), `deleteFromView(engine, views)`;
 *   `collectDeletion` previews the cascade.
 * - Import: `importFragment(engine, text, owner)` (bypass).
 *
 * Registry
 * - `CommandRegistry` (`register`, `execute`, `isEnabled`, `isChecked`) and `CommandIds`.
 */
export * from './operation'
export * from './builder'
export * from './engine'
export * from './edits'
export * from './delete'
export * from './registry'

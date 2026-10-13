/**
 * Format module — `.mdj` project files and `.mfj` fragments. Pure TypeScript.
 *
 * - `readMdj(text)` → `{ repository, project, warnings }`. Tolerates a BOM and both writer styles
 *   (defaults omitted or written), resolves `{"$ref"}`, applies load-time repairs and migrates
 *   `documentVersion` < 1. Unknown types/fields are kept and written back unchanged.
 *   Throws `FormatError` for non-JSON text or a non-Project root.
 * - `writeMdj(project, { verbose? })` → TAB-indented JSON, `_type` first, fields in metamodel order,
 *   metamodel defaults / empty strings / empty lists / null refs omitted (unless `verbose`).
 * - Fragments: `writeFragment(el)`, `parseFragment(text)`, `remapIds(json)`; importing is
 *   `importFragment` in `commands/`.
 * - `validateModel(root)` → structural problems (IDs, `_parent`, refs, embedded sub-views, edge ends).
 * - `cssColorOr(value, fallback)`: colors from files, limited to plain color syntax.
 * - Low level (used by undo snapshots): `serializeElement`, `ElementReader`,
 *   `encodeFieldValue` / `decodeFieldValue`.
 */
export * from './json'
export * from './codec'
export * from './mdj'
export * from './fragment'
export * from './validate'
export * from './cssColor'

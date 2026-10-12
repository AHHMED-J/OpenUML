# OpenUML Architecture

OpenUML is an Electron desktop application written in TypeScript with a React renderer.

## Processes

| Process | Location | Responsibility |
| --- | --- | --- |
| Main | `src/main/` | Window lifecycle, native application menu, native dialogs, file I/O. The renderer may read `.mdj` files by path and write only files chosen in dialogs or opened in the session, and folders chosen for export (`fileAccess.ts`); writes are atomic (temporary file + rename). No modeling logic. |
| Preload | `src/preload/` | Exposes the typed `window.openuml` bridge (`src/shared/ipc.ts`) through `contextBridge`. |
| Renderer | `src/renderer/` | Everything else: model, commands, diagrams, UI. Runs sandboxed with `contextIsolation: true` and `nodeIntegration: false`. |

## Renderer modules

All renderer code lives in `src/renderer/src/`. Each module owns its directory; cross-module imports go through
the module's `index.ts`.

| Module | Directory | Responsibility |
| --- | --- | --- |
| Model | `model/` | Element types (core + UML), the `Repository` (ID index, containment, references), factories that create elements with their default views. Pure TypeScript, no React, no DOM. |
| Format | `format/` | Reading and writing `.mdj` project files (JSON with `_type`, `_id`, `_parent`, `{"$ref": id}` references). Pure TypeScript. |
| Commands | `commands/` | Undoable operations (each user action = one operation of field changes, insertions and removals), undo/redo stacks, the command registry (IDs → handlers + enablement), keymaps and menu definitions. |
| Store | `store/` | Application state (open project, file path, dirty flag, active diagram, selection, preferences) exposed to React through a Zustand store. |
| Diagram | `diagram/` | View geometry, measurement and layout of node/edge views, edge routing and junctions, hit testing, SVG rendering of every notation, the interactive diagram editor (select, move, resize, create, connect, inline edit, zoom). One subfolder per diagram family: `diagram/uml/class`, `diagram/uml/usecase`, `diagram/uml/sequence`, `diagram/uml/activity` and the other UML families, `diagram/rad` (Role Activity Diagram: roles as growing containers, threads routed from element positions, soft validation) and `diagram/idef0` (IDEF0 function modeling: boxes with derived node numbers, role-derived arrow sides with orthogonal routing, boundary ports with ICOM codes, decomposition and consistency warnings). A family may register per-diagram-type editor hooks (`registerDiagramHooks`: normalizing after every edit, edge creation, reconnecting, deleting). |
| UI | `ui/` | Application shell: model explorer, property editor, documentation editor, toolbox, diagram tabs, status bar, dialogs; panel docking (`ui/dock/`: panels rearranged between the left and right areas by long-press drag, persisted per viewer). |
| Export | `export/` | PNG and SVG export of diagrams. |

## Key decisions

- **Rendering:** diagrams are rendered as SVG by React components. SVG export serializes the same output without
  selection/grid overlays; PNG export rasterizes that SVG on a canvas at a chosen scale.
- **Model is the source of truth:** UI components never mutate elements directly. Every change goes through an
  operation in `commands/`, which makes undo/redo, the dirty flag and re-rendering consistent.
- **File compatibility:** the in-memory element field names follow the `.mdj` field names so that projects
  round-trip without a translation layer. Unknown element types and fields are preserved on save.
- **Clean room:** OpenUML is implemented from behavioral specifications in its own code. It contains no code,
  icons, or other assets from any proprietary product.

## Testing

`npm test` runs Vitest unit tests (`*.test.ts` next to the code). Model, format, commands and diagram geometry are
pure TypeScript and are expected to have unit tests.

/**
 * UI module — the application shell (React).
 *
 * Layout (`Shell.tsx`): toolbar; left sidebar with the Model Explorer (`explorer/`) and Working
 * Diagrams; center diagram area with tabs hosting the diagram module's `DiagramEditor`
 * (`diagramArea/`); right navigator with the Toolbox (`toolbox/`) and the Styles / Properties /
 * Documentation editors (`properties/`); status bar. Panels resize with `components/Splitter`.
 *
 * State: `uiStore.ts` (Zustand) holds UI-only state — active tool and lock, zoom per diagram,
 * panel visibility/sizes, preferences (theme, grid, snap, default font size), explorer options,
 * recent files, dialogs, context menu and toasts. Per-viewer persistence via `persist.ts`
 * (localStorage, failure-tolerant). The project itself lives in `store/`.
 *
 * Commands (`app/`): `commands.ts` owns the `CommandRegistry`, the `Keymap` and `runCommand`
 * (edit commands act natively on focused text fields). Registration order: diagram module, core
 * store commands, then the shell's own (`appCommands.ts`) for ids still free. `fileOps.ts`
 * implements new/open/save/close/export and the unsaved-changes prompt; `lifecycle.ts` wires the
 * window title, close requests, OS open-file, native menu sync and the keyboard dispatcher.
 *
 * Menus (`menus/`): command ids (`commandIds.ts`), default keymap (`keymaps.ts`, `cmdctrl`
 * token), the menu data model with resolution/native conversion (`menuModel.ts`), the
 * application and context menu trees (`appMenu.ts`) and in-app popups (`ContextMenu.tsx`).
 *
 * Pure, unit-tested helpers: `keymap.ts`, `recentFiles.ts`, `menus/menuModel.ts`,
 * `properties/propertyRows.ts`, `explorer/tree.ts`, `modelActions.ts`, `toolbox/palettes.ts`,
 * `dialogs/paletteSearch.ts`.
 *
 * Drag and drop: explorer rows carry the element id as `application/x-openuml-element`.
 */
export { Shell } from './Shell'
export { uiStore, useUiStore } from './uiStore'
export type { PaletteTool, Preferences } from './uiStore'
export { ELEMENT_DRAG_TYPE } from './explorer/ModelExplorer'

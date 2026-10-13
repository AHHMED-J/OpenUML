/**
 * UI module — the application shell (React).
 *
 * Layout (`Shell.tsx`): toolbar; left and right dock areas around the center diagram area with
 * tabs hosting the diagram module's `DiagramEditor` (`diagramArea/`); status bar. Dockable panels
 * — Model Explorer (`explorer/`), Working Diagrams, Toolbox (`toolbox/`), Styles, Properties and
 * Documentation (`properties/`) — stack vertically in either area (default: explorer + working
 * diagrams left, toolbox + editors right). `dock/`: the pure docking model (`dockModel.ts`) and
 * drop-target geometry (`dropTarget.ts`), the unified panel chrome and stacks (`DockArea.tsx`),
 * and the long-press drag controller (`dragController.ts`, live state outside React). Areas
 * resize with `components/Splitter`, stacked panels with the dock's own splitters.
 *
 * State: `uiStore.ts` (Zustand) holds UI-only state — active tool and lock, zoom per diagram,
 * area visibility/widths and the dock layout, preferences (theme, grid, snap, default font
 * size), explorer options, recent files, dialogs, context menu and toasts. Per-viewer persistence via `persist.ts`
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
 * `dialogs/paletteSearch.ts`, `dock/dockModel.ts`, `dock/dropTarget.ts`.
 *
 * Drag and drop: explorer rows carry the element id as `application/x-openuml-element`.
 */
export { Shell } from './Shell'

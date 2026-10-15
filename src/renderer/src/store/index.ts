/**
 * Store module — application state for React (Zustand).
 *
 * - `projectStore` (vanilla store) and `useProjectStore(selector)` (React hook) hold the open
 *   project: `engine` (history; `engine.repository` = model), `project`, `version`, `filePath`,
 *   `dirty`, `canUndo`/`canRedo`/`undoName`/`redoName`, `activeDiagramId`, `openDiagramIds`,
 *   `selectedViewIds`, `selectedElementIds`, `loadWarnings`.
 * - Actions: `newProject()`, `openProject(text, path)`, `serializeProject()`, `markSaved(path?)`,
 *   `undo()`, `redo()`, `openDiagram(id)`, `closeDiagram(id)`, `setActiveDiagram(id)`,
 *   `select({ views, elements })`, `clearSelection()`.
 * - The model is a mutable graph changed only through `commands/` operations on `engine`;
 *   every change bumps `version`, so subscribe to `version` (plus ids) and read elements from
 *   the repository during render. Deleted ids are pruned from selection and tabs automatically.
 * - Selectors: `activeDiagram`, `selectedViews`, `selectedModels`.
 * - `registerCoreCommands(registry, projectStore)` wires new/undo/redo/delete into a `CommandRegistry`.
 * - `createProjectStore()` creates an independent store (tests, multiple windows).
 */
import { useStore } from 'zustand'
import { createProjectStore, type ProjectState } from './projectStore'

export * from './projectStore'

export const projectStore = createProjectStore()

export function useProjectStore<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector)
}

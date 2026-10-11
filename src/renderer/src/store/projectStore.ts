import { createStore, type StoreApi } from 'zustand/vanilla'
import { CommandIds, deleteFromModel, deleteFromView, ModelEngine, type CommandRegistry } from '../commands'
import { readMdj, writeMdj } from '../format'
import { createDefaultProject, isKindOf, Repository, type Diagram, type Elem, type Project, type View } from '../model'

export interface ProjectState {
  /** History engine of the open project; `engine.repository` holds the model. */
  readonly engine: ModelEngine
  readonly repository: Repository
  readonly project: Project
  /**
   * Incremented after every model change (execute/undo/redo). The repository is a mutable graph,
   * so components subscribe to `version` and read elements from the repository.
   */
  readonly version: number
  readonly filePath: string | null
  /** Unsaved changes relative to the last save/open/new. */
  readonly dirty: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly undoName: string | null
  readonly redoName: string | null
  readonly activeDiagramId: string | null
  /** Diagram tabs, in tab order. */
  readonly openDiagramIds: readonly string[]
  /** Selected views on the active diagram. */
  readonly selectedViewIds: readonly string[]
  /** Selected model elements (e.g. in the model explorer). */
  readonly selectedElementIds: readonly string[]
  /** Warnings from the last `openProject`. */
  readonly loadWarnings: readonly string[]

  /** Replaces the open project with a new default project (Model + empty class diagram "Main"). */
  newProject(): void
  /** Loads `.mdj` text. Throws `FormatError` if the text is not a project; the current project stays open then. */
  openProject(text: string, path: string | null): void
  /** Serializes the open project as `.mdj` text. */
  serializeProject(): string
  /** Marks the current state as saved (optionally under a new path). */
  markSaved(path?: string | null): void
  undo(): void
  redo(): void
  /** Opens (or focuses) a diagram tab and makes it active. */
  openDiagram(id: string): void
  closeDiagram(id: string): void
  setActiveDiagram(id: string | null): void
  /** Sets the selection; omitted parts are cleared. */
  select(selection: { views?: readonly string[]; elements?: readonly string[] }): void
  clearSelection(): void
}

export type ProjectStore = StoreApi<ProjectState>

/** Display title: the file name, else the project name; with a `*` suffix when dirty. */
export function projectTitle(state: Pick<ProjectState, 'filePath' | 'project' | 'dirty'>): string {
  const base = state.filePath ? (state.filePath.split(/[\\/]/).pop() ?? state.filePath) : state.project.name
  return state.dirty ? `${base} *` : base
}

export function createProjectStore(): ProjectStore {
  let unsubscribe: (() => void) | null = null

  return createStore<ProjectState>()((set, get) => {
    /** Snapshot of everything derived from the engine. */
    const derived = (engine: ModelEngine) => ({
      dirty: engine.isDirty,
      canUndo: engine.canUndo,
      canRedo: engine.canRedo,
      undoName: engine.undoName,
      redoName: engine.redoName
    })

    const attach = (repository: Repository, filePath: string | null, loadWarnings: readonly string[]) => {
      unsubscribe?.()
      const engine = new ModelEngine(repository)
      unsubscribe = engine.subscribe(() => {
        const s = get()
        const alive = (id: string) => repository.has(id)
        const openDiagramIds = s.openDiagramIds.filter(alive)
        set({
          version: s.version + 1,
          ...derived(engine),
          openDiagramIds,
          activeDiagramId:
            s.activeDiagramId && alive(s.activeDiagramId) ? s.activeDiagramId : (openDiagramIds.at(-1) ?? null),
          selectedViewIds: s.selectedViewIds.filter(alive),
          selectedElementIds: s.selectedElementIds.filter(alive)
        })
      })
      const diagram = repository.defaultDiagram()
      return {
        engine,
        repository,
        project: repository.project as Project,
        version: (get()?.version ?? 0) + 1,
        filePath,
        ...derived(engine),
        activeDiagramId: diagram?._id ?? null,
        openDiagramIds: diagram ? [diagram._id] : [],
        selectedViewIds: [],
        selectedElementIds: [],
        loadWarnings
      }
    }

    return {
      ...attach(new Repository(createDefaultProject()), null, []),

      newProject() {
        set(attach(new Repository(createDefaultProject()), null, []))
      },

      openProject(text, path) {
        const result = readMdj(text)
        set(attach(result.repository, path, result.warnings))
      },

      serializeProject() {
        return writeMdj(get().project)
      },

      markSaved(path) {
        const { engine } = get()
        engine.markSaved()
        set({ ...derived(engine), ...(path !== undefined ? { filePath: path } : {}) })
      },

      undo() {
        get().engine.undo()
      },

      redo() {
        get().engine.redo()
      },

      openDiagram(id) {
        const s = get()
        if (!isKindOf(s.repository.get(id), 'Diagram')) return
        set({
          openDiagramIds: s.openDiagramIds.includes(id) ? s.openDiagramIds : [...s.openDiagramIds, id],
          activeDiagramId: id,
          selectedViewIds: s.activeDiagramId === id ? s.selectedViewIds : []
        })
      },

      closeDiagram(id) {
        const s = get()
        const index = s.openDiagramIds.indexOf(id)
        if (index < 0) return
        const openDiagramIds = s.openDiagramIds.filter((d) => d !== id)
        const activeDiagramId =
          s.activeDiagramId === id
            ? (openDiagramIds[Math.min(index, openDiagramIds.length - 1)] ?? null)
            : s.activeDiagramId
        set({
          openDiagramIds,
          activeDiagramId,
          selectedViewIds: activeDiagramId === s.activeDiagramId ? s.selectedViewIds : []
        })
      },

      setActiveDiagram(id) {
        if (id === null) set({ activeDiagramId: null, selectedViewIds: [] })
        else get().openDiagram(id)
      },

      select({ views = [], elements = [] }) {
        set({ selectedViewIds: [...views], selectedElementIds: [...elements] })
      },

      clearSelection() {
        set({ selectedViewIds: [], selectedElementIds: [] })
      }
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Selectors

export function activeDiagram(state: ProjectState): Diagram | null {
  const d = state.repository.get(state.activeDiagramId)
  return isKindOf(d, 'Diagram') ? d : null
}

export function selectedViews(state: ProjectState): View[] {
  return state.selectedViewIds.map((id) => state.repository.get(id)).filter((v): v is View => isKindOf(v, 'View'))
}

/** Selected model elements: explicit element selection, else the models of the selected views. */
export function selectedModels(state: ProjectState): Elem[] {
  if (state.selectedElementIds.length > 0) {
    return state.selectedElementIds.map((id) => state.repository.get(id)).filter((e): e is Elem => e !== undefined)
  }
  const models = selectedViews(state)
    .map((v) => v.model)
    .filter((m): m is Elem => m !== null)
  return [...new Set(models)]
}

// ---------------------------------------------------------------------------------------------
// Core commands

/**
 * Registers the store-backed core commands (new, undo, redo, delete, delete from model) in
 * `registry`. File open/save commands need the IPC bridge and are registered by the UI shell.
 * Returns a function that unregisters them.
 */
export function registerCoreCommands(registry: CommandRegistry, store: ProjectStore): () => void {
  const s = () => store.getState()
  const disposers = [
    registry.register({ id: CommandIds.fileNew, label: 'New', run: () => s().newProject() }),
    registry.register({
      id: CommandIds.editUndo,
      label: 'Undo',
      run: () => s().undo(),
      isEnabled: () => s().canUndo
    }),
    registry.register({
      id: CommandIds.editRedo,
      label: 'Redo',
      run: () => s().redo(),
      isEnabled: () => s().canRedo
    }),
    registry.register({
      id: CommandIds.editDelete,
      label: 'Delete',
      run: () => deleteFromView(s().engine, selectedViews(s())),
      isEnabled: () => s().selectedViewIds.length > 0
    }),
    registry.register({
      id: CommandIds.editDeleteFromModel,
      label: 'Delete from Model',
      run: () => deleteFromModel(s().engine, selectedModels(s())),
      isEnabled: () => selectedModels(s()).length > 0
    })
  ]
  return () => disposers.forEach((dispose) => dispose())
}

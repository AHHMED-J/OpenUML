/** Test helper: a project store on a project with a class diagram "Main", open and active. */
import { writeMdj } from '../format'
import { createDefaultProject } from '../model'
import { projectStore } from './index'
import type { ProjectStore } from './projectStore'

/** Opens Project → Model → class diagram "Main" in `store` (File > New gives the model alone); returns `store`. */
export function openClassDiagramProject(store: ProjectStore = projectStore): ProjectStore {
  store.getState().openProject(writeMdj(createDefaultProject()), null)
  return store
}

import { useMemo } from 'react'
import type { Elem, View } from '../../model'
import { projectStore, selectedModels, selectedViews, useProjectStore } from '../../store'

/** Selected model elements (explorer selection, else models of selected views); re-renders on model changes. */
export function useSelectedModels(): { models: Elem[]; version: number } {
  const version = useProjectStore((s) => s.version)
  const elementIds = useProjectStore((s) => s.selectedElementIds)
  const viewIds = useProjectStore((s) => s.selectedViewIds)
  const models = useMemo(
    () => selectedModels(projectStore.getState()),
    [version, elementIds, viewIds]
  )
  return { models, version }
}

export function useSelectedViews(): { views: View[]; version: number } {
  const version = useProjectStore((s) => s.version)
  const viewIds = useProjectStore((s) => s.selectedViewIds)
  const views = useMemo(() => selectedViews(projectStore.getState()), [version, viewIds])
  return { views, version }
}

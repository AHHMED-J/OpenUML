/** Working Diagrams: the list of open diagrams (bound to the same state as the tab strip). */
import type React from 'react'
import { idef0DiagramLabel, isKindOf, type Diagram } from '../../model'
import { projectStore, useProjectStore } from '../../store'
import { TypeIcon, UiIcon } from '../icons'
import { uiStore } from '../uiStore'

export function useOpenDiagrams(): { diagrams: Diagram[]; activeId: string | null } {
  useProjectStore((s) => s.version)
  const ids = useProjectStore((s) => s.openDiagramIds)
  const activeId = useProjectStore((s) => s.activeDiagramId)
  const repo = useProjectStore((s) => s.repository)
  const diagrams = ids.map((id) => repo.get(id)).filter((d): d is Diagram => isKindOf(d, 'Diagram'))
  return { diagrams, activeId }
}

export function diagramLabel(d: Diagram): string {
  const name = d.name || `(${d._type.replace(/^UML/, '')})`
  return isKindOf(d, 'IDEF0Diagram') ? idef0DiagramLabel(d, name) : name
}

/** Working Diagrams body (the panel chrome and header come from the dock). */
export function WorkingDiagrams(): React.JSX.Element {
  const { diagrams, activeId } = useOpenDiagrams()
  return (
    <div className="panel working-diagrams">
      <div className="list" role="listbox" aria-label="Working diagrams">
        {diagrams.length === 0 ? <div className="empty-note">No open diagrams</div> : null}
        {diagrams.map((d) => (
          <div
            key={d._id}
            role="option"
            aria-selected={d._id === activeId}
            tabIndex={0}
            className={`list-row${d._id === activeId ? ' selected' : ''}`}
            onClick={() => projectStore.getState().setActiveDiagram(d._id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                projectStore.getState().setActiveDiagram(d._id)
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              uiStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, menu: 'working-diagrams', targetId: d._id })
            }}
          >
            <TypeIcon type={d._type} />
            <span className="list-label">{diagramLabel(d)}</span>
            <button
              className="icon-button row-close"
              aria-label={`Close ${diagramLabel(d)}`}
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                projectStore.getState().closeDiagram(d._id)
              }}
            >
              <UiIcon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

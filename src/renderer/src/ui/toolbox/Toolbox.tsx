/**
 * Toolbox: palette groups for the active diagram type. Click selects a tool; clicking the
 * active tool again locks it; a third click (or Esc) returns to Select. Double-click locks.
 */
import { useEffect, useState } from 'react'
import type React from 'react'
import { activeDiagram, useProjectStore } from '../../store'
import { ToolIcon, UiIcon } from '../icons'
import { sameTool, uiStore, useUiStore } from '../uiStore'
import { palettesFor, type PaletteGroup } from './palettes'

export function Toolbox(): React.JSX.Element {
  const diagramType = useProjectStore((s) => activeDiagram(s)?._type ?? null)
  const tool = useUiStore((s) => s.tool)
  const locked = useUiStore((s) => s.toolLocked)
  const groups = palettesFor(diagramType)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  // Auto-expand groups for the new diagram type; reset the tool.
  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const g of palettesFor(diagramType)) next[g.id] = diagramType !== null && (g.autoExpand?.includes(diagramType) ?? false)
    setOpen(next)
    uiStore.getState().setTool(null)
  }, [diagramType])

  return (
    <div className="panel toolbox">
      <div className="panel-header">
        <span className="panel-title">Toolbox</span>
        <button
          className={`icon-button${tool === null ? ' pressed' : ''}`}
          aria-pressed={tool === null}
          title="Select (Esc)"
          aria-label="Select tool"
          onClick={() => uiStore.getState().setTool(null)}
        >
          <UiIcon name="pointer" />
        </button>
      </div>
      <div className="toolbox-groups">
        {diagramType === null ? <div className="empty-note">Open a diagram to see its tools.</div> : null}
        {groups.map((g) => (
          <Group key={g.id} group={g} open={open[g.id] ?? false} onToggle={() => setOpen({ ...open, [g.id]: !open[g.id] })} activeTool={tool} locked={locked} />
        ))}
      </div>
    </div>
  )
}

function Group({
  group,
  open,
  onToggle,
  activeTool,
  locked
}: {
  group: PaletteGroup
  open: boolean
  onToggle: () => void
  activeTool: ReturnType<typeof uiStore.getState>['tool']
  locked: boolean
}): React.JSX.Element {
  return (
    <section className="tool-group">
      <button className="tool-group-header" aria-expanded={open} onClick={onToggle}>
        <UiIcon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        <span>{group.title}</span>
      </button>
      {open ? (
        <div className="tool-items" role="toolbar" aria-label={group.title} aria-orientation="vertical">
          {group.items.map((item) => {
            const active = activeTool !== null && sameTool(activeTool, item)
            return (
              <button
                key={item.id}
                className={`tool-item${active ? ' active' : ''}`}
                aria-pressed={active}
                title={`${item.label}${active ? (locked ? ' (locked — click to release)' : ' (click again to lock)') : ''}`}
                onClick={() => uiStore.getState().clickTool(item)}
                onDoubleClick={() => uiStore.getState().lockTool(item)}
              >
                <ToolIcon kind={item.kind} messageSort={item.messageSort} />
                <span className="tool-label">{item.label}</span>
                {active && locked ? (
                  <span className="tool-lock" aria-label="locked">
                    <UiIcon name="lock" size={12} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

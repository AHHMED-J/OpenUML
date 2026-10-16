/**
 * Dock rendering: a vertical stack of panels per area (with resize splitters between them and
 * insertion gaps that open while a panel is dragged), the unified panel chrome, the slim edge
 * drop zones shown for empty/hidden areas during a drag, and the screen-reader announcer.
 */
import { useRef, useState } from 'react'
import type React from 'react'
import { PanelBoundary, reportPanelError } from '../components/PanelBoundary'
import { UiIcon } from '../icons'
import { uiStore, useUiStore } from '../uiStore'
import { DOCK_AREA_TITLES, DOCK_PANEL_TITLES, visiblePanels, type DockAreaId, type DockPanelId, type DockPanelState } from './dockModel'
import { gapKey, onHeaderPointerDown, useDockDrag } from './dragController'
import { PanelMenu, type PanelMenuState } from './PanelMenu'
import { PanelActions, PanelBody } from './panels'

/** The stack of visible panels in `area`. */
export function DockStack({ area }: { area: DockAreaId }): React.JSX.Element {
  const dock = useUiStore((s) => s.dock)
  const drag = useDockDrag()
  const shown = visiblePanels(dock, area)
  const activeGap = drag.id && drag.target?.area === area ? gapKey(area, drag.target.beforeId) : null
  const children: React.ReactNode[] = []
  shown.forEach((id, i) => {
    const key = gapKey(area, id)
    children.push(<Gap key={`gap-${id}`} gapId={key} active={activeGap === key} height={drag.gapHeight} />)
    children.push(<DockPanel key={id} id={id} state={dock.panels[id]} source={drag.id === id} />)
    const next = shown[i + 1]
    if (next) {
      const resizable = !dock.panels[id].collapsed && !dock.panels[next].collapsed
      children.push(<StackSplitter key={`split-${id}`} upper={id} lower={next} resizable={resizable} />)
    }
  })
  const endKey = gapKey(area, null)
  children.push(<Gap key="gap-end" gapId={endKey} active={activeGap === endKey} height={drag.gapHeight} />)
  return (
    <div className={`dock-stack${activeGap ? ' drop-active' : ''}`} data-dock-stack={area}>
      {children}
    </div>
  )
}

function Gap({ gapId, active, height }: { gapId: string; active: boolean; height: number }): React.JSX.Element {
  return (
    <div className={`dock-gap${active ? ' active' : ''}`} data-dock-gap={gapId} style={{ height: active ? height : 0 }} aria-hidden="true">
      <div className="dock-placeholder" />
    </div>
  )
}

function GripIcon(): React.JSX.Element {
  return (
    <svg width={8} height={14} viewBox="0 0 8 14" aria-hidden="true" className="icon">
      {[2, 7, 12].flatMap((y) => [2, 6].map((x) => <circle key={`${x},${y}`} cx={x} cy={y} r={1.1} fill="currentColor" />))}
    </svg>
  )
}

function DockPanel({ id, state, source }: { id: DockPanelId; state: DockPanelState; source: boolean }): React.JSX.Element {
  const [menu, setMenu] = useState<PanelMenuState | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const title = DOCK_PANEL_TITLES[id]
  const bodyId = `dock-body-${id}`
  const collapsed = state.collapsed
  const toggle = (): void => uiStore.getState().toggleDockCollapsed(id)
  return (
    <section
      className={`dock-panel${collapsed ? ' collapsed' : ' expanded'}${source ? ' is-drag-source' : ''}`}
      data-dock-panel={id}
      aria-label={title}
      style={collapsed ? undefined : { flexGrow: state.size }}
    >
      <div
        className="panel-header dock-header"
        data-dock-header=""
        title={`${title} — long-press and drag to move`}
        onPointerDown={(e) => onHeaderPointerDown(e, id)}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('.dock-actions')) return
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <span className="dock-grip" data-no-drag="" title="Drag to move" onPointerDown={(e) => onHeaderPointerDown(e, id, true)}>
          <GripIcon />
        </span>
        <button
          className="icon-button dock-chevron"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
          data-tip={collapsed ? 'Expand' : 'Collapse'}
          onClick={toggle}
        >
          <UiIcon name={collapsed ? 'chevron-right' : 'chevron-down'} size={12} />
        </button>
        <span className="panel-title" onClick={toggle}>
          {title}
        </span>
        <span className="dock-actions" data-no-drag="">
          <PanelBoundary name={`${title} actions`} fallback={() => null}>
            <PanelActions id={id} />
          </PanelBoundary>
        </span>
        <button
          ref={menuButton}
          className="icon-button dock-menu-button"
          data-no-drag=""
          data-tip="Panel options"
          aria-label={`${title} panel options`}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.left, y: r.bottom + 2 })
          }}
        >
          <UiIcon name="ellipsis" />
        </button>
      </div>
      <div className="dock-body" id={bodyId} hidden={collapsed}>
        <PanelBoundary name={title}>
          <PanelBody id={id} />
        </PanelBoundary>
      </div>
      {menu ? (
        <PanelBoundary
          name={`${title} panel menu`}
          fallback={() => null}
          onError={(error, name) => {
            setMenu(null)
            reportPanelError(error, name)
          }}
        >
          <PanelMenu
            id={id}
            at={menu}
            onClose={(refocus) => {
              setMenu(null)
              if (refocus) menuButton.current?.focus()
            }}
          />
        </PanelBoundary>
      ) : null}
    </section>
  )
}

/** Resizes two adjacent expanded panels by moving height weight between them. */
function StackSplitter({ upper, lower, resizable }: { upper: DockPanelId; lower: DockPanelId; resizable: boolean }): React.JSX.Element {
  const start = useRef<{ pos: number; hu: number; hl: number; wu: number; wl: number } | null>(null)
  const wu = useUiStore((s) => s.dock.panels[upper].size)
  const wl = useUiStore((s) => s.dock.panels[lower].size)
  const share = Math.round((100 * wu) / Math.max(1, wu + wl))

  const measure = (bar: HTMLElement): { hu: number; hl: number; wu: number; wl: number } | null => {
    const stack = bar.parentElement
    const u = stack?.querySelector<HTMLElement>(`:scope > [data-dock-panel="${upper}"]`)
    const l = stack?.querySelector<HTMLElement>(`:scope > [data-dock-panel="${lower}"]`)
    if (!u || !l) return null
    const panels = uiStore.getState().dock.panels
    return { hu: u.getBoundingClientRect().height, hl: l.getBoundingClientRect().height, wu: panels[upper].size, wl: panels[lower].size }
  }
  const apply = (m: { hu: number; hl: number; wu: number; wl: number }, delta: number, persist: boolean): void => {
    const total = m.hu + m.hl
    const min = 60
    if (total <= 2 * min) return
    const hu = Math.max(min, Math.min(total - min, m.hu + delta))
    const w = m.wu + m.wl
    uiStore.getState().setDockPanelSizes({ [upper]: (w * hu) / total, [lower]: (w * (total - hu)) / total }, persist)
  }

  if (!resizable) return <div className="splitter splitter-horizontal dock-divider" aria-hidden="true" />
  return (
    <div
      className="splitter splitter-horizontal"
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize ${DOCK_PANEL_TITLES[upper]} and ${DOCK_PANEL_TITLES[lower]}`}
      aria-valuenow={share}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const m = measure(e.currentTarget)
        if (!m) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { pos: e.clientY, ...m }
        document.body.classList.add('resizing-y')
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (s) apply(s, e.clientY - s.pos, false)
      }}
      onPointerUp={(e) => {
        if (!start.current) return
        start.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('resizing-y')
        uiStore.getState().setDockPanelSizes({}, true)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const m = measure(e.currentTarget)
        const step = e.shiftKey ? 50 : 10
        if (m) apply(m, e.key === 'ArrowDown' ? step : -step, true)
      }}
    />
  )
}

/** Slim drop target at a window edge for an area that is empty or hidden (only while dragging). */
export function DockEdgeZone({ area, shown }: { area: DockAreaId; shown: boolean }): React.JSX.Element | null {
  const drag = useDockDrag()
  if (!drag.id || shown) return null
  const active = drag.target?.area === area
  return (
    <div className={`dock-edge dock-edge-${area}${active ? ' active' : ''}`} data-dock-edge={area} aria-hidden="true">
      <div className="dock-edge-placeholder">
        <span>{DOCK_AREA_TITLES[area]}</span>
      </div>
    </div>
  )
}

/** Polite live regions announcing drag progress and completed moves. */
export function DockAnnouncer(): React.JSX.Element {
  const announcement = useUiStore((s) => s.dockAnnouncement)
  const drag = useDockDrag()
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement.text}
      </div>
      <div className="sr-only" aria-live="polite">
        {drag.message}
      </div>
    </>
  )
}

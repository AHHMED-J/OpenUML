/**
 * Model Explorer: the project tree. Selection syncs with the project store; double-click opens
 * diagrams or renames other elements; F2 renames; Delete removes from the model (confirmed);
 * drag and drop re-parents; context menu offers Add / Add Diagram and edit commands.
 *
 * Rows are tree nodes (`tree.ts`): model elements plus the virtual IDEF0 role folders and arrow
 * entries under function boxes. Rows are identified by node key, since one arrow can be listed
 * under two boxes; selection is by element, so both entries of an arrow highlight together.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { moveElement } from '../../commands'
import { renameElements } from '../../diagram'
import { isKindOf, type Elem } from '../../model'
import { projectStore, useProjectStore } from '../../store'
import { confirmAndDeleteFromModel, openDiagram, selectInExplorer } from '../app/appCommands'
import { reportError } from '../app/commands'
import { RoleIcon, TypeIcon, UiIcon } from '../icons'
import { uiStore, useUiStore } from '../uiStore'
import { dropField, explorerLabel, flattenTree, searchTree, treeLabel, treeTooltip, type Guide, type TreeNode, type TreeOptions, type TreeRow } from './tree'
import { scrollToReveal, visibleRows } from './virtualRows'

/** MIME type used when dragging elements (also understood by the diagram canvas). */
const ELEMENT_DRAG_TYPE = 'application/x-openuml-element'

function rowDomId(key: string): string {
  return `tree-${key}`
}

let draggedId: string | null = null

/** Indentation per tree level (px); the guide lines are drawn on the same grid. */
const INDENT = 14

/** Model Explorer header action: the explorer options menu. */
export function ExplorerActions(): React.JSX.Element {
  return (
    <button
      className="icon-button"
      title="Explorer options"
      aria-label="Explorer options"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        uiStore.getState().openContextMenu({ x: r.left, y: r.bottom + 2, menu: 'explorer-settings' })
      }}
    >
      <UiIcon name="gear" />
    </button>
  )
}

export function ModelExplorer(): React.JSX.Element {
  const version = useProjectStore((s) => s.version)
  const project = useProjectStore((s) => s.project)
  const selectedIds = useProjectStore((s) => s.selectedElementIds)
  const expanded = useUiStore((s) => s.expanded)
  const collapsedFolders = useUiStore((s) => s.collapsedFolders)
  const groupArrows = useUiStore((s) => s.groupArrows)
  const sortBy = useUiStore((s) => s.sortBy)
  const showStereotype = useUiStore((s) => s.showStereotype)
  const renamingId = useUiStore((s) => s.renamingId)
  const revealTick = useUiStore((s) => s.revealTick)
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  // Virtualization (see virtualRows.ts): only rows near the viewport are rendered. Rows have a
  // fixed height (--row-height), measured from a rendered row; `pad` is the tree's top padding.
  const [viewport, setViewport] = useState({ top: 0, height: 0 })
  const [metrics, setMetrics] = useState({ rowHeight: 22, pad: 0 })
  const metricsRef = useRef(metrics)
  metricsRef.current = metrics

  useEffect(() => {
    const el = treeRef.current
    if (!el) return
    const update = (): void => setViewport((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }))
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const el = treeRef.current
    const row = el?.querySelector<HTMLElement>('.tree-row')
    if (!el || !row || row.offsetHeight <= 0) return
    const next = { rowHeight: row.offsetHeight, pad: parseFloat(getComputedStyle(el).paddingTop) || 0 }
    if (next.rowHeight !== metrics.rowHeight || next.pad !== metrics.pad) setMetrics(next)
  })

  /** Scrolls the row with `key` into view (it may not be rendered yet). */
  const revealRow = (key: string): void => {
    const el = treeRef.current
    const index = rowsRef.current.findIndex((r) => r.node.key === key)
    if (!el || index < 0) return
    const { rowHeight, pad } = metricsRef.current
    const top = scrollToReveal(index, rowHeight, el.scrollTop, el.clientHeight, pad)
    if (top !== el.scrollTop) el.scrollTop = top
  }

  // Expand the project and its top-level children whenever a project is opened.
  useEffect(() => {
    const children = (project.ownedElements ?? []).map((e) => e._id)
    uiStore.getState().expandMany([project._id, ...children])
  }, [project])

  const rows = useMemo(
    () => {
      const options: TreeOptions = { sortBy, groupArrows }
      return query.trim() ? searchTree(project, query.trim(), options) : flattenTree(project, { expanded, collapsedFolders }, options)
    },
    // `version` invalidates the tree after model changes.
    [project, version, expanded, collapsedFolders, groupArrows, sortBy, query]
  )
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const shown = visibleRows(rows.length, metrics.rowHeight, viewport.top - metrics.pad, viewport.height)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  // The focused row: the last clicked/navigated one, else the first row of the selection.
  const current =
    focusId && rows.some((r) => r.node.key === focusId)
      ? focusId
      : ((selectedIds[0] ? rows.find((r) => r.el?._id === selectedIds[0])?.node.key : undefined) ?? rows[0]?.node.key ?? null)
  const currentRow = rows.find((r) => r.node.key === current)
  // The row that shows the inline rename of `renamingId`: the focused one when it is that element.
  const renameKey = renamingId
    ? currentRow?.el?._id === renamingId
      ? currentRow.node.key
      : rows.find((r) => r.el?._id === renamingId)?.node.key
    : undefined

  // Reveal: scroll the selection into view and focus the tree.
  useEffect(() => {
    if (revealTick === 0) return
    const id = projectStore.getState().selectedElementIds[0]
    if (!id) return
    setQuery('')
    requestAnimationFrame(() => {
      const row = rowsRef.current.find((r) => r.el?._id === id)
      if (row) {
        setFocusId(row.node.key)
        revealRow(row.node.key)
      }
      treeRef.current?.focus()
    })
  }, [revealTick])

  useEffect(() => {
    if (current) revealRow(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const select = (row: TreeRow, toggle = false): void => {
    setFocusId(row.node.key)
    const el = row.el
    if (!el) return
    const s = projectStore.getState()
    if (toggle) {
      const ids = s.selectedElementIds.includes(el._id)
        ? s.selectedElementIds.filter((id) => id !== el._id)
        : [...s.selectedElementIds, el._id]
      s.select({ elements: ids })
    } else {
      s.select({ elements: [el._id] })
    }
  }

  const activate = (row: TreeRow): void => {
    const el = row.el
    if (!el) {
      if (row.expandable) toggle(row)
    } else if (isKindOf(el, 'Diagram')) openDiagram(el)
    else if (!isKindOf(el, 'Project')) uiStore.getState().startRename(el._id)
  }

  const toggle = (row: TreeRow): void => {
    if (row.node.kind === 'folder') uiStore.getState().setFoldersCollapsed([row.node.key], row.expanded)
    else uiStore.getState().setExpanded(row.node.key, !row.expanded)
  }

  const openMenuAt = (x: number, y: number): void => uiStore.getState().openContextMenu({ x, y, menu: 'explorer' })

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (renamingId) return
    const index = rows.findIndex((r) => r.node.key === current)
    const row = rows[index]
    const go = (i: number): void => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, i))]
      if (target) select(target)
    }
    const mod = e.metaKey || e.ctrlKey
    switch (e.key) {
      case 'ArrowDown':
        if (mod) return
        go(index + 1)
        break
      case 'ArrowUp':
        if (mod) return
        go(index - 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(rows.length - 1)
        break
      case 'ArrowRight':
        if (!row) return
        if (row.expandable && !row.expanded) toggle(row)
        else if (row.expanded) go(index + 1)
        break
      case 'ArrowLeft':
        if (!row) return
        if (row.expanded) toggle(row)
        else if (row.parentKey) {
          const parent = rows.find((r) => r.node.key === row.parentKey)
          if (parent) select(parent)
        }
        break
      case 'Enter':
        if (row) activate(row)
        break
      case 'F2':
        if (row?.el && !isKindOf(row.el, 'Project')) {
          select(row)
          uiStore.getState().startRename(row.el._id)
        }
        break
      case 'Delete':
      case 'Backspace': {
        const els = projectStore.getState().selectedElementIds.map((id) => projectStore.getState().repository.get(id))
        void confirmAndDeleteFromModel(els.filter((x): x is Elem => x !== undefined)).catch(reportError)
        break
      }
      case 'ContextMenu': {
        const rect = current ? document.getElementById(rowDomId(current))?.getBoundingClientRect() : undefined
        if (rect) openMenuAt(rect.left + 24, rect.bottom)
        break
      }
      default:
        if (e.key === 'F10' && e.shiftKey) {
          const rect = current ? document.getElementById(rowDomId(current))?.getBoundingClientRect() : undefined
          if (rect) openMenuAt(rect.left + 24, rect.bottom)
          break
        }
        return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  const onDrop = (e: React.DragEvent, target: Elem): void => {
    e.preventDefault()
    setDropTarget(null)
    const source = draggedId ? projectStore.getState().repository.get(draggedId) : undefined
    draggedId = null
    if (!source) return
    const field = dropField(target, source)
    if (!field) return
    try {
      moveElement(projectStore.getState().engine, source, target, field)
      uiStore.getState().setExpanded(target._id, true)
      selectInExplorer(source)
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <div className="panel explorer">
      <div className="search-box">
        <UiIcon name="search" size={14} />
        <input
          type="search"
          placeholder="Search elements"
          aria-label="Search elements"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('')
              e.preventDefault()
              e.stopPropagation()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              treeRef.current?.focus()
            }
          }}
        />
      </div>
      <div
        ref={treeRef}
        className="tree"
        role="tree"
        aria-label="Model"
        aria-multiselectable="true"
        tabIndex={0}
        aria-activedescendant={current ? rowDomId(current) : undefined}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault()
          if ((e.target as HTMLElement).closest('.tree-row') === null) projectStore.getState().select({ elements: [] })
          openMenuAt(e.clientX, e.clientY)
        }}
      >
        {shown.start > 0 ? <div aria-hidden="true" style={{ height: shown.start * metrics.rowHeight }} /> : null}
        {rows.slice(shown.start, shown.end).map((row) => {
          const { el, node } = row
          const key = node.key
          const isSelected = el !== null && selected.has(el._id)
          const renaming = el !== null && key === renameKey
          const label = treeLabel(node, showStereotype)
          return (
            <div
              key={key}
              id={rowDomId(key)}
              className={`tree-row${isSelected ? ' selected' : ''}${current === key ? ' focused' : ''}${dropTarget === key ? ' drop-target' : ''}${node.kind === 'folder' ? ' tree-folder' : ''}`}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={isSelected}
              aria-expanded={row.expandable ? row.expanded : undefined}
              style={{ paddingLeft: 4 + row.depth * INDENT }}
              draggable={el !== null && !renaming && !isKindOf(el, 'Project')}
              onMouseDown={(e) => {
                if (e.button === 2 && el && !selected.has(el._id)) select(row)
              }}
              onClick={(e) => select(row, e.metaKey || e.ctrlKey)}
              onDoubleClick={() => activate(row)}
              onDragStart={(e) => {
                if (!el) return
                draggedId = el._id
                e.dataTransfer.setData(ELEMENT_DRAG_TYPE, el._id)
                e.dataTransfer.setData('text/plain', explorerLabel(el, false))
                e.dataTransfer.effectAllowed = 'copyMove'
              }}
              onDragEnd={() => {
                draggedId = null
                setDropTarget(null)
              }}
              onDragOver={(e) => {
                const source = draggedId ? projectStore.getState().repository.get(draggedId) : undefined
                if (!source) return
                if (!el || node.kind !== 'element' || !dropField(el, source)) {
                  // Invalid target: not-allowed cursor and no highlight.
                  e.dataTransfer.dropEffect = 'none'
                  if (dropTarget === key) setDropTarget(null)
                  return
                }
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropTarget !== key) setDropTarget(key)
              }}
              onDragLeave={() => dropTarget === key && setDropTarget(null)}
              onDrop={(e) => {
                if (el && node.kind === 'element') onDrop(e, el)
              }}
            >
              <IndentGuides guides={row.guides} leaf={!row.expandable} />
              <span
                className={`twisty${row.expandable ? '' : ' empty'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (row.expandable) toggle(row)
                }}
                aria-hidden="true"
              >
                {row.expandable ? <UiIcon name={row.expanded ? 'chevron-down' : 'chevron-right'} size={12} /> : null}
              </span>
              <NodeIcon node={node} open={row.expanded} />
              {renaming && el ? (
                <RenameInput el={el} />
              ) : (
                <span
                  className={`tree-label${node.kind === 'folder' ? ` role-label role-${node.role}` : ''}`}
                  // The tooltip of an arrow entry walks the model; build it when hovered.
                  onMouseEnter={(e) => {
                    e.currentTarget.title = treeTooltip(node, showStereotype)
                  }}
                >
                  {label}
                </span>
              )}
            </div>
          )
        })}
        {shown.end < rows.length ? <div aria-hidden="true" style={{ height: (rows.length - shown.end) * metrics.rowHeight }} /> : null}
        {rows.length === 0 ? <div className="empty-note">No matching elements</div> : null}
      </div>
    </div>
  )
}

/** Center of the twisty of tree level `level` (px from the row's left edge). */
function guideX(level: number): number {
  return 4 + level * INDENT + INDENT / 2
}

/**
 * The tree guide lines of a row: one vertical line per ancestor level that continues below, and
 * a tick from the parent's line to the row (reaching the icon for leaves, the chevron otherwise).
 */
function IndentGuides({ guides, leaf }: { guides: readonly Guide[]; leaf: boolean }): React.JSX.Element | null {
  if (guides.length === 0) return null
  const tick = INDENT / 2 + (leaf ? INDENT - 3 : 1)
  return (
    <span className="tree-guides" aria-hidden="true">
      {guides.map((g, level) => {
        if (g.kind === 'none') return null
        const roleClass = g.role ? ` role-${g.role}` : ''
        const left = guideX(level)
        return (
          <span key={level}>
            <span className={`guide-v${g.kind === 'elbow' ? ' guide-end' : ''}${roleClass}`} style={{ left }} />
            {g.kind === 'pass' ? null : <span className={`guide-h${roleClass}`} style={{ left, width: tick }} />}
          </span>
        )
      })}
    </span>
  )
}

/** Icon of a row: the element type, or the role of an IDEF0 folder or arrow entry. */
function NodeIcon({ node, open }: { node: TreeNode; open: boolean }): React.JSX.Element {
  if (node.kind === 'element') return <TypeIcon type={node.el._type} />
  if (node.kind === 'folder') return <RoleIcon role={node.role} folder open={open} />
  return <RoleIcon role={node.role} />
}

function RenameInput({ el }: { el: Elem }): React.JSX.Element {
  const initial = typeof el['name'] === 'string' ? (el['name'] as string) : ''
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    uiStore.getState().startRename(null)
    if (commit && value !== initial) {
      try {
        renameElements(projectStore.getState().engine, [el], value)
      } catch (err) {
        reportError(err)
      }
    }
    requestAnimationFrame(() => (document.querySelector('.tree') as HTMLElement | null)?.focus())
  }
  return (
    <input
      className="tree-rename"
      aria-label="Name"
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
    />
  )
}

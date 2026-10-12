/**
 * Model Explorer: the project tree. Selection syncs with the project store; double-click opens
 * diagrams or renames other elements; F2 renames; Delete removes from the model (confirmed);
 * drag and drop re-parents; context menu offers Add / Add Diagram and edit commands.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { moveElement, rename } from '../../commands'
import { isKindOf, typeDisplayName, type Elem } from '../../model'
import { projectStore, useProjectStore } from '../../store'
import { confirmAndDeleteFromModel, openDiagram, selectInExplorer } from '../app/appCommands'
import { reportError } from '../app/commands'
import { TypeIcon, UiIcon } from '../icons'
import { uiStore, useUiStore } from '../uiStore'
import { dropField, explorerChildren, explorerLabel, hasExplorerChildren } from './tree'

/** MIME type used when dragging elements (also understood by the diagram canvas). */
export const ELEMENT_DRAG_TYPE = 'application/x-openuml-element'

interface Row {
  readonly el: Elem
  readonly depth: number
  readonly expandable: boolean
  readonly expanded: boolean
}

function flatten(root: Elem, expanded: Readonly<Record<string, true>>, sortBy: 'added' | 'name'): Row[] {
  const rows: Row[] = []
  const visit = (el: Elem, depth: number): void => {
    const expandable = hasExplorerChildren(el)
    const isOpen = expandable && expanded[el._id] === true
    rows.push({ el, depth, expandable, expanded: isOpen })
    if (isOpen) for (const child of explorerChildren(el, sortBy)) visit(child, depth + 1)
  }
  visit(root, 0)
  return rows
}

function searchRows(root: Elem, query: string, sortBy: 'added' | 'name'): Row[] {
  const q = query.toLowerCase()
  const rows: Row[] = []
  const visit = (el: Elem): void => {
    const name = el['name']
    if (el !== root && typeof name === 'string' && name.toLowerCase().includes(q)) {
      rows.push({ el, depth: 0, expandable: false, expanded: false })
    }
    if (rows.length < 200) for (const child of explorerChildren(el, sortBy)) visit(child)
  }
  visit(root)
  return rows
}

let draggedId: string | null = null

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
  const sortBy = useUiStore((s) => s.sortBy)
  const showStereotype = useUiStore((s) => s.showStereotype)
  const renamingId = useUiStore((s) => s.renamingId)
  const revealTick = useUiStore((s) => s.revealTick)
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  // Expand the project and its top-level children whenever a project is opened.
  useEffect(() => {
    const children = (project.ownedElements ?? []).map((e) => e._id)
    uiStore.getState().expandMany([project._id, ...children])
  }, [project])

  const rows = useMemo(
    () => (query.trim() ? searchRows(project, query.trim(), sortBy) : flatten(project, expanded, sortBy)),
    // `version` invalidates the tree after model changes.
    [project, version, expanded, sortBy, query]
  )
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const current = focusId && rows.some((r) => r.el._id === focusId) ? focusId : (selectedIds[0] ?? rows[0]?.el._id ?? null)

  // Reveal: scroll the selection into view and focus the tree.
  useEffect(() => {
    if (revealTick === 0) return
    const id = projectStore.getState().selectedElementIds[0]
    if (!id) return
    setQuery('')
    setFocusId(id)
    requestAnimationFrame(() => {
      document.getElementById(`tree-${id}`)?.scrollIntoView({ block: 'nearest' })
      treeRef.current?.focus()
    })
  }, [revealTick])

  useEffect(() => {
    if (current) document.getElementById(`tree-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const select = (el: Elem, toggle = false): void => {
    setFocusId(el._id)
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

  const activate = (el: Elem): void => {
    if (isKindOf(el, 'Diagram')) openDiagram(el)
    else if (!isKindOf(el, 'Project')) uiStore.getState().startRename(el._id)
  }

  const toggle = (row: Row): void => uiStore.getState().setExpanded(row.el._id, !row.expanded)

  const openMenuAt = (x: number, y: number): void => uiStore.getState().openContextMenu({ x, y, menu: 'explorer' })

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (renamingId) return
    const index = rows.findIndex((r) => r.el._id === current)
    const row = rows[index]
    const go = (i: number): void => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, i))]
      if (target) select(target.el)
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
        else if (row.el._parent) {
          const parentId = row.el._parent._id
          const parent = rows.find((r) => r.el._id === parentId)
          if (parent) select(parent.el)
        }
        break
      case 'Enter':
        if (row) activate(row.el)
        break
      case 'F2':
        if (row && !isKindOf(row.el, 'Project')) {
          select(row.el)
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
        const rect = document.getElementById(`tree-${current}`)?.getBoundingClientRect()
        if (rect) openMenuAt(rect.left + 24, rect.bottom)
        break
      }
      default:
        if (e.key === 'F10' && e.shiftKey) {
          const rect = document.getElementById(`tree-${current}`)?.getBoundingClientRect()
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
        aria-activedescendant={current ? `tree-${current}` : undefined}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault()
          if ((e.target as HTMLElement).closest('.tree-row') === null) projectStore.getState().select({ elements: [] })
          openMenuAt(e.clientX, e.clientY)
        }}
      >
        {rows.map((row) => {
          const { el } = row
          const isSelected = selected.has(el._id)
          const renaming = renamingId === el._id
          return (
            <div
              key={el._id}
              id={`tree-${el._id}`}
              className={`tree-row${isSelected ? ' selected' : ''}${current === el._id ? ' focused' : ''}${dropTarget === el._id ? ' drop-target' : ''}`}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={isSelected}
              aria-expanded={row.expandable ? row.expanded : undefined}
              style={{ paddingLeft: 4 + row.depth * 14 }}
              draggable={!renaming && !isKindOf(el, 'Project')}
              onMouseDown={(e) => {
                if (e.button === 2 && !selected.has(el._id)) select(el)
              }}
              onClick={(e) => select(el, e.metaKey || e.ctrlKey)}
              onDoubleClick={() => activate(el)}
              onDragStart={(e) => {
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
                if (!dropField(el, source)) {
                  // Invalid target: not-allowed cursor and no highlight.
                  e.dataTransfer.dropEffect = 'none'
                  if (dropTarget === el._id) setDropTarget(null)
                  return
                }
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropTarget !== el._id) setDropTarget(el._id)
              }}
              onDragLeave={() => dropTarget === el._id && setDropTarget(null)}
              onDrop={(e) => onDrop(e, el)}
            >
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
              <TypeIcon type={el._type} />
              {renaming ? (
                <RenameInput el={el} />
              ) : (
                <span className="tree-label" title={`${explorerLabel(el, showStereotype)} [${typeDisplayName(el._type)}]`}>
                  {explorerLabel(el, showStereotype)}
                </span>
              )}
            </div>
          )
        })}
        {rows.length === 0 ? <div className="empty-note">No matching elements</div> : null}
      </div>
    </div>
  )
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
        rename(projectStore.getState().engine, el, value)
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

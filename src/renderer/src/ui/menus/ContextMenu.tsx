/**
 * In-app popup menus (context menus, explorer settings, zoom presets). Renders resolved menu
 * items with submenus, check marks and keystrokes; full keyboard navigation.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import { projectStore } from '../../store'
import { platform } from '../app/bridge'
import { runCommand } from '../app/commands'
import { menuContext } from '../app/lifecycle'
import { displayKeystroke } from '../keymap'
import { uiStore, useUiStore } from '../uiStore'
import {
  canvasContextMenu,
  explorerContextMenu,
  explorerSettingsMenu,
  workingDiagramsContextMenu
} from './appMenu'
import { Cmd } from './commandIds'
import { resolveMenu, type MenuNode, type ResolvedMenuItem } from './menuModel'

type ActionItem = Extract<ResolvedMenuItem, { kind: 'item' }>

interface MenuListProps {
  readonly items: readonly ResolvedMenuItem[]
  readonly x: number
  readonly y: number
  readonly onClose: () => void
  /** Called for an action item (default: run its command). */
  readonly onSelect?: (item: ActionItem) => void
  /** For submenus: close only this level (Left/Esc). */
  readonly onBack?: () => void
  readonly autoFocus?: boolean
}

function isActionable(item: ResolvedMenuItem): boolean {
  return item.kind !== 'separator' && item.enabled
}

export function MenuList({ items, x, y, onClose, onSelect, onBack, autoFocus = true }: MenuListProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<number>(-1)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))
    const top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const choose = (index: number): void => {
    const item = items[index]
    if (!item || !isActionable(item)) return
    if (item.kind === 'submenu') {
      setOpenSub(index)
      return
    }
    if (item.kind !== 'item') return
    onClose()
    if (onSelect) onSelect(item)
    else if (item.command) runCommand(item.command, item.args)
  }

  const move = (step: number): void => {
    if (items.length === 0) return
    let i = active
    for (let n = 0; n < items.length; n++) {
      i = (i + step + items.length) % items.length
      if (isActionable(items[i] as ResolvedMenuItem)) break
    }
    setActive(i)
    setOpenSub(null)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (openSub !== null) return
    switch (e.key) {
      case 'ArrowDown':
        move(1)
        break
      case 'ArrowUp':
        move(-1)
        break
      case 'ArrowRight':
        if (items[active]?.kind === 'submenu') setOpenSub(active)
        break
      case 'ArrowLeft':
        if (onBack) onBack()
        break
      case 'Enter':
      case ' ':
        choose(active)
        break
      case 'Escape':
        if (onBack) onBack()
        else onClose()
        break
      case 'Tab':
        onClose()
        break
      default:
        return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      tabIndex={-1}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.kind === 'separator') return <div key={index} className="menu-separator" role="separator" />
        const isSub = item.kind === 'submenu'
        const checked = item.kind === 'item' ? item.checked : undefined
        const keystroke = item.kind === 'item' && item.keystroke ? displayKeystroke(item.keystroke, platform) : null
        return (
          <div
            key={index}
            className={`menu-item${index === active ? ' active' : ''}${item.enabled ? '' : ' disabled'}`}
            role={checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={checked}
            aria-disabled={!item.enabled}
            aria-haspopup={isSub ? 'menu' : undefined}
            aria-expanded={isSub ? openSub === index : undefined}
            onMouseEnter={() => {
              setActive(index)
              setOpenSub(isSub && item.enabled ? index : null)
            }}
            onClick={() => choose(index)}
          >
            <span className="menu-check">{checked ? '✓' : ''}</span>
            <span className="menu-label">{item.label}</span>
            <span className="menu-keystroke">{keystroke}</span>
            <span className="menu-arrow">{isSub ? '›' : ''}</span>
            {isSub && openSub === index ? (
              <SubMenu items={item.items} anchor={ref} index={index} onClose={onClose} onSelect={onSelect} onBack={() => {
                setOpenSub(null)
                ref.current?.focus()
              }} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function SubMenu({
  items,
  anchor,
  index,
  onClose,
  onSelect,
  onBack
}: {
  items: readonly ResolvedMenuItem[]
  anchor: React.RefObject<HTMLDivElement | null>
  index: number
  onClose: () => void
  onSelect?: (item: ActionItem) => void
  onBack: () => void
}): React.JSX.Element | null {
  const row = anchor.current?.children[index] as HTMLElement | undefined
  if (!row) return null
  const rect = row.getBoundingClientRect()
  const x = rect.right + 160 > window.innerWidth ? rect.left - 200 : rect.right - 2
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <MenuList items={items} x={x} y={rect.top - 4} onClose={onClose} onSelect={onSelect} onBack={onBack} />
    </div>
  )
}

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.5, 2]

function zoomMenu(): MenuNode[] {
  return [
    ...ZOOM_PRESETS.map((z) => ({ label: `${Math.round(z * 100)}%`, command: 'ui.zoom-preset', args: z, enabled: () => true })),
    { separator: true },
    { label: 'Fit to Window', command: Cmd.viewFitToWindow }
  ]
}

function menuFor(kind: string, targetId: string | undefined): MenuNode[] {
  switch (kind) {
    case 'explorer':
      return explorerContextMenu()
    case 'explorer-settings':
      return explorerSettingsMenu()
    case 'working-diagrams':
      return workingDiagramsContextMenu(targetId)
    case 'canvas':
      return canvasContextMenu()
    case 'zoom':
      return zoomMenu()
    default:
      return []
  }
}

/** Renders the open context menu from `uiStore.contextMenu`. */
export function ContextMenuHost(): React.JSX.Element | null {
  const state = useUiStore((s) => s.contextMenu)
  useEffect(() => {
    if (!state) return
    const close = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest?.('.menu')) uiStore.getState().openContextMenu(null)
    }
    const onBlur = (): void => uiStore.getState().openContextMenu(null)
    window.addEventListener('mousedown', close, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onBlur)
    }
  }, [state])
  if (!state) return null
  const items = resolveMenu(menuFor(state.menu, state.targetId), menuContext())
  const onClose = (): void => uiStore.getState().openContextMenu(null)
  return (
    <MenuList
      key={`${state.x},${state.y},${state.menu}`}
      items={items}
      x={state.x}
      y={state.y}
      onClose={onClose}
      onSelect={(item) => {
        if (item.command === 'ui.zoom-preset') {
          const { activeDiagramId } = projectStore.getState()
          if (activeDiagramId) uiStore.getState().setZoom(activeDiagramId, item.args as number)
        } else if (item.command) runCommand(item.command, item.args)
      }}
    />
  )
}

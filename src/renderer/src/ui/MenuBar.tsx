/**
 * The menu bar of the web build, in place of the desktop's native menu: the same menus and
 * commands (`buildAppMenu`), drawn with the in-app menu list. Click a menu to open it; while one
 * is open, pointing at another opens that one, and ←/→ move between them. F10 focuses the bar.
 */
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { platform } from './app/bridge'
import { runCommand } from './app/commands'
import { menuContext } from './app/lifecycle'
import { buildAppMenu } from './menus/appMenu'
import { MenuList } from './menus/ContextMenu'
import { resolveMenu, type ResolvedMenuItem } from './menus/menuModel'

type ActionItem = Extract<ResolvedMenuItem, { kind: 'item' }>

function toggleFullScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  else void document.documentElement.requestFullscreen?.().catch(() => undefined)
}

/** Runs a menu item: its command, or the browser's version of its native role. */
function select(item: ActionItem): void {
  if (item.role === 'togglefullscreen') toggleFullScreen()
  else if (item.command) runCommand(item.command, item.args)
}

export function MenuBar(): React.JSX.Element {
  // Labels only; the items are resolved when a menu opens, so they show the current state.
  const labels = resolveMenu(buildAppMenu(platform), menuContext()).map((m) => (m.kind === 'separator' ? '' : m.label))
  const [open, setOpen] = useState<number | null>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F10' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return
      e.preventDefault()
      bar.current?.querySelector<HTMLButtonElement>('.menubar-item')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open === null) return
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Element | null
      if (!target?.closest?.('.menu') && !target?.closest?.('.menubar')) setOpen(null)
    }
    const close = (): void => setOpen(null)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const step = (delta: number): void => setOpen((i) => (i === null ? null : (i + delta + labels.length) % labels.length))
  const button = (i: number): HTMLButtonElement | undefined => bar.current?.querySelectorAll<HTMLButtonElement>('.menubar-item')[i]
  const close = (refocus: boolean): void => {
    const i = open
    setOpen(null)
    if (refocus && i !== null) button(i)?.focus()
  }

  let menu: React.JSX.Element | null = null
  if (open !== null) {
    const top = resolveMenu(buildAppMenu(platform), menuContext())[open]
    const rect = button(open)?.getBoundingClientRect()
    if (top?.kind === 'submenu' && rect) {
      menu = (
        <MenuList
          key={open}
          items={top.items}
          x={rect.left}
          y={rect.bottom}
          onClose={() => close(false)}
          onSelect={select}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
        />
      )
    }
  }

  return (
    <div className="menubar" role="menubar" aria-label="Application menu" ref={bar}>
      {labels.map((label, i) => (
        <button
          key={label}
          className={`menubar-item${open === i ? ' open' : ''}`}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open === i}
          onPointerDown={(e) => {
            // Open on press, like a native menu bar; the menu takes the focus.
            e.preventDefault()
            setOpen((o) => (o === i ? null : i))
          }}
          onClick={(e) => {
            // A click with no pointer press (VoiceOver, screen readers, system accessibility) opens it.
            if (e.detail === 0) setOpen(i)
          }}
          onPointerEnter={() => setOpen((o) => (o === null ? null : i))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault()
              const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + labels.length) % labels.length
              button(next)?.focus()
            } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(i)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              ;(document.activeElement as HTMLElement | null)?.blur()
            }
          }}
        >
          {label}
        </button>
      ))}
      {menu}
    </div>
  )
}

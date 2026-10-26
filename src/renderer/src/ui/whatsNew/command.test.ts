import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../../commands'
import { registerAppCommands } from '../app/appCommands'
import { WhatsNewDialog } from '../dialogs/WhatsNewDialog'
import { buildAppMenu } from '../menus/appMenu'
import { Cmd } from '../menus/commandIds'
import type { MenuNode } from '../menus/menuModel'
import { uiStore } from '../uiStore'
import { RELEASES } from './releases'

function ids(nodes: readonly MenuNode[] | (() => readonly MenuNode[]) | undefined): string[] {
  const list = typeof nodes === 'function' ? nodes() : (nodes ?? [])
  return list.flatMap((n) => [n.command ?? '', ...ids(n.submenu)])
}

describe("Help > What's New", () => {
  it('is registered and listed in the Help menu on every platform', () => {
    const registry = new CommandRegistry()
    registerAppCommands(registry)
    expect(registry.has(Cmd.helpWhatsNew)).toBe(true)
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const help = buildAppMenu(platform).find((n) => n.id === 'help')
      expect(ids(help?.submenu), platform).toContain(Cmd.helpWhatsNew)
    }
  })

  it('opens the newest release even when the startup window is turned off', async () => {
    const registry = new CommandRegistry()
    registerAppCommands(registry)
    uiStore.getState().setPrefs({ showWhatsNew: false })
    await registry.execute(Cmd.helpWhatsNew)
    const modal = uiStore.getState().modal
    expect(modal?.kind).toBe('whatsNew')
    expect(modal?.kind === 'whatsNew' && modal.releases.map((r) => r.version)).toEqual([RELEASES[0]?.version])
    uiStore.getState().openModal(null)
  })
})

describe('WhatsNewDialog', () => {
  it('starts on the first feature slide with Skip and Next', () => {
    const html = renderToStaticMarkup(createElement(WhatsNewDialog, { releases: RELEASES }))
    const first = RELEASES[0]?.features[0]
    expect(html).toContain(first?.title ?? 'missing')
    expect(html).toContain(`NEW IN ${RELEASES[0]?.version}`)
    expect(html).toContain('Skip')
    expect(html).toContain('Next')
    expect(html).not.toContain('Full changelog')
  })

  it('shows only the list slide, with Done and the changelog link, for a release without features', () => {
    const only = { version: '0.9.0', date: '2026-01-01', features: [], minor: [{ kind: 'fixed', text: 'A fix' } as const] }
    const html = renderToStaticMarkup(createElement(WhatsNewDialog, { releases: [only] }))
    expect(html).toContain('And a few more things')
    expect(html).toContain('Fixed')
    expect(html).toContain('Done')
    expect(html).toContain('Full changelog')
    expect(html).not.toContain('Skip')
  })
})

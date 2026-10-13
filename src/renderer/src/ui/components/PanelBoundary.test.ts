// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelBoundary } from './PanelBoundary'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  // React reports caught render errors on the console; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

function render(node: ReactNode): void {
  act(() => root.render(node))
}

let broken = true
function Flaky(): ReactNode {
  if (broken) throw new Error('boom')
  return createElement('span', null, 'explorer rows')
}

describe('PanelBoundary', () => {
  it('shows a reload notice for the failing panel while its siblings keep rendering', () => {
    broken = true
    const onError = vi.fn()
    render(
      createElement(
        'div',
        null,
        createElement(PanelBoundary, { name: 'Model Explorer', onError }, createElement(Flaky)),
        createElement(PanelBoundary, { name: 'Properties', onError }, createElement('span', null, 'property rows'))
      )
    )
    expect(host.textContent).toContain('This panel hit an error.')
    expect(host.querySelector('[role="alert"]')?.getAttribute('aria-label')).toBe('Model Explorer error')
    expect(host.textContent).toContain('property rows')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(onError.mock.calls[0]?.[1]).toBe('Model Explorer')

    // Reload mounts the content again.
    broken = false
    const button = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Reload panel') as HTMLButtonElement
    act(() => button.click())
    expect(host.textContent).toContain('explorer rows')
    expect(host.textContent).not.toContain('hit an error')
  })

  it('reports to an error toast by default', async () => {
    broken = true
    const { uiStore } = await import('../uiStore')
    render(createElement(PanelBoundary, { name: 'Toolbox' }, createElement(Flaky)))
    await Promise.resolve()
    expect(uiStore.getState().toasts.at(-1)).toMatchObject({ text: 'Toolbox hit an error: boom', kind: 'error' })
  })

  it('clears the error when its reset key changes, and can render a custom fallback', () => {
    broken = true
    const tree = (key: string): ReactNode =>
      createElement(PanelBoundary, { name: 'Dialog', resetKey: key, onError: () => undefined, fallback: () => createElement('em', null, 'closed') }, createElement(Flaky))
    render(tree('a'))
    expect(host.innerHTML).toBe('<em>closed</em>')
    broken = false
    render(tree('b'))
    expect(host.textContent).toBe('explorer rows')
  })
})

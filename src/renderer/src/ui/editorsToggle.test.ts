// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { uiStore } from './uiStore'

describe('Toggle Editors', () => {
  it('showing the editors also shows the side area that holds them', () => {
    const ui = (): ReturnType<typeof uiStore.getState> => uiStore.getState()
    ui().resetLayout()
    // The editors sit in the right area by default ("navigator" panel key).
    ui().togglePanel('editors')
    expect(ui().isPanelVisible('editors')).toBe(false)
    if (ui().panels.navigator.visible) ui().togglePanel('navigator')
    expect(ui().panels.navigator.visible).toBe(false)
    ui().togglePanel('editors')
    expect(ui().isPanelVisible('editors')).toBe(true)
    expect(ui().panels.navigator.visible).toBe(true)
  })
})

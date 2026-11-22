// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../diagram', async (original) => ({
  ...(await original<typeof import('../../diagram')>()),
  toggledBoxes: () => [],
  lossWarning: () => null,
  assignParentArrow: () => {
    throw new Error('Something broke')
  }
}))

const { toggleArrowBox } = await import('./AdvancedArrowsPanel')
const { uiStore } = await import('../uiStore')

describe('Advanced Arrows', () => {
  it('reports an unexpected failure instead of leaving it unhandled', async () => {
    const toast = vi.spyOn(uiStore.getState(), 'toast')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(toggleArrowBox({} as never, { port: {} } as never, {} as never, 'A1')).resolves.toBeUndefined()
    expect(toast).toHaveBeenCalledWith('Something broke', 'error')
  })
})

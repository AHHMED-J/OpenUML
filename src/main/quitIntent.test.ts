import { describe, expect, it } from 'vitest'
import { QuitIntent } from './quitIntent'

describe('quitting with unsaved changes', () => {
  it('Quit, then Save or Don\'t Save: the app quits (not only its window)', () => {
    const intent = new QuitIntent()
    intent.requestQuit()
    intent.closing(true)
    expect(intent.confirmed()).toBe(true)
  })

  it('closing the window, then Save or Don\'t Save: only the window closes', () => {
    const intent = new QuitIntent()
    intent.closing(true)
    expect(intent.confirmed()).toBe(false)
  })

  it('Quit, Cancel, then closing the window: only the window closes', () => {
    const intent = new QuitIntent()
    intent.requestQuit()
    intent.closing(true)
    // Cancel: no answer comes. Later the window's close button:
    intent.closing(true)
    expect(intent.confirmed()).toBe(false)
  })
})

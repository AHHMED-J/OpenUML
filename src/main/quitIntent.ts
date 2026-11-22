/**
 * Whether a held window close (unsaved changes: the renderer asks Save / Don't Save / Cancel)
 * came from quitting the app. On macOS closing the last window keeps the app running, so after
 * the answer a quit must go on quitting, while a plain window close only closes the window.
 *
 * Electron sends `before-quit` first and then closes each window, so a close right after
 * `before-quit` belongs to the quit; any later close (after Cancel) is a plain one again.
 */
export class QuitIntent {
  private quitRequested = false
  private heldForQuit = false

  /** `before-quit`. */
  requestQuit(): void {
    this.quitRequested = true
  }

  /** A window close event, `held` when it waits for the renderer's answer. */
  closing(held: boolean): void {
    if (held) this.heldForQuit = this.quitRequested
    this.quitRequested = false
  }

  /** The renderer answered Save / Don't Save: true to quit the app, false to close the window. */
  confirmed(): boolean {
    const quit = this.heldForQuit
    this.heldForQuit = false
    return quit
  }
}

/** How many renderer crashes (e.g. out of memory on a hostile file) reload the UI in a minute. */
const MAX_RELOADS = 3
const WINDOW_MS = 60_000

/**
 * The crashes of one window's renderer. Once this gives up the page is gone for good, so nothing
 * can answer the unsaved-changes prompt: the window must close without it (the recovery copy keeps
 * the work).
 */
export class RendererCrashes {
  private readonly times: number[] = []
  private gone = false

  /** Records a crash; returns whether to reload the page. */
  record(now: number): boolean {
    while (this.times.length > 0 && now - (this.times[0] as number) > WINDOW_MS) this.times.shift()
    this.times.push(now)
    if (this.times.length > MAX_RELOADS) this.gone = true
    return !this.gone
  }

  get gaveUp(): boolean {
    return this.gone
  }
}

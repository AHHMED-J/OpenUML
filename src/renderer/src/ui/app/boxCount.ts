/** The shared "number of child boxes" prompt of IDEF0 decomposition (canvas command and Model Explorer). */
import { promptText, uiStore } from '../uiStore'

/** Fewest and most child boxes a decomposition may have (IDEF0 recommends 3 to 6; fewer is warned by W01). */
const MIN_BOXES = 1
const MAX_BOXES = 6

/** Asks for a box count until the answer is valid; null = cancelled. */
export async function promptBoxCount(initial = 3, title = 'Number of child boxes'): Promise<number | null> {
  for (;;) {
    const text = await promptText(`${title} (${MIN_BOXES} to ${MAX_BOXES}; IDEF0 recommends 3 to 6)`, String(initial))
    if (text === null) return null
    const n = Number(text.trim())
    if (Number.isInteger(n) && n >= MIN_BOXES && n <= MAX_BOXES) return n
    uiStore.getState().toast(`Enter a whole number from ${MIN_BOXES} to ${MAX_BOXES}`, 'error')
  }
}

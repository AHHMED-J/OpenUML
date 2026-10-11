/** Process-wide text measurer used by the editor and the exporters (canvas when available). */
import { createTextMeasurer, type TextMeasurer } from '../core'

let measurer: TextMeasurer | null = null

export function getTextMeasurer(): TextMeasurer {
  if (!measurer) measurer = createTextMeasurer()
  return measurer
}

/** Replaces the shared measurer (tests use `FixedWidthTextMeasurer` for determinism). */
export function setTextMeasurer(m: TextMeasurer | null): void {
  measurer = m
}

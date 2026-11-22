/**
 * Guidance tips: small boxes that point at a part of the window with an arrow ("Click here to add
 * your first diagram"). A tip is data: what it says, what it points at, when it applies and when
 * its step is done. The layer (TipLayer) shows the first tip that applies, one at a time, and
 * remembers each tip once it was closed, acted on or done (guideStore).
 *
 * This is the base of a later tutor mode: a lesson is another list of tips over the same layer.
 */

/** Which side of its target a tip box sits on (its arrow points the other way). */
export type TipSide = 'top' | 'bottom' | 'left' | 'right'

/** What the tips look at: the state of the open project and the window. */
export interface GuideContext {
  /** Diagrams in the project. */
  readonly diagramCount: number
  /** The diagram on screen, if any. */
  readonly activeDiagramId: string | null
  /** Views drawn on the diagram on screen (0 without one). */
  readonly activeViewCount: number
  /** Selected views and model elements. */
  readonly selectionCount: number
}

export interface Tip {
  /** Stable id: it is stored once the tip is seen. */
  readonly id: string
  readonly text: string
  /** CSS selector of the element the tip points at; the tip waits while it is not on screen. */
  readonly target: string
  /** Preferred side of the target; another is used when the box does not fit there. */
  readonly side: TipSide
  /** The tip applies now. */
  readonly when: (ctx: GuideContext) => boolean
  /** The step is done (the user did it another way): the tip counts as seen and never shows. */
  readonly done?: (ctx: GuideContext) => boolean
}

/** Tips of `tips` whose step is done in `ctx` and that are not yet `seen`. */
export function doneTips(tips: readonly Tip[], ctx: GuideContext, seen: ReadonlySet<string>): string[] {
  return tips.filter((t) => !seen.has(t.id) && t.done?.(ctx) === true).map((t) => t.id)
}

/**
 * The tip to show: the first of `tips` not yet seen that applies in `ctx`, is not done and whose
 * target `isOnScreen`. Null when none.
 */
export function pickTip(tips: readonly Tip[], ctx: GuideContext, seen: ReadonlySet<string>, isOnScreen: (selector: string) => boolean): Tip | null {
  for (const tip of tips) {
    if (seen.has(tip.id) || tip.done?.(ctx) === true || !tip.when(ctx)) continue
    if (isOnScreen(tip.target)) return tip
  }
  return null
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface TipPlacement {
  readonly side: TipSide
  /** Top-left corner of the box. */
  readonly left: number
  readonly top: number
  /** Where the arrow meets the box edge: px from the box's left (top/bottom) or top (left/right). */
  readonly arrow: number
}

const OPPOSITE: Readonly<Record<TipSide, TipSide>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
}
/** Gap between target and box, room for the arrow. */
const GAP = 10
/** Closest a box gets to the window edge. */
const MARGIN = 8
/** Closest the arrow gets to a box corner. */
const ARROW_INSET = 14

/**
 * Where a `box` (its size) goes next to `target` inside `view`: on `side` when it fits, else the
 * opposite side, else the other two, else on `side` anyway; slid along the edge to stay in view,
 * with the arrow still at the target's middle (as far as the box allows).
 */
export function placeTip(target: Rect, box: { width: number; height: number }, side: TipSide, view: { width: number; height: number }): TipPlacement {
  const fits = (s: TipSide): boolean => {
    switch (s) {
      case 'top':
        return target.top - GAP - box.height >= MARGIN
      case 'bottom':
        return target.top + target.height + GAP + box.height <= view.height - MARGIN
      case 'left':
        return target.left - GAP - box.width >= MARGIN
      case 'right':
        return target.left + target.width + GAP + box.width <= view.width - MARGIN
    }
  }
  const order: TipSide[] = [side, OPPOSITE[side], ...(['bottom', 'top', 'right', 'left'] as const).filter((s) => s !== side && s !== OPPOSITE[side])]
  const chosen = order.find(fits) ?? side
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
  const midX = target.left + target.width / 2
  const midY = target.top + target.height / 2
  if (chosen === 'top' || chosen === 'bottom') {
    const left = clamp(midX - box.width / 2, MARGIN, Math.max(MARGIN, view.width - MARGIN - box.width))
    const top = chosen === 'top' ? target.top - GAP - box.height : target.top + target.height + GAP
    return {
      side: chosen,
      left,
      top,
      arrow: clamp(midX - left, ARROW_INSET, box.width - ARROW_INSET)
    }
  }
  const top = clamp(midY - box.height / 2, MARGIN, Math.max(MARGIN, view.height - MARGIN - box.height))
  const left = chosen === 'left' ? target.left - GAP - box.width : target.left + target.width + GAP
  return {
    side: chosen,
    left,
    top,
    arrow: clamp(midY - top, ARROW_INSET, box.height - ARROW_INSET)
  }
}

/**
 * Shows the guidance tip that applies now (tips.ts) next to its target, with an arrow pointing at
 * it. One tip at a time; none while a dialog or menu is open. A tip goes away for good when the
 * user closes it (✕ or Esc), acts on its target (presses or focuses it) or does its step another
 * way; "Don't show tips again" turns them all off (Preferences > Help brings them back).
 *
 * Accessibility: the tip is a non-modal dialog whose buttons are in the tab order; its text is
 * announced politely when it appears and describes the target (aria-describedby) while shown.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { isKindOf } from '../../model'
import { useProjectStore } from '../../store'
import { UiIcon } from '../icons'
import { uiStore, useUiStore } from '../uiStore'
import { FIRST_STEPS } from './firstSteps'
import { guideStore, useGuideStore } from './guideStore'
import { doneTips, pickTip, placeTip, type GuideContext, type Tip, type TipPlacement } from './tips'

/** How often the tip looks again for its target (panels move, collapse and resize). */
const RECHECK_MS = 400

/** The target of `selector` when it is drawn inside the window, else null. */
function targetOnScreen(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return null
  return el
}

/** The project state the tips look at. */
function useGuideContext(): GuideContext {
  const version = useProjectStore((s) => s.version)
  const repository = useProjectStore((s) => s.repository)
  const activeDiagramId = useProjectStore((s) => s.activeDiagramId)
  const selectionCount = useProjectStore((s) => s.selectedViewIds.length + s.selectedElementIds.length)
  return useMemo(() => {
    void version
    const diagram = repository.get(activeDiagramId)
    const views = isKindOf(diagram, 'Diagram') ? diagram.ownedViews : undefined
    return { diagramCount: repository.diagrams().length, activeDiagramId, activeViewCount: views?.length ?? 0, selectionCount }
  }, [version, repository, activeDiagramId, selectionCount])
}

export function TipLayer({ tips = FIRST_STEPS }: { tips?: readonly Tip[] }): React.JSX.Element {
  const enabled = useUiStore((s) => s.prefs.showTips)
  const blocked = useUiStore((s) => s.modal !== null || s.contextMenu !== null)
  const seen = useGuideStore((s) => s.seen)
  const ctx = useGuideContext()
  const [tick, setTick] = useState(0)

  // A step done another way (a diagram added from the menu bar...) never shows its tip later.
  useEffect(() => {
    const done = doneTips(tips, ctx, seen)
    if (done.length > 0) guideStore.getState().markSeen(...done)
  }, [tips, ctx, seen])

  const waiting = enabled && !blocked && pickTip(tips, ctx, seen, () => true) !== null
  useEffect(() => {
    if (!waiting) return
    // Targets render in the same pass as this layer: look again once they are in the document.
    setTick((t) => t + 1)
    const timer = window.setInterval(() => setTick((t) => t + 1), RECHECK_MS)
    const onResize = (): void => setTick((t) => t + 1)
    window.addEventListener('resize', onResize)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [waiting])

  void tick
  const tip = waiting ? pickTip(tips, ctx, seen, (selector) => targetOnScreen(selector) !== null) : null
  const target = tip ? targetOnScreen(tip.target) : null
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {tip ? `Tip: ${tip.text}` : ''}
      </div>
      {tip && target ? <TipBox key={tip.id} tip={tip} target={target} /> : null}
    </>
  )
}

function TipBox({ tip, target }: { tip: Tip; target: HTMLElement }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const textId = useId()
  const [place, setPlace] = useState<TipPlacement | null>(null)
  const close = (): void => guideStore.getState().markSeen(tip.id)

  // Place the box beside the target (measured after each render: the target can move).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = target.getBoundingClientRect()
    const next = placeTip(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      { width: el.offsetWidth, height: el.offsetHeight },
      tip.side,
      { width: window.innerWidth, height: window.innerHeight }
    )
    setPlace((p) => (p && p.side === next.side && p.left === next.left && p.top === next.top && p.arrow === next.arrow ? p : next))
  })

  // Acting on the target is doing the step; the target is described by the tip meanwhile.
  useEffect(() => {
    const act = (): void => guideStore.getState().markSeen(tip.id)
    target.addEventListener('pointerdown', act, true)
    target.addEventListener('focusin', act, true)
    const described = target.getAttribute('aria-describedby')
    target.setAttribute('aria-describedby', described ? `${described} ${textId}` : textId)
    return () => {
      target.removeEventListener('pointerdown', act, true)
      target.removeEventListener('focusin', act, true)
      if (described === null) target.removeAttribute('aria-describedby')
      else target.setAttribute('aria-describedby', described)
    }
  }, [target, tip.id, textId])

  const arrowStyle: React.CSSProperties | undefined = place
    ? place.side === 'top' || place.side === 'bottom'
      ? { left: place.arrow }
      : { top: place.arrow }
    : undefined
  return (
    <div
      ref={box}
      className={`guide-tip guide-tip-${place?.side ?? tip.side}`}
      role="dialog"
      aria-modal="false"
      aria-label="Tip"
      aria-describedby={textId}
      style={place ? { left: place.left, top: place.top } : { left: -9999, top: -9999, visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        close()
        target.focus({ preventScroll: true })
      }}
    >
      <span className="guide-tip-arrow" style={arrowStyle} aria-hidden="true" />
      <p id={textId} className="guide-tip-text">
        {tip.text}
      </p>
      <button className="icon-button guide-tip-close" aria-label="Close tip" data-tip="Close" onClick={close}>
        <UiIcon name="close" size={12} />
      </button>
      <button className="guide-tip-off" onClick={() => uiStore.getState().setPrefs({ showTips: false })}>
        Don't show tips again
      </button>
    </div>
  )
}

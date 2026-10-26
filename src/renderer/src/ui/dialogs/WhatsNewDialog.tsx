/** What's New: a carousel with one slide per big feature and a final list of the smaller changes. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { bridge } from '../app/bridge'
import { Modal } from '../components/Modal'
import { UiIcon } from '../icons'
import { uiStore } from '../uiStore'
import { Illustration } from '../whatsNew/illustrations'
import { buildSlides, slideControls, type ListSlide } from '../whatsNew/logic'
import { releaseUrl, type Release } from '../whatsNew/releases'

const KIND_LABEL = { improved: 'Improved', fixed: 'Fixed' } as const

function close(): void {
  uiStore.getState().openModal(null)
}

export function WhatsNewDialog({ releases }: { releases: readonly Release[] }): React.JSX.Element {
  const slides = useMemo(() => buildSlides(releases), [releases])
  const [index, setIndex] = useState(0)
  const primary = useRef<HTMLButtonElement>(null)
  const slide = slides[index]
  const controls = slideControls(slides, index)
  const featureCount = slides.filter((s) => s.kind === 'feature').length

  // Keep the focus on the main button so Enter always means Next / Done.
  useEffect(() => primary.current?.focus(), [index])

  const go = (to: number): void => setIndex(Math.min(slides.length - 1, Math.max(0, to)))
  const next = (): void => (controls.primary === 'done' ? close() : go(index + 1))

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowRight') go(index + 1)
    else if (e.key === 'ArrowLeft') go(index - 1)
    else return
    e.preventDefault()
  }

  const latest = releases[0]
  if (!slide || !latest) {
    return (
      <Modal title="What's New" onClose={close} width={560}>
        <p>Nothing to show yet.</p>
      </Modal>
    )
  }

  return (
    <Modal title="What's New" onClose={close} width={560} className="whats-new" bare>
      <div className="wn" onKeyDown={onKeyDown}>
        {slide.kind === 'feature' ? (
          <section className="wn-slide" key={index} aria-label={slide.feature.title}>
            <div className="wn-hero">
              <Illustration id={slide.feature.illustration} />
            </div>
            <div className="wn-meta">
              <span className="wn-chip">NEW IN {slide.version}</span>
              <span className="wn-count">
                {index + 1} of {slides.length}
              </span>
            </div>
            <h2 className="wn-title">{slide.feature.title}</h2>
            <p className="wn-text">{slide.feature.description}</p>
          </section>
        ) : (
          <ListSlideView key={index} slide={slide} total={featureCount + 1} index={index} />
        )}
        <div className="wn-footer">
          <div className="wn-dots" role="tablist" aria-label="Slides">
            {slides.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                className={i === index ? 'wn-dot active' : 'wn-dot'}
                tabIndex={-1}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="wn-actions">
            {slide.kind === 'list' ? (
              <button className="wn-link" onClick={() => bridge?.openExternal(releaseUrl(latest.version))} disabled={bridge === null}>
                Full changelog ↗
              </button>
            ) : null}
            {controls.canSkip ? (
              <button className="button" onClick={close}>
                Skip
              </button>
            ) : null}
            {controls.canBack ? (
              <button className="button" onClick={() => go(index - 1)}>
                Back
              </button>
            ) : null}
            <button ref={primary} className="button primary" data-autofocus onClick={next}>
              {controls.primary === 'done' ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ListSlideView({ slide, total, index }: { slide: ListSlide; total: number; index: number }): React.JSX.Element {
  return (
    <section className="wn-slide wn-list" aria-label="And a few more things">
      <div className="wn-band">
        <span className="wn-band-icon">
          <UiIcon name="check" size={16} />
        </span>
        <h2 className="wn-title">And a few more things</h2>
        <span className="wn-count">
          {index + 1} of {total}
        </span>
      </div>
      <div className="wn-list-body">
        {slide.groups.map((group) => (
          <div key={group.version} className="wn-group">
            {slide.groups.length > 1 ? <h3 className="wn-group-title">{group.version}</h3> : null}
            {(['improved', 'fixed'] as const).map((kind) => {
              const items = group.items.filter((i) => i.kind === kind)
              return items.length === 0 ? null : (
                <div key={kind} className="wn-kind">
                  <span className={`wn-tag ${kind}`}>{KIND_LABEL[kind]}</span>
                  <ul>
                    {items.map((i) => (
                      <li key={i.text}>{i.text}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Style editor (MVP subset) for the selected views: colors, font size, line style, auto resize
 * and the show/suppress toggles. Only controls that every selected view supports are shown.
 */
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { setFieldsOfAll } from '../../commands'
import { FONT_SIZES, colorIdef0Arrows, isFlowColorEdit } from '../../diagram'
import { fieldOf, type Font, type View } from '../../model'
import { projectStore } from '../../store'
import { reportError } from '../app/commands'
import { parseHexColor } from './colorText'
import { useSelectedViews } from './useSelection'

type StyleWidget = 'color' | 'fontSize' | 'lineStyle' | 'flag'

interface StyleField {
  readonly field: string
  readonly label: string
  readonly widget: StyleWidget
}

const STYLE_FIELDS: readonly StyleField[] = [
  { field: 'fillColor', label: 'Fill Color', widget: 'color' },
  { field: 'lineColor', label: 'Line Color', widget: 'color' },
  { field: 'fontColor', label: 'Text Color', widget: 'color' },
  { field: 'font', label: 'Font Size', widget: 'fontSize' },
  { field: 'lineStyle', label: 'Line Style', widget: 'lineStyle' },
  { field: 'autoResize', label: 'Auto Resize', widget: 'flag' },
  { field: 'showShadow', label: 'Show Shadow', widget: 'flag' },
  { field: 'wordWrap', label: 'Word Wrap', widget: 'flag' },
  { field: 'showVisibility', label: 'Show Visibility', widget: 'flag' },
  { field: 'showType', label: 'Show Type', widget: 'flag' },
  { field: 'showMultiplicity', label: 'Show Multiplicity', widget: 'flag' },
  { field: 'showOperationSignature', label: 'Show Operation Signature', widget: 'flag' },
  { field: 'suppressAttributes', label: 'Suppress Attributes', widget: 'flag' },
  { field: 'suppressOperations', label: 'Suppress Operations', widget: 'flag' },
  { field: 'suppressLiterals', label: 'Suppress Literals', widget: 'flag' }
]

const LINE_STYLES: ReadonlyArray<[number, string]> = [
  [0, 'Rectilinear'],
  [1, 'Oblique'],
  [2, 'Rounded Rectilinear'],
  [3, 'Curve']
]

/** Style fields supported by every view in `views`. */
function styleFieldsFor(views: readonly View[]): StyleField[] {
  if (views.length === 0) return []
  return STYLE_FIELDS.filter((f) => views.every((v) => fieldOf(v, f.field) !== undefined))
}

function apply(views: readonly View[], field: string, value: unknown, label: string): void {
  try {
    const engine = projectStore.getState().engine
    // An IDEF0 arrow is colored as one logical arrow: its branches and its counterparts on other levels.
    if (isFlowColorEdit(views, field)) colorIdef0Arrows(engine, views, field, String(value), `Change ${label}`)
    else setFieldsOfAll(engine, views, { [field]: value }, `Change ${label}`)
  } catch (err) {
    reportError(err)
  }
}

function applyFontSize(views: readonly View[], size: number): void {
  try {
    projectStore.getState().engine.transact('Change Font Size', (b) => {
      for (const v of views) b.set(v, 'font', { ...(v.font as Font), size } satisfies Font)
    })
  } catch (err) {
    reportError(err)
  }
}

function merged<T>(views: readonly View[], read: (v: View) => T): { value: T; mixed: boolean } {
  const value = read(views[0] as View)
  return { value, mixed: views.some((v) => read(v) !== value) }
}

/**
 * A color as a swatch (the system picker: previews while dragging, commits once when it closes)
 * and as editable text (copy the code, paste or type `#rrggbb` / `#rgb`; Enter or leaving the field
 * applies it, Esc puts back the current value).
 */
function ColorField({ id, label, value, mixed, onCommit }: { id: string; label: string; value: string; mixed: boolean; onCommit: (v: string) => void }): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(value)
  const [text, setText] = useState(mixed ? '' : value)
  useEffect(() => setPreview(value), [value])
  useEffect(() => setText(mixed ? '' : preview), [preview, mixed])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onChange = (): void => {
      if (el.value.toLowerCase() !== value.toLowerCase()) onCommit(el.value)
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [value, onCommit])
  const commitText = (): void => {
    const color = parseHexColor(text)
    if (color && (mixed || color !== value.toLowerCase())) onCommit(color)
    else setText(mixed ? '' : value)
  }
  const hex = /^#[0-9a-f]{6}$/i.test(preview) ? preview : '#000000'
  return (
    <div className="color-field">
      <input ref={ref} id={id} type="color" value={hex} onInput={(e) => setPreview(e.currentTarget.value)} onChange={() => undefined} />
      <input
        className="color-text"
        type="text"
        value={text}
        placeholder={mixed ? '—' : '#rrggbb'}
        spellCheck={false}
        maxLength={9}
        aria-label={`${label} code`}
        title="Type or paste a color code (#rrggbb or #rgb); Enter applies it"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitText()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setText(mixed ? '' : value)
          }
        }}
      />
    </div>
  )
}

export function StyleEditor(): React.JSX.Element {
  const { views } = useSelectedViews()
  const fields = styleFieldsFor(views)
  if (views.length === 0) return <div className="empty-note">Select views on the diagram to format them.</div>
  if (fields.length === 0) return <div className="empty-note">No style options for this selection.</div>
  return (
    <div className="prop-grid" role="group" aria-label="Style">
      {fields.map((f) => {
        const id = `style-${f.field}`
        let control: React.ReactNode
        switch (f.widget) {
          case 'color': {
            const m = merged(views, (v) => String(v[f.field] ?? ''))
            control = <ColorField id={id} label={f.label} value={m.value} mixed={m.mixed} onCommit={(c) => apply(views, f.field, c, f.label)} />
            break
          }
          case 'fontSize': {
            const m = merged(views, (v) => (v.font as Font | undefined)?.size ?? 13)
            control = (
              <select id={id} value={m.mixed ? '' : String(m.value)} onChange={(e) => applyFontSize(views, Number(e.target.value))}>
                {m.mixed ? <option value="">—</option> : null}
                {[...new Set([...FONT_SIZES, m.value])].sort((a, b) => a - b).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )
            break
          }
          case 'lineStyle': {
            const m = merged(views, (v) => Number(v[f.field] ?? 1))
            control = (
              <select id={id} value={m.mixed ? '' : String(m.value)} onChange={(e) => apply(views, f.field, Number(e.target.value), f.label)}>
                {m.mixed ? <option value="">—</option> : null}
                {LINE_STYLES.map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </select>
            )
            break
          }
          case 'flag': {
            const m = merged(views, (v) => v[f.field] === true)
            control = (
              <input
                id={id}
                type="checkbox"
                checked={!m.mixed && m.value}
                ref={(el) => {
                  if (el) el.indeterminate = m.mixed
                }}
                onChange={(e) => apply(views, f.field, e.target.checked, f.label)}
              />
            )
            break
          }
        }
        return (
          <div className="prop-row" key={f.field}>
            <label className="prop-label" htmlFor={id}>
              {f.label}
            </label>
            <div className="prop-value">{control}</div>
          </div>
        )
      })}
    </div>
  )
}

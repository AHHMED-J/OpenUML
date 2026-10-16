/** Text prompt, element picker (tree filtered to allowed types) and reference-list editor dialogs. */
import { useMemo, useState } from 'react'
import type React from 'react'
import { isKindOf, type Elem } from '../../model'
import { projectStore } from '../../store'
import { Modal } from '../components/Modal'
import { explorerChildren, explorerLabel, pathTo } from '../explorer/tree'
import { TypeIcon, UiIcon } from '../icons'
import { pickElement, uiStore } from '../uiStore'

export function PromptDialog({ title, initial, resolve }: { title: string; initial: string; resolve: (v: string | null) => void }): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const finish = (v: string | null): void => {
    uiStore.getState().openModal(null)
    resolve(v)
  }
  return (
    <Modal
      title={title}
      onClose={() => finish(null)}
      width={380}
      footer={
        <>
          <span className="spacer" />
          <button className="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className="button primary" onClick={() => finish(value)}>
            OK
          </button>
        </>
      }
    >
      <input
        className="full"
        type="text"
        aria-label={title}
        value={value}
        data-autofocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(value)
        }}
      />
    </Modal>
  )
}

/** Elements of the allowed types, with their containment path (for display). */
function candidates(types: readonly string[]): Array<{ el: Elem; path: string }> {
  const result: Array<{ el: Elem; path: string }> = []
  const visit = (el: Elem): void => {
    if (types.some((t) => isKindOf(el, t))) {
      result.push({
        el,
        path: pathTo(el)
          .slice(1, -1)
          .map((p) => (typeof p['name'] === 'string' ? p['name'] : ''))
          .join('::')
      })
    }
    for (const c of explorerChildren(el)) visit(c)
  }
  visit(projectStore.getState().project)
  return result
}

export function ElementPickerDialog({
  title,
  types,
  resolve
}: {
  title: string
  types: readonly string[]
  resolve: (id: string | null) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const all = useMemo(() => candidates(types), [types])
  const items = all.filter((c) => explorerLabel(c.el, false).toLowerCase().includes(query.toLowerCase()))
  const [selected, setSelected] = useState<string | null>(null)
  const finish = (id: string | null): void => {
    uiStore.getState().openModal(null)
    resolve(id)
  }
  return (
    <Modal
      title={title}
      onClose={() => finish(null)}
      width={460}
      footer={
        <>
          <span className="spacer" />
          <button className="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className="button primary" disabled={!selected} onClick={() => finish(selected)}>
            OK
          </button>
        </>
      }
    >
      <input
        className="full"
        type="search"
        placeholder="Filter"
        aria-label="Filter elements"
        data-autofocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items.length === 1) finish(items[0]?.el._id ?? null)
        }}
      />
      <div className="picker-list" role="listbox" aria-label="Elements">
        {items.length === 0 ? <div className="empty-note">No elements of this type</div> : null}
        {items.map(({ el, path }) => (
          <div
            key={el._id}
            role="option"
            tabIndex={0}
            aria-selected={selected === el._id}
            className={`list-row${selected === el._id ? ' selected' : ''}`}
            onClick={() => setSelected(el._id)}
            onDoubleClick={() => finish(el._id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finish(el._id)
              else if (e.key === ' ') setSelected(el._id)
            }}
          >
            <TypeIcon type={el._type} />
            <span className="list-label">{explorerLabel(el, false)}</span>
            <span className="muted path">{path}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function ReferenceListDialog({
  title,
  types,
  initial,
  resolve
}: {
  title: string
  types: readonly string[]
  initial: readonly string[]
  resolve: (ids: readonly string[] | null) => void
}): React.JSX.Element {
  const [ids, setIds] = useState<string[]>([...initial])
  const [selected, setSelected] = useState<string | null>(null)
  const repo = projectStore.getState().repository
  const index = selected ? ids.indexOf(selected) : -1
  const finish = (result: readonly string[] | null): void => {
    uiStore.getState().openModal(null)
    resolve(result)
  }
  const move = (step: number): void => {
    if (index < 0) return
    const next = [...ids]
    const [item] = next.splice(index, 1)
    next.splice(index + step, 0, item as string)
    setIds(next)
  }
  // The picker replaces this dialog; reopen with the current list afterwards.
  const add = async (): Promise<void> => {
    const picked = await pickElement(`Add to ${title}`, types)
    const next = picked && !ids.includes(picked) ? [...ids, picked] : ids
    uiStore.getState().openModal({ kind: 'refList', title, types, initial: next, resolve })
  }
  return (
    <Modal
      title={title}
      onClose={() => finish(null)}
      width={420}
      footer={
        <>
          <span className="spacer" />
          <button className="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className="button primary" onClick={() => finish(ids)}>
            OK
          </button>
        </>
      }
    >
      <div className="collection">
        <div className="collection-list tall" role="listbox" aria-label={title}>
          {ids.length === 0 ? <div className="muted collection-empty">(empty)</div> : null}
          {ids.map((id) => {
            const el = repo.get(id)
            if (!el) return null
            return (
              <div
                key={id}
                role="option"
                tabIndex={0}
                aria-selected={selected === id}
                className={`collection-item${selected === id ? ' selected' : ''}`}
                onClick={() => setSelected(id)}
              >
                <TypeIcon type={el._type} size={14} />
                <span>{explorerLabel(el, false)}</span>
              </div>
            )
          })}
        </div>
        <div className="collection-buttons">
          <button className="icon-button" aria-label="Add" data-tip="Add..." onClick={() => void add()}>
            <UiIcon name="plus" />
          </button>
          <button
            className="icon-button"
            aria-label="Remove"
            data-tip="Remove"
            disabled={index < 0}
            onClick={() => setIds(ids.filter((i) => i !== selected))}
          >
            <UiIcon name="minus" />
          </button>
          <button className="icon-button" aria-label="Move up" data-tip="Move Up" disabled={index <= 0} onClick={() => move(-1)}>
            <UiIcon name="up" />
          </button>
          <button
            className="icon-button"
            aria-label="Move down"
            data-tip="Move Down"
            disabled={index < 0 || index >= ids.length - 1}
            onClick={() => move(1)}
          >
            <UiIcon name="down" />
          </button>
        </div>
      </div>
    </Modal>
  )
}

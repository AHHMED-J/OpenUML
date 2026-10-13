/**
 * Property editor: one row per metamodel field of the selected element(s) (see `propertyRows`).
 * Every edit is one undoable operation applied to all selected elements.
 */
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { addFeature, deleteFromModel, reorderElement, setFieldsOfAll } from '../../commands'
import { renameElements } from '../../diagram'
import { isElem, typeDisplayName, type Elem } from '../../model'
import { projectStore } from '../../store'
import { selectInExplorer } from '../app/appCommands'
import { reportError } from '../app/commands'
import { explorerLabel, variantText } from '../explorer/tree'
import { TypeIcon, UiIcon } from '../icons'
import { editReferenceList, pickElement, uiStore, useUiStore } from '../uiStore'
import { parseInput, propertyRows, resolveVariant, type PropertyRow } from './propertyRows'
import { useSelectedModels } from './useSelection'

const MIXED = '—'

function commit(row: PropertyRow, value: unknown): void {
  try {
    const engine = projectStore.getState().engine
    // Names go through the rename hooks (linked IDEF0 arrows, diagram titles).
    if (row.field === 'name' && typeof value === 'string') renameElements(engine, row.targets, value, `Change ${row.label}`)
    else setFieldsOfAll(engine, row.targets, { [row.field]: value }, `Change ${row.label}`)
  } catch (err) {
    reportError(err)
  }
}

export function PropertyEditor(): React.JSX.Element {
  const { models } = useSelectedModels()
  const showAdvanced = useUiStore((s) => s.showAdvancedProperties)
  if (models.length === 0) return <div className="empty-note">Nothing selected</div>
  const rows = propertyRows(models)
  const first = models[0] as Elem
  const hasAdvanced = rows.some((r) => r.advanced)
  const visible = rows.filter((r) => showAdvanced || !r.advanced)
  let section: string | undefined
  const identity = models.map((m) => m._id).join(',')
  return (
    <div className="properties">
      <div className="properties-title">
        <TypeIcon type={first._type} />
        <span>{models.length === 1 ? typeDisplayName(first._type) : `${models.length} elements`}</span>
      </div>
      <div className="prop-grid" role="group" aria-label="Properties">
        {visible.map((row) => {
          const header = row.section !== section ? row.section : undefined
          section = row.section
          return (
            <PropertyRowView
              key={`${identity}:${row.key}`}
              row={row}
              header={header}
            />
          )
        })}
      </div>
      {hasAdvanced ? (
        <label className="advanced-toggle">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(e) => uiStore.getState().setShowAdvancedProperties(e.target.checked)}
          />
          Show advanced properties
        </label>
      ) : null}
    </div>
  )
}

function PropertyRowView({ row, header }: { row: PropertyRow; header?: string }): React.JSX.Element {
  const id = `prop-${row.key.replace(/\./g, '-')}`
  const wide = row.widget === 'collection' || row.widget === 'textarea'
  return (
    <>
      {header ? <div className="prop-section">{header}</div> : null}
      <div className={`prop-row${wide ? ' wide' : ''}`}>
        <label className="prop-label" htmlFor={id} title={row.field}>
          {row.label}
        </label>
        <div className="prop-value">
          <Widget row={row} id={id} />
        </div>
      </div>
    </>
  )
}

function Widget({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  switch (row.widget) {
    case 'checkbox':
      return <CheckboxField row={row} id={id} />
    case 'enum':
      return (
        <select
          id={id}
          value={row.mixed ? '' : String(row.value ?? '')}
          disabled={row.readOnly}
          onChange={(e) => commit(row, e.target.value)}
        >
          {row.mixed ? <option value="">{MIXED}</option> : null}
          {(row.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'ref':
      return <RefField row={row} id={id} />
    case 'refs':
      return <RefsField row={row} id={id} />
    case 'var':
      return <VariantField row={row} id={id} />
    case 'collection':
      return <CollectionField row={row} id={id} />
    default:
      return <TextField row={row} id={id} />
  }
}

/** Text, textarea, combo and number rows: commit on Enter/blur, Esc reverts. */
function TextField({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  const initial = row.mixed ? '' : String(row.value ?? '')
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])
  const listId = row.widget === 'combo' ? `${id}-options` : undefined
  const apply = (): void => {
    if (value === initial) return
    const parsed = parseInput(row, value)
    if (parsed === undefined) setValue(initial)
    else commit(row, parsed)
  }
  const common = {
    id,
    value,
    placeholder: row.mixed ? MIXED : undefined,
    readOnly: row.readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    onBlur: apply
  }
  if (row.widget === 'textarea') {
    return (
      <textarea
        {...common}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            apply()
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setValue(initial)
          }
        }}
      />
    )
  }
  return (
    <>
      <input
        {...common}
        type="text"
        inputMode={row.widget === 'number' ? 'decimal' : undefined}
        list={listId}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
          else if (e.key === 'Escape') {
            e.stopPropagation()
            setValue(initial)
          }
        }}
      />
      {listId ? (
        <datalist id={listId}>
          {(row.options ?? []).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
    </>
  )
}

function CheckboxField({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = row.mixed
  }, [row.mixed])
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      checked={!row.mixed && row.value === true}
      disabled={row.readOnly}
      onChange={(e) => commit(row, e.target.checked)}
    />
  )
}

function ElementChip({ el }: { el: Elem }): React.JSX.Element {
  return (
    <button className="chip" title="Select in Explorer" onClick={() => selectInExplorer(el)}>
      <TypeIcon type={el._type} size={14} />
      <span>{explorerLabel(el, false)}</span>
    </button>
  )
}

function RefField({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  const value = row.mixed ? null : isElem(row.value) ? row.value : null
  return (
    <div className="ref-field" id={id}>
      {row.mixed ? <span className="muted">{MIXED}</span> : value ? <ElementChip el={value} /> : <span className="muted">(none)</span>}
      {row.readOnly ? null : (
        <>
          <button
            className="icon-button"
            aria-label={`Choose ${row.label}`}
            title="Choose..."
            onClick={async () => {
              const picked = await pickElement(`Select ${row.label}`, [row.type])
              if (picked) commit(row, projectStore.getState().repository.get(picked) ?? null)
            }}
          >
            <UiIcon name="ellipsis" />
          </button>
          <button className="icon-button" aria-label={`Clear ${row.label}`} title="Clear" disabled={!value} onClick={() => commit(row, null)}>
            <UiIcon name="close" />
          </button>
        </>
      )}
    </div>
  )
}

function RefsField({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  const list = Array.isArray(row.value) ? (row.value as unknown[]).filter(isElem) : []
  return (
    <div className="ref-field" id={id}>
      <span className="muted">{row.mixed ? MIXED : list.length === 0 ? '(none)' : `${list.length} item${list.length === 1 ? '' : 's'}`}</span>
      {row.readOnly ? null : (
        <button
          className="icon-button"
          aria-label={`Edit ${row.label}`}
          title="Edit..."
          onClick={async () => {
            const ids = await editReferenceList(row.label, [row.type], list.map((e) => e._id))
            if (!ids) return
            const repo = projectStore.getState().repository
            commit(row, ids.map((i) => repo.get(i)).filter(isElem))
          }}
        >
          <UiIcon name="ellipsis" />
        </button>
      )}
    </div>
  )
}

/** `var` rows: text with autocomplete; resolves to a reference when the name matches an element of the type. */
function VariantField({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  const initial = row.mixed ? '' : variantText(row.value)
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])
  const listId = `${id}-options`
  const repo = projectStore.getState().repository
  const names = [...new Set(repo.findByType(row.type).map((e) => (typeof e['name'] === 'string' ? (e['name'] as string) : '')).filter(Boolean))]
  const isRef = !row.mixed && isElem(row.value)
  const apply = (): void => {
    if (value === initial) return
    const context = row.targets[0] as Elem
    commit(row, resolveVariant(repo.elements(), context, row.type, value))
  }
  return (
    <div className="var-field">
      <input
        id={id}
        type="text"
        list={listId}
        value={value}
        placeholder={row.mixed ? MIXED : undefined}
        className={isRef ? 'is-ref' : undefined}
        title={isRef ? 'Linked to a model element' : 'Plain text'}
        onChange={(e) => setValue(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
          else if (e.key === 'Escape') {
            e.stopPropagation()
            setValue(initial)
          }
        }}
      />
      <datalist id={listId}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button
        className="icon-button"
        aria-label={`Choose ${row.label}`}
        title="Choose..."
        onClick={async () => {
          const picked = await pickElement(`Select ${row.label}`, [row.type])
          if (picked) commit(row, projectStore.getState().repository.get(picked) ?? null)
        }}
      >
        <UiIcon name="ellipsis" />
      </button>
    </div>
  )
}

function CollectionField({ row, id }: { row: PropertyRow; id: string }): React.JSX.Element {
  const owner = row.targets[0] as Elem
  const items = (Array.isArray(row.value) ? row.value : []).filter(isElem)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((i) => i._id === selectedId) ?? null
  const index = selected ? items.indexOf(selected) : -1
  const engine = projectStore.getState().engine
  const run = (fn: () => void): void => {
    try {
      fn()
    } catch (err) {
      reportError(err)
    }
  }
  return (
    <div className="collection" id={id}>
      <div className="collection-list" role="listbox" aria-label={row.label}>
        {items.length === 0 ? <div className="muted collection-empty">(empty)</div> : null}
        {items.map((item) => (
          <div
            key={item._id}
            role="option"
            aria-selected={item._id === selectedId}
            tabIndex={0}
            className={`collection-item${item._id === selectedId ? ' selected' : ''}`}
            onClick={() => setSelectedId(item._id)}
            onDoubleClick={() => selectInExplorer(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') selectInExplorer(item)
            }}
          >
            <TypeIcon type={item._type} size={14} />
            <span>{explorerLabel(item, false)}</span>
          </div>
        ))}
      </div>
      <div className="collection-buttons">
        <button
          className="icon-button"
          aria-label={`Add to ${row.label}`}
          title="Add"
          disabled={!row.featureKind}
          onClick={() =>
            run(() => {
              if (row.featureKind) setSelectedId(addFeature(engine, owner, row.featureKind)._id)
            })
          }
        >
          <UiIcon name="plus" />
        </button>
        <button
          className="icon-button"
          aria-label="Remove selected item"
          title="Remove"
          disabled={!selected}
          onClick={() => selected && run(() => deleteFromModel(engine, [selected]))}
        >
          <UiIcon name="minus" />
        </button>
        <button
          className="icon-button"
          aria-label="Move selected item up"
          title="Move Up"
          disabled={!selected || index <= 0}
          onClick={() => selected && run(() => reorderElement(engine, selected, index - 1))}
        >
          <UiIcon name="up" />
        </button>
        <button
          className="icon-button"
          aria-label="Move selected item down"
          title="Move Down"
          disabled={!selected || index < 0 || index >= items.length - 1}
          onClick={() => selected && run(() => reorderElement(engine, selected, index + 1))}
        >
          <UiIcon name="down" />
        </button>
      </div>
    </div>
  )
}

/**
 * Advanced Arrows panel body: the parent arrows of the active IDEF0 decomposition diagram (rows)
 * by its boxes (columns). Each checkbox applies at once (one undo step); a box with its own child
 * diagram asks before it loses the arrow. The matrix comes from `arrowMatrix`, so the panel and the
 * canvas stay in sync both ways.
 */
import type React from 'react'
import { arrowMatrix, assignParentArrow, getTextMeasurer, lossWarning, toggledBoxes, type ArrowRow } from '../../diagram'
import { ModelRuleError, type Diagram, type Elem } from '../../model'
import { projectStore, useProjectStore } from '../../store'
import { bridge } from '../app/bridge'
import { uiStore } from '../uiStore'

const ps = () => projectStore.getState()

const EMPTY = 'Open an IDEF0 child diagram (A0, A1…) to assign its parent arrows.'

function portViewOf(diagram: Diagram, port: Elem): string | null {
  return diagram.ownedViews.find((v) => v.model === port)?._id ?? null
}

/** Asks before boxes with their own child diagram lose an arrow; true = go ahead. */
async function confirmLoss(row: ArrowRow, box: string, warning: string): Promise<boolean> {
  const message = `Disconnect ${row.code || row.name} from ${box}?`
  const detail = `${warning}. You can undo this.`
  if (!bridge) return window.confirm(`${message}\n${detail}`)
  return (await bridge.showMessageBox({ type: 'warning', message, detail, buttons: ['Disconnect', 'Cancel'] })) === 0
}

async function toggle(diagram: Diagram, row: ArrowRow, box: Elem, boxNumber: string): Promise<void> {
  const next = toggledBoxes(diagram, row.port, box)
  const warning = lossWarning(row.port, next)
  if (warning && !(await confirmLoss(row, boxNumber, warning))) return
  try {
    assignParentArrow({ engine: ps().engine, diagram, measurer: getTextMeasurer() }, row.port, next)
  } catch (e) {
    if (e instanceof ModelRuleError) uiStore.getState().toast(e.message)
    else throw e
  }
}

export function AdvancedArrowsPanel(): React.JSX.Element {
  useProjectStore((s) => s.version)
  const repo = useProjectStore((s) => s.repository)
  const activeId = useProjectStore((s) => s.activeDiagramId)
  const selectedIds = useProjectStore((s) => s.selectedViewIds)
  const diagram = activeId ? (repo.get(activeId) as Diagram | undefined) : undefined
  return <AdvancedArrowsTable diagram={diagram ?? null} selectedIds={selectedIds} />
}

/** The panel content for `diagram` (the active diagram), `selectedIds` being the selected views. */
export function AdvancedArrowsTable({ diagram, selectedIds }: { diagram: Diagram | null; selectedIds: readonly string[] }): React.JSX.Element {
  const matrix = diagram ? arrowMatrix(diagram) : null
  if (!diagram || !matrix) {
    return (
      <div className="panel advanced-arrows">
        <div className="empty-note">{EMPTY}</div>
      </div>
    )
  }
  if (matrix.rows.length === 0) {
    return (
      <div className="panel advanced-arrows">
        <div className="empty-note">The box this diagram details has no arrows yet.</div>
      </div>
    )
  }
  const pending = matrix.rows.filter((r) => r.result === 'not assigned')
  return (
    <div className="panel advanced-arrows">
      <div className="advanced-arrows-scroll">
        <table className="advanced-arrows-table" aria-label="Parent arrows by box">
          <thead>
            <tr>
              <th scope="col" className="aa-arrow">
                Arrow
              </th>
              {matrix.boxes.map((b) => (
                <th key={b.box._id} scope="col" className="aa-box" data-tip={b.name || b.number}>
                  {b.number}
                </th>
              ))}
              <th scope="col" className="aa-result">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => {
              const viewId = portViewOf(diagram, row.port)
              const unassigned = row.result === 'not assigned'
              const classes = ['aa-row', `role-${row.role}`, unassigned ? 'pending' : '', viewId && selectedIds.includes(viewId) ? 'selected' : ''].filter(Boolean).join(' ')
              return (
                <tr key={row.port._id} className={classes}>
                  <th scope="row" className="aa-arrow">
                    <button className="aa-name" onClick={() => viewId && ps().select({ views: [viewId] })} data-tip="Select it on the diagram">
                      <span className="idef0-role-pill">
                        {row.code || '?'}
                      </span>
                      <span className={row.unnamed ? 'aa-label muted' : 'aa-label'}>{row.name}</span>
                    </button>
                  </th>
                  {matrix.boxes.map((b, i) => (
                    <td key={b.box._id} className="aa-cell" {...(row.readOnly ? { 'data-tip': row.readOnly } : {})}>
                      <input
                        type="checkbox"
                        aria-label={`${row.code} ${row.name} to ${b.number}`}
                        checked={row.checked[i] ?? false}
                        disabled={!!row.readOnly}
                        onChange={() => void toggle(diagram, row, b.box, b.number)}
                      />
                    </td>
                  ))}
                  <td className={unassigned ? 'aa-result warn' : 'aa-result'}>{row.result}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pending.length > 0 ? (
        <div className="aa-footer warn">
          {pending.length === 1 ? `${pending[0]?.code} not assigned: it waits on the frame edge` : `${pending.length} arrows not assigned: they wait on the frame edge`}
        </div>
      ) : null}
    </div>
  )
}

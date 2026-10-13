/**
 * IDEF0 function modeling notation: function boxes with derived node numbers, boundary ports with
 * ICOM codes, arrows attached to box sides by role (orthogonal routes, rounded bends, fork/join,
 * call arrows, tunnels), the sheet frame with its title block, model notes, decomposition and
 * navigation commands, and the consistency warnings W01-W18.
 *
 * Editor hooks used: `derivedPosition`-free node layouts, `moveAxis` (ports slide along the area
 * edge), `hitAreas` (only the title block bands of the frame hit), the `idef0.call` quick-edit
 * syntax, a per-diagram-type normalizer (auto-renumbering in the same undo step) and the IDEF0
 * gesture, reconnect and delete hooks of `editor/actions.ts`.
 */
import { registerEdgeNotation, registerNodeNotation } from '../render/registry'
import { arrowNotation } from './edges'
import { layoutFrame, layoutFunction, layoutModelNote, layoutPort } from './layout'
import { registerIdef0QuickEdit } from './quickEdit'
import { ArrowEdge, FrameNode, FunctionNode, NoteNode, PortNode } from './render'
import { registerIdef0Hooks } from './hooks'
import { openTargetOf } from './navigation'

export * from './geometry'
export * from './routing'
export * from './edges'
export * from './layout'
export * from './strings'
export * from './navigation'
export * from './validate'
export * from './decompose'
export * from './propagation'
export { registerIdef0QuickEdit } from './quickEdit'
export * from './commands'
export * from './gestures'
export * from './deletion'
export { normalizeIdef0, titleOf } from './hooks'

let registered = false

export function registerIdef0Notations(): void {
  if (registered) return
  registered = true
  registerIdef0QuickEdit()
  registerIdef0Hooks()
  registerNodeNotation('IDEF0FunctionView', { layout: layoutFunction, Render: FunctionNode, openTarget: openTargetOf })
  registerNodeNotation('IDEF0PortView', { layout: layoutPort, Render: PortNode })
  registerNodeNotation('IDEF0FrameView', { layout: layoutFrame, Render: FrameNode })
  registerNodeNotation('IDEF0NoteView', { layout: layoutModelNote, Render: NoteNode })
  registerEdgeNotation('IDEF0ArrowView', { ...arrowNotation, Render: ArrowEdge })
}

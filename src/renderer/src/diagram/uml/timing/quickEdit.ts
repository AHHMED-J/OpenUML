/** Quick-edit syntax of time and duration constraints: `min..max`, registered as `interval`. */
import { registerQuickEditSyntax } from '../../editor/quickEditApply'
import { registerSequenceQuickEdit } from '../sequence/quickEdit'
import { parseInterval } from './layout'

let registered = false

export function registerTimingQuickEdit(): void {
  if (registered) return
  registered = true
  // Lifelines and messages use the sequence syntaxes.
  registerSequenceQuickEdit()
  registerQuickEditSyntax('interval', {
    hint: 'min..max',
    parse: parseInterval,
    apply: (b, _repo, constraint, parsed) => {
      b.set(constraint, 'min', parsed.min)
      b.set(constraint, 'max', parsed.max)
    }
  })
}

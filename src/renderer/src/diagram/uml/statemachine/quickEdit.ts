/** Quick-edit syntax of transitions (spec 20 §6), registered as the custom syntax `transition`. */
import { registerQuickEditSyntax } from '../../editor/quickEditApply'
import { TRANSITION_EDIT_HINT, applyTransition, parseTransition } from './strings'

let registered = false

export function registerStateMachineQuickEdit(): void {
  if (registered) return
  registered = true
  registerQuickEditSyntax('transition', {
    hint: TRANSITION_EDIT_HINT,
    parse: parseTransition,
    apply: (b, _repo, transition, parsed) => applyTransition(b, transition, parsed)
  })
}

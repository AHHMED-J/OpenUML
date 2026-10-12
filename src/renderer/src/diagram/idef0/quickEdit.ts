/** Quick-edit syntax of call-arrow labels (spec 11 §3.6), registered as the custom syntax `idef0.call`. */
import { isIdef0Function, modelOf, type Elem } from '../../model'
import { registerQuickEditSyntax } from '../editor/quickEditApply'
import { CALL_EDIT_HINT, parseCall, resolveReference } from './strings'

let registered = false

export function registerIdef0QuickEdit(): void {
  if (registered) return
  registered = true
  registerQuickEditSyntax('idef0.call', {
    hint: CALL_EDIT_HINT,
    parse: parseCall,
    apply: (b, _repo, arrow, parsed) => {
      const caller = arrow['source'] as Elem | null
      const resolved = parsed.references.length === 1 ? resolveReference(modelOf(arrow), parsed.references[0] as string) : null
      if (isIdef0Function(caller)) b.set(caller, 'calledFunction', resolved)
      b.set(arrow, 'calledNode', resolved ? '' : parsed.text)
    }
  })
}

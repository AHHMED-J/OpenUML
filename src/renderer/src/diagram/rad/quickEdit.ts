/** Quick-edit syntaxes of the RAD notation: the role header and the element names. */
import { registerQuickEditSyntax } from '../editor/quickEditApply'
import { RAD_NAME_HINT, ROLE_TITLE_HINT, parseRadName, parseRoleTitle } from './strings'

let registered = false

export function registerRadQuickEdit(): void {
  if (registered) return
  registered = true
  registerQuickEditSyntax('radRoleTitle', {
    hint: ROLE_TITLE_HINT,
    parse: parseRoleTitle,
    apply: (b, _repo, role, parsed) => {
      b.set(role, 'name', parsed.name)
      if (parsed.agent !== null) b.set(role, 'agent', parsed.agent)
    }
  })
  // Names of RAD elements are free text: no stereotype or visibility syntax applies.
  registerQuickEditSyntax('radName', {
    hint: RAD_NAME_HINT,
    parse: parseRadName,
    apply: (b, _repo, el, text) => b.set(el, 'name', text)
  })
}

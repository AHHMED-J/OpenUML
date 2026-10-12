/** One-time registration of the built-in notations (generic annotations + UML families). */
import { registerIdef0Notations } from './idef0'
import { registerGenericNotations } from './render/generic'
import { registerRadNotations } from './rad'
import { registerUmlNotations } from './uml'

let registered = false

export function ensureNotations(): void {
  if (registered) return
  registered = true
  registerGenericNotations()
  registerUmlNotations()
  registerIdef0Notations()
  registerRadNotations()
}

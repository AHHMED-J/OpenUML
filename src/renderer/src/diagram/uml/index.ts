/**
 * UML notations. Each diagram family registers its view types here; add your family's
 * `register…Notations()` call to `registerUmlNotations` (see `diagram/index.ts` for the API).
 */
import { registerActivityNotations } from './activity'
import { registerClassNotations } from './class'
import { registerSequenceNotations } from './sequence'
import { registerUseCaseNotations } from './usecase'

export function registerUmlNotations(): void {
  registerClassNotations()
  registerUseCaseNotations()
  registerSequenceNotations()
  registerActivityNotations()
}

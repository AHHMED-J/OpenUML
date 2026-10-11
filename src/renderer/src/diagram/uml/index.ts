/**
 * UML notations. Each diagram family registers its view types here; add your family's
 * `register…Notations()` call to `registerUmlNotations` (see `diagram/index.ts` for the API).
 */
import { registerClassNotations } from './class'

export function registerUmlNotations(): void {
  registerClassNotations()
  // registerUseCaseNotations()   — diagram/uml/usecase
  // registerSequenceNotations()  — diagram/uml/sequence
  // registerActivityNotations()  — diagram/uml/activity
}

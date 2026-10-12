/**
 * UML notations. Each diagram family registers its view types here; add your family's
 * `register…Notations()` call to `registerUmlNotations` (see `diagram/index.ts` for the API).
 */
import { registerActivityNotations } from './activity'
import { registerClassNotations } from './class'
import { registerComponentNotations } from './component'
import { registerDeploymentNotations } from './deployment'
import { registerPackageNotations } from './package'
import { registerProfileNotations } from './profile'
import { registerCommunicationNotations } from './communication'
import { registerCompositeNotations } from './composite'
import { registerInfoflowNotations } from './infoflow'
import { registerObjectNotations } from './object'
import { registerOverviewNotations } from './overview'
import { registerSequenceNotations } from './sequence'
import { registerStateMachineNotations } from './statemachine'
import { registerTimingNotations } from './timing'
import { registerUseCaseNotations } from './usecase'

export function registerUmlNotations(): void {
  registerClassNotations()
  registerUseCaseNotations()
  registerSequenceNotations()
  registerActivityNotations()
  registerStateMachineNotations()
  registerTimingNotations()
  registerComponentNotations()
  registerDeploymentNotations()
  registerPackageNotations()
  registerProfileNotations()
  // Structural families extend views registered above (hosts of ports, packages holding instances): keep last.
  registerObjectNotations()
  registerCompositeNotations()
  registerCommunicationNotations()
  registerOverviewNotations()
  registerInfoflowNotations()
}

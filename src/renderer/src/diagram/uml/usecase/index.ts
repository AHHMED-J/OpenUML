/**
 * Use case diagram notation (spec 03 §4.3): actors, use cases (with extension point rows),
 * subjects (system boundaries; drop containers drawn behind their content) and the include /
 * extend relationships. Associations, generalizations and dependencies between actors and use
 * cases use the class-diagram edge notations.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../../render/registry'
import { USE_CASE_EDGE_NOTATIONS } from './edges'
import { layoutActor, layoutSubject, layoutUseCase } from './layout'
import { ActorNode, SubjectNode, UseCaseNode } from './render'

/**
 * Subjects visually contain classifiers (actors, use cases, ...) and notes. Per spec 02 §7.5, a
 * classifier placed in a subject belongs to the subject's owner (the subject's namespace), so a
 * drop re-parents its model there; dropping it out again leaves the model where it is.
 */
const subjectContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel === null || isKindOf(childModel, 'UMLClassifier')
  },
  ownerFor(container: View, childModel: Elem | null) {
    const subject = container.model
    const owner = subject?._parent
    if (!subject || !owner || !childModel || childModel === subject) return null
    return { owner, field: 'ownedElements' }
  }
}

export function registerUseCaseNotations(): void {
  registerNodeNotation('UMLActorView', { layout: layoutActor, Render: ActorNode })
  registerNodeNotation('UMLUseCaseView', { layout: layoutUseCase, Render: UseCaseNode })
  registerNodeNotation('UMLUseCaseSubjectView', { layout: layoutSubject, Render: SubjectNode, container: subjectContainer })
  for (const [type, notation] of USE_CASE_EDGE_NOTATIONS) registerEdgeNotation(type, notation)
}

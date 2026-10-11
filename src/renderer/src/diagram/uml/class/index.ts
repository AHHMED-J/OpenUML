/**
 * Class diagram notation: classifier boxes (class, interface, enumeration, data type, primitive
 * type, signal), packages/models (containers), and the class relationships.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../../render/registry'
import { CLASS_EDGE_NOTATIONS } from './edges'
import { layoutClassifier, layoutPackage } from './layout'
import { ClassifierNode, PackageNode } from './render'

export { layoutClassifier, layoutPackage } from './layout'
export type { ClassifierData, CompartmentLayout, PackageData } from './layout'
export * from './strings'
export { isLollipop } from './edges'

/** Packages visually contain classifiers, packages and notes; the models move into the package. */
export const packageContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel === null || isKindOf(childModel, 'UMLClassifier') || isKindOf(childModel, 'UMLPackage')
  },
  ownerFor(container: View, childModel: Elem | null) {
    const owner = container.model
    if (!owner || !childModel || owner === childModel) return null
    return { owner, field: 'ownedElements' }
  }
}

const CLASSIFIER_VIEWS = [
  'UMLClassView',
  'UMLInterfaceView',
  'UMLDataTypeView',
  'UMLPrimitiveTypeView',
  'UMLEnumerationView',
  'UMLSignalView'
]

export function registerClassNotations(): void {
  const classifier = { layout: layoutClassifier, Render: ClassifierNode }
  for (const type of CLASSIFIER_VIEWS) registerNodeNotation(type, classifier)
  const pkg = { layout: layoutPackage, Render: PackageNode, container: packageContainer }
  registerNodeNotation('UMLPackageView', pkg)
  registerNodeNotation('UMLModelView', pkg)
  for (const [type, notation] of CLASS_EDGE_NOTATIONS) registerEdgeNotation(type, notation)
  // Generic fallback for other classifier views (e.g. until a family registers its own).
  registerNodeNotation('UMLClassifierView', classifier)
}

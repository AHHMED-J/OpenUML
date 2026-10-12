/**
 * Object diagram notation (spec 23): object boxes with underlined `name: Type` and slots,
 * artifact / component / node instances, links and link-object links. Packages gain the
 * ability to contain instances.
 */
import { registerEdgeNotation, registerNodeNotation } from '../../render/registry'
import { extendContainer, instanceContainer } from './containers'
import { linkNotation, linkObjectLinkNotation } from './edges'
import { layoutInstance } from './layout'
import { registerObjectQuickEdit } from './quickEdit'
import { InstanceNode } from './render'

export * from './containers'
export * from './edges'
export * from './layout'
export { applyObject, applySlot } from './quickEdit'
export * from './strings'

export function registerObjectNotations(): void {
  registerObjectQuickEdit()
  for (const type of ['UMLObjectView', 'UMLArtifactInstanceView', 'UMLComponentInstanceView', 'UMLNodeInstanceView']) {
    registerNodeNotation(type, { layout: layoutInstance, Render: InstanceNode })
  }
  registerEdgeNotation('UMLLinkView', linkNotation)
  registerEdgeNotation('UMLLinkObjectLinkView', linkObjectLinkNotation)
  for (const type of ['UMLPackageView', 'UMLModelView']) extendContainer(type, instanceContainer)
}

/** Profile diagram notation (spec 29): stereotypes, metaclasses, profiles and the extension edge. */
import { relationshipNotation } from '../../core'
import { buildEdgeLayout } from '../../layout/edges'
import { standardEdgeLabels } from '../../render/generic'
import { registerEdgeNotation, registerNodeNotation, type EdgeNotation } from '../../render/registry'
import { layoutClassifier } from '../class'
import { ClassifierNode } from '../class/render'
import { layoutMetaClass } from './layout'
import { MetaClassNode } from './render'

export * from './layout'

/** Extension: solid line, flat tail, filled arrowhead at the metaclass. */
const extensionNotation: EdgeNotation = {
  connectKind: 'Extension',
  layout(edge, ctx) {
    const flat = relationshipNotation('generalization').tail
    return buildEdgeLayout(edge, ctx, {
      dash: 'solid',
      tailEnd: flat,
      headEnd: { style: 'solidArrow' },
      labels: standardEdgeLabels(edge)
    })
  }
}

export function registerProfileNotations(): void {
  // A stereotype is a class box whose «stereotype» keyword is always shown.
  registerNodeNotation('UMLStereotypeView', { layout: layoutClassifier, Render: ClassifierNode })
  registerNodeNotation('UMLMetaClassView', { layout: layoutMetaClass, Render: MetaClassNode })
  registerEdgeNotation('UMLExtensionView', extensionNotation)
}

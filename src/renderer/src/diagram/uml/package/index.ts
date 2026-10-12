/**
 * Package diagram notation (spec 24): package, model and subsystem views and the containment link.
 * Packages and dependencies are drawn by the class family; models get a triangle glyph and
 * subsystems a fork glyph in the tab. The containment edge uses the generic notation.
 */
import { registerNodeNotation } from '../../render/registry'
import { packageContainer } from '../class'
import { layoutPackageWithGlyph } from './layout'
import { GlyphPackageNode } from './render'

export * from './layout'

export function registerPackageNotations(): void {
  const container = packageContainer
  registerNodeNotation('UMLModelView', { layout: layoutPackageWithGlyph('model'), Render: GlyphPackageNode, container })
  registerNodeNotation('UMLSubsystemView', { layout: layoutPackageWithGlyph('subsystem'), Render: GlyphPackageNode, container })
  registerNodeNotation('UMLProfileView', { layout: layoutPackageWithGlyph('none'), Render: GlyphPackageNode, container })
}

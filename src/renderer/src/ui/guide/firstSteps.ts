/** The first-steps tips: add a diagram, place an element from the Toolbox, edit its properties. */
import type { Tip } from './tips'

export const FIRST_STEPS: readonly Tip[] = [
  {
    id: 'first-steps.add-diagram',
    text: 'Click here to add your first diagram.',
    target: '[data-guide="add-diagram"]',
    side: 'bottom',
    when: (ctx) => ctx.diagramCount === 0,
    done: (ctx) => ctx.diagramCount > 0
  },
  {
    id: 'first-steps.toolbox',
    text: 'Pick an element in the Toolbox, then click on the canvas to place it.',
    target: '[data-dock-panel="toolbox"]',
    side: 'left',
    when: (ctx) => ctx.activeDiagramId !== null && ctx.activeViewCount === 0,
    done: (ctx) => ctx.activeViewCount > 0
  },
  {
    id: 'first-steps.properties',
    text: 'Edit its properties here: name, visibility, attributes and more.',
    target: '[data-dock-panel="properties"]',
    side: 'left',
    when: (ctx) => ctx.selectionCount > 0
  }
]

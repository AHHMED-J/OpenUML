/** The Model > IDEF0 and Format > IDEF0 menus (spec 11 §4.3), visible while an IDEF0 diagram is active. */
import { Idef0CommandIds } from '../../diagram'
import { activeDiagram, projectStore } from '../../store'
import type { MenuNode } from './menuModel'

const SEP: MenuNode = { separator: true }

function idef0Active(): boolean {
  return activeDiagram(projectStore.getState())?._type === 'IDEF0Diagram'
}

export function idef0Menu(): MenuNode {
  const boundary = (role: string): MenuNode => ({ label: `${role[0]?.toUpperCase()}${role.slice(1)}`, command: Idef0CommandIds.addBoundary(role) })
  return {
    id: 'model.idef0',
    label: 'IDEF0',
    visible: idef0Active,
    submenu: [
      { id: 'idef0.decompose', label: 'Decompose...', command: Idef0CommandIds.decompose },
      { id: 'idef0.set-box-count', label: 'Set Number of Child Boxes...', command: Idef0CommandIds.setBoxCount },
      { id: 'idef0.go-parent', label: 'Go to Parent Diagram', command: Idef0CommandIds.goParent },
      { id: 'idef0.go-child', label: 'Go to Child Diagram', command: Idef0CommandIds.goChild },
      SEP,
      { id: 'idef0.renumber', label: 'Renumber Boxes', command: Idef0CommandIds.renumber },
      { id: 'idef0.sync-ports', label: 'Synchronize Boundary Arrows', command: Idef0CommandIds.syncPorts },
      {
        id: 'idef0.add-boundary',
        label: 'Add Boundary Arrow',
        submenu: ['input', 'control', 'output', 'mechanism'].map(boundary)
      },
      { id: 'idef0.tunnel-source', label: 'Tunnel Source End', command: Idef0CommandIds.tunnelEnd, args: { end: 'source' } },
      { id: 'idef0.tunnel-target', label: 'Tunnel Target End', command: Idef0CommandIds.tunnelEnd, args: { end: 'target' } },
      { id: 'idef0.reset-route', label: 'Reset Arrow Route', command: Idef0CommandIds.resetRoute },
      SEP,
      { id: 'idef0.validate', label: 'Validate IDEF0 Model', command: Idef0CommandIds.validate },
      { id: 'idef0.node-index', label: 'Show Node Index', command: Idef0CommandIds.nodeIndex }
    ]
  }
}

export function idef0FormatMenu(): MenuNode {
  return {
    id: 'format.idef0',
    label: 'IDEF0',
    visible: idef0Active,
    submenu: [
      { label: 'Status: Working', command: Idef0CommandIds.status('working'), checkbox: true },
      { label: 'Status: Draft', command: Idef0CommandIds.status('draft'), checkbox: true },
      { label: 'Status: Recommended', command: Idef0CommandIds.status('recommended'), checkbox: true },
      { label: 'Status: Publication', command: Idef0CommandIds.status('publication'), checkbox: true },
      SEP,
      { label: 'Color Arrows by Role', command: Idef0CommandIds.colorByRole, checkbox: true }
    ]
  }
}

/**
 * The worked IDEF0 example "Process Customer Order" (spec 11 §7): an A-0 context diagram and its
 * A0 decomposition (three boxes, forked control, boundary arrows with ICOM codes), built with
 * fixed IDs. Used as a test fixture and as a ready-made sample.
 */
import { instantiate } from './metamodel'
import type { Elem, Point, Project, View } from './types'
import { DEFAULT_FONT, fontWith } from './values'

function make<T extends Elem = Elem>(type: string, id: string, props: Record<string, unknown> = {}): T {
  const el = instantiate(type)
  el._id = id
  Object.assign(el, props)
  return el as T
}

function own(parent: Elem, field: string, child: Elem): void {
  child._parent = parent
  ;(parent[field] as Elem[]).push(child)
}

const pts = (text: string): Point[] => text.split(';').map((p) => ({ x: Number(p.split(':')[0]), y: Number(p.split(':')[1]) }))

function arrowView(diagram: Elem, id: string, model: Elem, tail: View, head: View, points: string): View {
  const view = make<View>('IDEF0ArrowView', id, { model, tail, head, points: pts(points) })
  const label = make<View>('EdgeLabelView', `${id}Lbl`, {
    parentStyle: false,
    font: fontWith(DEFAULT_FONT, { size: 12 }),
    height: 12,
    alpha: Math.PI / 2,
    distance: 12,
    hostEdge: view,
    edgePosition: 1
  })
  own(view, 'subViews', label)
  view['nameLabel'] = label
  own(diagram, 'ownedViews', view)
  return view
}

function portView(diagram: Elem, id: string, model: Elem, x: number, y: number): View {
  const view = make<View>('IDEF0PortView', id, { model, left: x - 4, top: y - 4, width: 8, height: 8 })
  own(diagram, 'ownedViews', view)
  return view
}

function boxView(diagram: Elem, id: string, model: Elem, left: number, top: number, width: number, height: number): View {
  const view = make<View>('IDEF0FunctionView', id, { model, left, top, width, height })
  own(diagram, 'ownedViews', view)
  return view
}

export interface OrderExample {
  readonly project: Project
  readonly model: Elem
  readonly top: Elem
  readonly a1: Elem
  readonly a2: Elem
  readonly a3: Elem
  readonly contextDiagram: Elem
  readonly childDiagram: Elem
}

export function buildOrderExample(): OrderExample {
  const project = make<Project>('Project', 'PrjOM0000000000000001', { name: 'Order Handling', author: 'A. Analyst', documentVersion: 1 })
  const model = make('IDEF0Model', 'OMmodel000000000000001', {
    name: 'Order Management',
    abbreviation: 'OM',
    purpose: 'Describe how a customer order becomes a shipped order so that handling delays can be located.',
    viewpoint: 'Order desk supervisor.'
  })
  own(project, 'ownedElements', model)
  const top = make('IDEF0Function', 'FnTop00000000000000001', { name: 'Process Customer Order' })
  own(model, 'ownedElements', top)
  model['topFunction'] = top
  const a1 = make('IDEF0Function', 'FnA1000000000000000001', { name: 'Receive Order', boxNumber: 1 })
  const a2 = make('IDEF0Function', 'FnA2000000000000000001', { name: 'Check Credit and Stock', boxNumber: 2 })
  const a3 = make('IDEF0Function', 'FnA3000000000000000001', { name: 'Ship and Invoice', boxNumber: 3 })
  for (const f of [a1, a2, a3]) own(top, 'functions', f)

  const childDiagram = make('IDEF0Diagram', 'DgA0000000000000000001', { name: 'Process Customer Order' })
  own(top, 'ownedElements', childDiagram)
  top['childDiagram'] = childDiagram
  const contextDiagram = make('IDEF0Diagram', 'DgA-0000000000000000001', { name: 'Process Customer Order', diagramKind: 'context', author: 'A. Analyst' })
  own(model, 'ownedElements', contextDiagram)

  // --- A-0: ports and arrows belong to the model.
  const cIn = make('IDEF0Port', 'PtA0In00000000000001', { role: 'input' })
  const cCtl = make('IDEF0Port', 'PtA0Ctl000000000001', { role: 'control' })
  const cOut = make('IDEF0Port', 'PtA0Out00000000000001', { role: 'output' })
  const cMech = make('IDEF0Port', 'PtA0Mech0000000001', { role: 'mechanism' })
  for (const p of [cIn, cCtl, cOut, cMech]) own(model, 'ports', p)
  const aIn = make('IDEF0Arrow', 'ArrA0In0000000000001', { name: 'Customer Order', role: 'input', source: cIn, target: top })
  const aCtl = make('IDEF0Arrow', 'ArrA0Ctl000000000001', { name: 'Sales Policy', role: 'control', source: cCtl, target: top })
  const aOut = make('IDEF0Arrow', 'ArrA0Out000000000001', { name: 'Shipped Order', role: 'output', source: top, target: cOut })
  const aMech = make('IDEF0Arrow', 'ArrA0Mech00000000001', { name: 'Order Staff', role: 'mechanism', source: cMech, target: top })
  for (const a of [aIn, aCtl, aOut, aMech]) own(model, 'arrows', a)

  own(contextDiagram, 'ownedViews', make('IDEF0FrameView', 'VwA0Frame0000000000001', { model: contextDiagram, left: 8, top: 8, width: 1008, height: 752 }))
  const topView = boxView(contextDiagram, 'VwA0Top0000000000001', top, 392, 290, 240, 120)
  const vIn = portView(contextDiagram, 'VwA0PIn0000000000001', cIn, 24, 350)
  const vCtl = portView(contextDiagram, 'VwA0PCtl000000000001', cCtl, 512, 64)
  const vOut = portView(contextDiagram, 'VwA0POut00000000001', cOut, 1000, 350)
  const vMech = portView(contextDiagram, 'VwA0PMech0000000001', cMech, 512, 696)
  arrowView(contextDiagram, 'VwA0AIn000000000001', aIn, vIn, topView, '24:350;391:350')
  arrowView(contextDiagram, 'VwA0ACtl00000000001', aCtl, vCtl, topView, '512:64;512:289')
  arrowView(contextDiagram, 'VwA0AOut00000000001', aOut, topView, vOut, '633:350;1000:350')
  arrowView(contextDiagram, 'VwA0AMech0000000001', aMech, vMech, topView, '512:696;512:411')

  // --- A0: ports and arrows belong to the top function.
  const pI1 = make('IDEF0Port', 'PtI1000000000000000001', { role: 'input', corresponds: aIn })
  const pC1 = make('IDEF0Port', 'PtC1000000000000000001', { role: 'control', corresponds: aCtl })
  const pO1 = make('IDEF0Port', 'PtO1000000000000000001', { role: 'output', corresponds: aOut })
  const pM1 = make('IDEF0Port', 'PtM1000000000000000001', { role: 'mechanism', corresponds: aMech })
  for (const p of [pI1, pC1, pO1, pM1]) own(top, 'ports', p)
  const arrIn = make('IDEF0Arrow', 'ArrIn1000000000000000001', { name: 'Customer Order', role: 'input', source: pI1, target: a1 })
  const arrCtl1 = make('IDEF0Arrow', 'ArrCtl100000000000000001', { name: 'Sales Policy', role: 'control', source: pC1, target: a1 })
  const arrCtl2 = make('IDEF0Arrow', 'ArrCtl200000000000000001', { role: 'control', source: arrCtl1, target: a2 })
  const arrCtl3 = make('IDEF0Arrow', 'ArrCtl300000000000000001', { role: 'control', source: arrCtl2, target: a3 })
  const arrV12 = make('IDEF0Arrow', 'ArrV12000000000000000001', { name: 'Validated Order', role: 'input', source: a1, target: a2 })
  const arrV23 = make('IDEF0Arrow', 'ArrV23000000000000000001', { name: 'Approved Order', role: 'input', source: a2, target: a3 })
  const arrOut = make('IDEF0Arrow', 'ArrOut1000000000000000001', { name: 'Shipped Order', role: 'output', source: a3, target: pO1 })
  const arrMech = make('IDEF0Arrow', 'ArrMech10000000000000001', { name: 'Order Staff', role: 'mechanism', source: pM1, target: a1 })
  for (const a of [arrIn, arrCtl1, arrCtl2, arrCtl3, arrV12, arrV23, arrOut, arrMech]) own(top, 'arrows', a)

  own(childDiagram, 'ownedViews', make('IDEF0FrameView', 'VwA0cFrame000000000001', { model: childDiagram, left: 8, top: 8, width: 1008, height: 752 }))
  const v1 = boxView(childDiagram, 'VwA1000000000000000001', a1, 120, 110, 168, 88)
  const v2 = boxView(childDiagram, 'VwA2000000000000000001', a2, 400, 260, 168, 88)
  const v3 = boxView(childDiagram, 'VwA3000000000000000001', a3, 680, 410, 168, 88)
  const vI1 = portView(childDiagram, 'VwPtI1000000000000001', pI1, 24, 154)
  const vC1 = portView(childDiagram, 'VwPtC1000000000000001', pC1, 204, 64)
  const vO1 = portView(childDiagram, 'VwPtO1000000000000001', pO1, 1000, 454)
  const vM1 = portView(childDiagram, 'VwPtM1000000000000001', pM1, 204, 696)
  arrowView(childDiagram, 'VwArrIn100000000000001', arrIn, vI1, v1, '24:154;119:154')
  const trunk = arrowView(childDiagram, 'VwArrCtl10000000000001', arrCtl1, vC1, v1, '204:64;204:109')
  const branch1 = arrowView(childDiagram, 'VwArrCtl20000000000001', arrCtl2, trunk, v2, '204:80;484:80;484:259')
  arrowView(childDiagram, 'VwArrCtl30000000000001', arrCtl3, branch1, v3, '484:80;764:80;764:409')
  arrowView(childDiagram, 'VwArrV1200000000000001', arrV12, v1, v2, '289:154;344:154;344:304;399:304')
  arrowView(childDiagram, 'VwArrV2300000000000001', arrV23, v2, v3, '569:304;624:304;624:454;679:454')
  arrowView(childDiagram, 'VwArrOut10000000000001', arrOut, v3, vO1, '849:454;1000:454')
  arrowView(childDiagram, 'VwArrMech1000000000001', arrMech, vM1, v1, '204:696;204:199')

  return { project, model, top, a1, a2, a3, contextDiagram, childDiagram }
}

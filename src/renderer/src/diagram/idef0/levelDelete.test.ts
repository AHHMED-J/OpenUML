import { describe, expect, it } from 'vitest'
import { validateModel, writeMdj } from '../../format'
import type { Diagram, Elem, View } from '../../model'
import { deleteViews } from '../editor/actions'
import { decomposeFunction } from './decompose'
import { deleteIdef0Elements } from './deletion'
import { arrowView, exampleKit, measurer } from './testkit'

const named = (scope: Elem, name: string): Elem | undefined => (scope['arrows'] as Elem[]).find((a) => a['name'] === name)
const portFor = (fn: Elem, arrow: Elem): Elem | undefined => (fn['ports'] as Elem[]).find((p) => p['corresponds'] === arrow)

describe('deleting linked boundary arrows across levels', () => {
  it('removes a pass-through parent counterpart with the child boundary arrow, in one undo step', () => {
    const k = exampleKit()
    const before = writeMdj(k.repository.project as Elem)
    const depth = k.engine.undoDepth
    const aIn = named(k.model, 'Customer Order') as Elem
    deleteViews(k.envOf(k.child), [arrowView(k.child, 'Customer Order')._id])
    expect(named(k.top, 'Customer Order')).toBeUndefined()
    // The A0 port and the A-0 arrow it stood for (with its port and views) are gone.
    expect((k.top['ports'] as Elem[]).map((p) => p['role'])).toEqual(['control', 'output', 'mechanism'])
    expect(k.repository.get(aIn._id)).toBeUndefined()
    expect((k.model['ports'] as Elem[]).map((p) => p['role'])).toEqual(['control', 'output', 'mechanism'])
    expect(k.context.ownedViews.some((v) => (v as View).model === aIn)).toBe(false)
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    expect(k.engine.undoDepth).toBe(depth + 1)
    k.engine.undo()
    expect(writeMdj(k.repository.project as Elem)).toBe(before)
  })

  it('keeps the counterpart while the port still carries other arrows', () => {
    const k = exampleKit()
    const aCtl = named(k.model, 'Sales Policy') as Elem
    // Deleting the control trunk promotes its branch onto the port: the flow still enters A0.
    deleteViews(k.envOf(k.child), [arrowView(k.child, 'Sales Policy')._id])
    expect(k.repository.get(aCtl._id)).toBeDefined()
    expect(portFor(k.top, aCtl)).toBeDefined()
  })

  it('keeps a counterpart that connects two boxes of the parent level and only drops the link', () => {
    const k = exampleKit()
    const a2 = k.example.a2
    const child = decomposeFunction(k.engine, a2, 3)
    const validated = named(k.top, 'Validated Order') as Elem
    const port = portFor(a2, validated) as Elem
    const boundary = (a2['arrows'] as Elem[]).find((a) => a['source'] === port) as Elem
    const view = child.ownedViews.find((v) => (v as View).model === boundary) as View
    deleteViews(k.envOf(child as Diagram), [view._id])
    expect(k.repository.get(validated._id)).toBeDefined()
    expect(k.repository.get(port._id)).toBeDefined()
  })

  it('deletes the child boundary arrows of a deleted parent arrow, and its pass-through counterpart above', () => {
    const k = exampleKit()
    const a1 = k.example.a1
    decomposeFunction(k.engine, a1, 3)
    const before = writeMdj(k.repository.project as Elem)
    const arrIn = named(k.top, 'Customer Order') as Elem
    const childPort = portFor(a1, arrIn) as Elem
    const childArrow = named(a1, 'Customer Order') as Elem
    expect(childArrow['source']).toBe(childPort)
    deleteViews(k.envOf(k.child), [arrowView(k.child, 'Customer Order')._id])
    expect(k.repository.get(childPort._id)).toBeUndefined()
    expect(k.repository.get(childArrow._id)).toBeUndefined()
    expect(named(k.model, 'Customer Order')).toBeUndefined()
    // The other flows of A1 are untouched.
    expect(named(a1, 'Sales Policy')).toBeDefined()
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    k.engine.undo()
    expect(writeMdj(k.repository.project as Elem)).toBe(before)
  })

  it('applies the same rules when arrows are deleted from the Model Explorer', () => {
    const k = exampleKit()
    const depth = k.engine.undoDepth
    const arrow = named(k.top, 'Customer Order') as Elem
    const other = k.example.a3
    const rest = deleteIdef0Elements(k.engine, [arrow, other], measurer)
    expect(rest).toEqual([other])
    expect(named(k.model, 'Customer Order')).toBeUndefined()
    expect(k.engine.undoDepth).toBe(depth + 1)
  })
})

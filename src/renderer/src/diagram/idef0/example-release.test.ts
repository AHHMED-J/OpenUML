import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readMdj, validateModel, writeMdj } from '../../format'
import { icomCodes, isKindOf, roleOf, type Elem } from '../../model'
import { buildReleaseExample } from './example-release'
import { validateIdef0 } from './validate'

const FILE = 'software-release-idef0.mdj'
const repoFile = new URL(`../../../../../examples/${FILE}`, import.meta.url)

const named = (list: Elem[], name: string): Elem => list.find((a) => a['name'] === name) as Elem
const arrowsOf = (scope: Elem): Elem[] => scope['arrows'] as Elem[]
const funcs = (scope: Elem): Elem[] => ((scope['functions'] as Elem[] | undefined) ?? [scope['topFunction'] as Elem]).slice().sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))

/** Content signature without IDs: boxes, arrows with their roles and ends, per scope. */
function signature(model: Elem): string[] {
  const out: string[] = []
  const end = (e: Elem | null): string => (!e ? '-' : isKindOf(e, 'IDEF0Port') ? 'port' : isKindOf(e, 'IDEF0Arrow') ? `arrow:${e['name'] || '(branch)'}` : `box:${e['boxNumber']}`)
  const visit = (scope: Elem, label: string): void => {
    for (const a of arrowsOf(scope)) out.push(`${label} ${roleOf(a)} "${a['name']}" ${end(a['source'] as Elem | null)}>${end(a['target'] as Elem | null)}${a['tunnelTarget'] ? ' tunnel' : ''}`)
    for (const f of funcs(scope)) {
      out.push(`${label} box ${f['boxNumber']} ${f['name']}`)
      visit(f, `${label}/${f['boxNumber']}`)
    }
  }
  visit(model, 'A-0')
  return out
}

describe('Software Release example', () => {
  const ex = buildReleaseExample()

  it('has the A-0, an A0 with exactly six boxes and a two-box diagram below A3', () => {
    expect(ex.model['name']).toBe('Software Release')
    expect(ex.contextDiagram['diagramKind']).toBe('context')
    expect(funcs(ex.model['topFunction'] as Elem).map((f) => `A${f['boxNumber']} ${f['name']}`)).toEqual([
      'A1 Triage Change Request',
      'A2 Plan Release',
      'A3 Build and Test Change',
      'A4 Approve Release',
      'A5 Deploy to Production',
      'A6 Monitor and Review Release'
    ])
    const a3 = ex.boxes[2] as Elem
    expect(funcs(a3).map((f) => `A3${f['boxNumber']} ${f['name']}`)).toEqual(['A31 Assemble Build', 'A32 Run Test Suites'])
    expect(ex.a3).toBe(a3['childDiagram'])
    expect(ex.boxes.filter((b) => b['childDiagram'])).toEqual([a3])
    expect(ex.model['purpose']).not.toBe('')
    expect(ex.model['viewpoint']).not.toBe('')
    expect(ex.a0['author']).toBe('OpenUML example')
  })

  it('shows the notation: all four ICOM sides, fork, join, feedback, call and tunnel', () => {
    const top = ex.model['topFunction'] as Elem
    const arrows = arrowsOf(top)
    for (const box of funcs(top)) {
      const roles = new Set(arrows.filter((a) => a['target'] === box).map((a) => roleOf(a)))
      expect(roles.has('control'), `${box['name']} has a control`).toBe(true)
    }
    const sides = (box: Elem): string[] => [...new Set(arrows.filter((a) => a['target'] === box || a['source'] === box).map((a) => (a['source'] === box ? 'output' : roleOf(a))))].sort()
    expect(sides(ex.boxes[2] as Elem)).toEqual(['control', 'input', 'mechanism', 'output'])
    // Fork: a branch whose source is another arrow; join: an arrow whose target is another arrow.
    expect(arrows.some((a) => isKindOf(a['source'] as Elem, 'IDEF0Arrow'))).toBe(true)
    expect(arrows.some((a) => isKindOf(a['target'] as Elem, 'IDEF0Arrow'))).toBe(true)
    expect(named(arrows, 'Release Schedule')['target']).toBe(named(arrows, 'Sign-off'))
    // Feedback: later box back to an earlier one.
    const index = (e: Elem): number => ex.boxes.indexOf(e)
    const feedback = arrows.filter((a) => ex.boxes.includes(a['source'] as Elem) && ex.boxes.includes(a['target'] as Elem) && index(a['target'] as Elem) < index(a['source'] as Elem))
    expect(feedback.map((a) => a['name']).sort()).toEqual(['Lessons Learned', 'Rework Request'])
    expect(roleOf(named(arrows, 'Lessons Learned'))).toBe('control')
    // Call and tunnel.
    const call = arrows.find((a) => roleOf(a) === 'call') as Elem
    expect(call['source']).toBe(ex.boxes[4])
    expect((ex.boxes[4] as Elem)['calledFunction']).toBe(funcs(ex.boxes[2] as Elem)[1])
    expect(named(arrows, 'Build Farm')['tunnelTarget']).toBe(true)
    expect(arrowsOf(ex.boxes[2] as Elem).some((a) => a['name'] === 'Build Farm')).toBe(false)
  })

  it('propagates boundary arrows with ICOM codes on A0 and on the two-box diagram', () => {
    const a0Codes = [...icomCodes(ex.a0).values()].sort()
    expect(a0Codes).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'I1', 'M1', 'M2', 'M3', 'M4', 'O1', 'O2'].sort())
    const childCodes = [...icomCodes(ex.a3).values()].sort()
    expect(childCodes).toEqual(['C1', 'I1', 'I2', 'M1', 'O1'])
    // The tunneled Build Farm arrow has no boundary arrow below A3.
    expect(((ex.boxes[2] as Elem)['ports'] as Elem[]).length).toBe(5)
  })

  it('is valid and only warns that the two-box diagram has fewer than three boxes', () => {
    expect(validateModel(ex.project)).toEqual([])
    expect(validateIdef0(ex.model).map((i) => `${i.id} ${i.message}`)).toEqual(['W01 Diagram "Build and Test Change" has 2 boxes (3 to 6 expected)'])
  })

  it('matches the committed file and round trips byte for byte', () => {
    if (process.env['UPDATE_EXAMPLES']) {
      mkdirSync(new URL('../../../../../examples/', import.meta.url), { recursive: true })
      writeFileSync(repoFile, writeMdj(ex.project))
    }
    expect(existsSync(repoFile)).toBe(true)
    const text = readFileSync(repoFile, 'utf8')
    const loaded = readMdj(text)
    expect(loaded.warnings).toEqual([])
    expect(validateModel(loaded.project)).toEqual([])
    expect(writeMdj(loaded.project)).toBe(text)
    const model = loaded.project['ownedElements'] as Elem[]
    expect(signature(model.find((e) => e._type === 'IDEF0Model') as Elem)).toEqual(signature(ex.model))
    expect(text).not.toMatch(/\/Users\/|@/)
  })
})

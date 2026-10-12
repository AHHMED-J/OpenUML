/** `.mdj` round trip, palettes and Add menu of the component / deployment / package / profile families. */
import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, ModelEngine } from '../../commands'
import { readMdj, writeMdj } from '../../format'
import { createDefaultProject, isKindOf, Repository, walk, type Diagram, type EdgeKind, type Elem, type NodeKind, type View } from '../../model'
import { addDiagram, addDiagramItemsFor, addItemsFor, addModelElement } from '../../ui/modelActions'
import { palettesFor } from '../../ui/toolbox/palettes'
import { FixedWidthTextMeasurer } from '../core'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { ensureNotations } from '../notations'

function build(): { project: Elem; repo: Repository; engine: ModelEngine } {
  ensureNotations()
  const repo = new Repository(createDefaultProject())
  return { project: repo.project as Elem, repo, engine: new ModelEngine(repo) }
}

describe('round trip', () => {
  it('writes and re-reads every new type without loss', () => {
    const { project, repo, engine } = build()
    const used = new Set<string>()
    const populate = (diagram: Diagram, nodes: NodeKind[], edges: Array<[EdgeKind, number, number]>): void => {
      const views = nodes.map((kind, i) => createNode(engine, { kind, diagram, left: 20 + i * 200, top: 30 }).view as View)
      for (const [kind, a, b] of edges) createEdge(engine, { kind, diagram, tail: views[a] as View, head: views[b] as View })
    }
    const comp = createDiagram(engine, 'ComponentDiagram', project).diagram
    populate(comp, ['Class', 'Component', 'Artifact', 'Interface'], [['ComponentRealization', 0, 1], ['Dependency', 1, 3]])
    const dep = createDiagram(engine, 'DeploymentDiagram', project).diagram
    populate(dep, ['Node', 'Node', 'Artifact', 'Component'], [['CommunicationPath', 0, 1], ['Deployment', 2, 0], ['Deployment', 3, 1]])
    const pkg = createDiagram(engine, 'PackageDiagram', project).diagram
    populate(pkg, ['Package', 'Model', 'Subsystem', 'Class'], [['Containment', 3, 0], ['Dependency', 0, 1]])
    const prof = createDiagram(engine, 'ProfileDiagram', project).diagram
    populate(prof, ['Stereotype', 'MetaClass', 'Stereotype', 'Enumeration'], [['Extension', 0, 1], ['Generalization', 2, 0]])

    const text = writeMdj(project)
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(writeMdj(back.project)).toBe(text)
    for (const el of walk(back.project)) used.add(el._type)
    for (const type of [
      'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLPackageDiagram', 'UMLProfileDiagram',
      'UMLComponent', 'UMLArtifact', 'UMLNode', 'UMLSubsystem', 'UMLProfile', 'UMLStereotype', 'UMLMetaClass',
      'UMLComponentRealization', 'UMLDeployment', 'UMLCommunicationPath', 'UMLExtension',
      'UMLComponentView', 'UMLArtifactView', 'UMLNodeView', 'UMLSubsystemView', 'UMLModelView', 'UMLStereotypeView', 'UMLMetaClassView',
      'UMLComponentRealizationView', 'UMLDeploymentView', 'UMLCommunicationPathView', 'UMLContainmentView', 'UMLExtensionView'
    ]) expect(used, type).toContain(type)

    // The re-read project lays out cleanly in every diagram.
    const measurer = new FixedWidthTextMeasurer()
    for (const el of walk(back.project)) {
      if (!isKindOf(el, 'Diagram') || el._type === 'UMLClassDiagram') continue
      const layout = computeDiagramLayout(el as Diagram, back.repository, measurer)
      expect(layout.nodes.size, el._type).toBeGreaterThan(0)
      expect(layout.edges.size, el._type).toBeGreaterThan(0)
    }
    void repo
  })

  it('keeps a stereotype with tag definitions, an icon image and a generalization', () => {
    const text = JSON.stringify({
      _type: 'Project', _id: 'p', name: 'P', documentVersion: 1,
      ownedElements: [{
        _type: 'UMLProfile', _id: 'prof', _parent: { $ref: 'p' }, name: 'Prof',
        ownedElements: [
          { _type: 'UMLMetaClass', _id: 'mc', _parent: { $ref: 'prof' }, name: 'UMLComponent' },
          {
            _type: 'UMLStereotype', _id: 'st', _parent: { $ref: 'prof' }, name: 'Service',
            attributes: [{ _type: 'UMLAttribute', _id: 'a1', _parent: { $ref: 'st' }, name: 'port', type: 'Integer' }],
            icon: { _type: 'UMLImage', _id: 'img', _parent: { $ref: 'st' }, width: 40, height: 40, content: '<svg/>' }
          },
          { _type: 'UMLExtension', _id: 'ex', _parent: { $ref: 'st' }, source: { $ref: 'st' }, target: { $ref: 'mc' } }
        ]
      }]
    })
    const { project, warnings, repository } = readMdj(text)
    expect(warnings).toEqual([])
    const st = repository.get('st') as Elem
    expect((st['icon'] as Elem)['content']).toBe('<svg/>')
    expect(readMdj(writeMdj(project)).warnings).toEqual([])
    expect(JSON.parse(writeMdj(project)).ownedElements[0].ownedElements[1].icon.content).toBe('<svg/>')
  })
})

describe('palettes and Add menus', () => {
  const ids = (type: string): string[] => palettesFor(type).flatMap((g) => g.items.map((i) => i.kind as string))

  it('shows the right tools per diagram type', () => {
    expect(ids('UMLComponentDiagram')).toEqual(expect.arrayContaining(['Component', 'Artifact', 'Interface', 'ComponentRealization', 'Node', 'Deployment', 'CommunicationPath', 'Note']))
    expect(ids('UMLDeploymentDiagram')).toEqual(expect.arrayContaining(['Node', 'Deployment', 'CommunicationPath', 'Artifact', 'Component']))
    expect(ids('UMLPackageDiagram')).toEqual(expect.arrayContaining(['Package', 'Model', 'Subsystem', 'Containment', 'Dependency']))
    expect(ids('UMLProfileDiagram')).toEqual(expect.arrayContaining(['MetaClass', 'Stereotype', 'Enumeration', 'Extension', 'Generalization']))
    expect(ids('UMLProfileDiagram')).not.toContain('Component')
    expect(palettesFor('UMLPackageDiagram').find((g) => g.id === 'packages')?.autoExpand).toContain('UMLPackageDiagram')
    expect(ids('UMLClassDiagram')).toContain('Containment')
  })

  it('offers the new diagrams on projects and packages, and creates wrapped elements', () => {
    const { project, engine } = build()
    const kinds = addDiagramItemsFor(project).map((i) => i.kind)
    for (const k of ['ComponentDiagram', 'DeploymentDiagram', 'PackageDiagram', 'ProfileDiagram']) expect(kinds).toContain(k)
    const model = (project['ownedElements'] as Elem[])[0] as Elem
    const d = addDiagram(engine, model, 'ProfileDiagram')
    expect(d._type).toBe('UMLProfileDiagram')
    expect(d._parent?._type).toBe('UMLProfile')
    const items = addItemsFor(model).map((i) => i.id)
    for (const id of ['component', 'artifact', 'node', 'subsystem', 'profile']) expect(items).toContain(id)
    expect(items).not.toContain('stereotype')
    const profile = d._parent as Elem
    expect(addItemsFor(profile).map((i) => i.id)).toEqual(expect.arrayContaining(['stereotype', 'metaclass']))
    const node = addModelElement(engine, model, addItemsFor(model).find((i) => i.id === 'node')!)
    expect(node._type).toBe('UMLNode')
    expect(node['name']).toBe('Node1')
  })
})

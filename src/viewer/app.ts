/**
 * The website viewer: model tree (left), diagram (center), breadcrumb and walk buttons (top), and
 * under an IDEF0 diagram the ICOM list of the focused box (or of the sheet). Clicking an IDEF0 box
 * with a child diagram zooms into it; the breadcrumb or Backspace zooms back out. ← / → (and the
 * ◀ ▶ buttons) walk the model step by step: each diagram, and on IDEF0 diagrams each box,
 * entering decomposed boxes. The shown diagram is in the address (`page.html#<diagram id>`), so
 * links and the browser's Back work. Model text is only ever set as text, never parsed as HTML.
 */
import type { DiagramDigest, IcomEntry, TreeEntry, WebsiteDigest } from '../shared/website'
import { MAX_SCALE } from './camera'
import { ViewerEngine } from './engine'

/** Durations of the drill-down transitions (ms). */
const ZOOM_IN_MS = 380
const ZOOM_OUT_MS = 420

type Transition = 'cut' | 'in' | 'out'

const ROLE_HEADINGS: ReadonlyArray<[IcomEntry['role'], string]> = [
  ['input', 'Inputs'],
  ['control', 'Controls'],
  ['output', 'Outputs'],
  ['mechanism', 'Mechanisms'],
  ['call', 'Calls']
]

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string; title?: string } = {}, ...children: Node[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props.className) el.className = props.className
  if (props.text !== undefined) el.textContent = props.text
  if (props.title !== undefined) el.title = props.title
  el.append(...children)
  return el
}

export class ViewerApp {
  private readonly engine: ViewerEngine
  private readonly crumbs: HTMLElement
  private readonly treeRows = new Map<string, HTMLElement[]>()
  private readonly expanded = new Set<string>()
  private readonly treeRoot: HTMLElement
  private readonly walkLabel: HTMLElement
  private readonly prevButton: HTMLButtonElement
  private readonly nextButton: HTMLButtonElement
  private readonly icomPanel: HTMLElement
  private currentId: string | null = null
  private navigating = false
  /** Position in `data.steps` (-1 when the shown diagram is not part of the walk). */
  private stepIndex = -1
  /** The IDEF0 box whose arrows are listed and lit (null: the whole sheet). */
  private focusedBox: string | null = null

  constructor(
    readonly root: HTMLElement,
    readonly data: WebsiteDigest
  ) {
    document.title = data.title
    this.crumbs = h('nav', { className: 'ouv-crumbs' })
    this.crumbs.setAttribute('aria-label', 'Diagram path')
    const present = h('button', { text: '▶ Present', title: 'Presentation mode (coming in a later version)' })
    present.hidden = true
    this.prevButton = this.button('◀', 'Previous step (←)', () => void this.walk(-1))
    this.nextButton = this.button('▶', 'Next step (→)', () => void this.walk(1))
    this.walkLabel = h('span', { className: 'ouv-walk-label' })
    const walk = h('div', { className: 'ouv-walk' }, this.prevButton, this.walkLabel, this.nextButton)
    walk.hidden = data.steps.length < 2
    const top = h('header', { className: 'ouv-top' }, h('span', { className: 'ouv-title', text: data.title, title: data.title }), this.crumbs, walk, present)
    this.treeRoot = h('aside', { className: 'ouv-tree' })
    this.treeRoot.setAttribute('aria-label', 'Model')
    const stage = h('div')
    const zoom = h(
      'div',
      { className: 'ouv-zoom' },
      this.button('−', 'Zoom out (-)', () => void this.engine.zoomBy(1 / 1.25)),
      this.button('Fit', 'Show the whole diagram (0)', () => this.fitAll(true)),
      this.button('+', 'Zoom in (+)', () => void this.engine.zoomBy(1.25))
    )
    this.icomPanel = h('section', { className: 'ouv-icom' })
    this.icomPanel.setAttribute('aria-label', 'Arrows')
    const main = h('main', { className: 'ouv-main' }, h('div', { className: 'ouv-canvas' }, stage, zoom), this.icomPanel)
    const foot = h('footer', { className: 'ouv-foot', text: `Made with ${data.generator}. Works offline; nothing is sent anywhere.` })
    root.replaceChildren(h('div', { className: 'ouv' }, top, this.treeRoot, main, foot))

    this.engine = new ViewerEngine(stage)
    this.engine.onViewClick = (viewId) => this.onViewClick(viewId)
    for (const entry of data.tree) this.expandTo(entry, 2)
    this.renderTree()
    window.addEventListener('hashchange', () => this.followHash())
    window.addEventListener('keydown', (e) => this.onKey(e))
    this.followHash(true)
  }

  private button(text: string, title: string, run: () => void): HTMLButtonElement {
    const b = h('button', { text, title })
    b.type = 'button'
    b.addEventListener('click', run)
    return b
  }

  // ------------------------------------------------------------------------------------------
  // Navigation

  private diagram(id: string | null | undefined): DiagramDigest | null {
    return id ? (this.data.diagrams[id] ?? null) : null
  }

  /** The diagram and its IDEF0 ancestors, top first. */
  private chain(id: string): DiagramDigest[] {
    const out: DiagramDigest[] = []
    const seen = new Set<string>()
    for (let d = this.diagram(id); d && !seen.has(d.id); d = this.diagram(d.parent?.diagram)) {
      seen.add(d.id)
      out.unshift(d)
    }
    return out
  }

  private followHash(initial = false): void {
    if (this.navigating) return
    const wanted = decodeURIComponent(location.hash.slice(1))
    const id = this.diagram(wanted) ? wanted : this.data.start
    if (id === this.currentId) return
    void this.show(id, initial ? 'cut' : this.transitionTo(id))
  }

  /** Zoom out when going up the IDEF0 tree, in when going down, else a plain change. */
  private transitionTo(id: string): Transition {
    if (!this.currentId) return 'cut'
    if (this.chain(this.currentId).some((d) => d.id === id)) return 'out'
    if (this.chain(id).some((d) => d.id === this.currentId)) return 'in'
    return 'cut'
  }

  /** Shows diagram `id`. `via`: the box view clicked to drill into it (zoom-in start point). */
  async show(id: string, transition: Transition = 'cut', via: string | null = null): Promise<void> {
    const next = this.diagram(id)
    if (!next || this.navigating) return
    this.navigating = true
    try {
      const previous = this.currentId
      if (transition === 'in' && via) {
        const box = this.engine.boundsOf([via])
        if (box) await this.engine.fit(box, ZOOM_IN_MS, 8, MAX_SCALE)
      }
      const svg = this.engine.mount(next.svg)
      this.currentId = id
      for (const [viewId, child] of Object.entries(next.drill)) {
        const g = this.engine.view(viewId)
        if (!g || !child) continue
        g.classList.add('ouv-drill')
        g.setAttribute('role', 'link')
        g.setAttribute('aria-label', `Open ${this.diagram(child)?.label ?? 'child diagram'}`)
      }
      // Going up: start zoomed into the box we came from, then pull back to the whole diagram.
      const from = transition === 'out' && previous ? this.boxLeadingTo(next, previous) : null
      const fromBounds = from ? this.engine.boundsOf([from]) : null
      if (fromBounds) {
        await this.engine.fit(fromBounds, 0, 8, MAX_SCALE)
        await this.engine.fit(next.bounds, ZOOM_OUT_MS)
      } else {
        this.fitAll(false)
        if (transition !== 'cut') {
          svg.classList.add('ouv-enter')
        }
      }
      if (decodeURIComponent(location.hash.slice(1)) !== id) location.hash = encodeURIComponent(id)
      this.renderCrumbs()
      this.markCurrent()
      this.focusedBox = null
      this.syncStep(id, null)
      this.renderIcom()
    } finally {
      this.navigating = false
    }
  }

  /** In `ancestor`, the box whose decomposition (at some depth) is diagram `descendant`. */
  private boxLeadingTo(ancestor: DiagramDigest, descendant: string): string | null {
    const chain = this.chain(descendant)
    const index = chain.findIndex((d) => d.id === ancestor.id)
    const below = chain[index + 1]
    return index >= 0 && below?.parent ? below.parent.view : null
  }

  private fitAll(animate: boolean): void {
    const d = this.diagram(this.currentId)
    if (d) void this.engine.fit(d.bounds, animate ? 240 : 0)
  }

  private onViewClick(viewId: string | null): void {
    const d = this.diagram(this.currentId)
    if (!d) return
    const child = viewId ? d.drill[viewId] : undefined
    if (child && viewId) {
      this.engine.highlight(null)
      void this.show(child, 'in', viewId)
      return
    }
    if (viewId && d.boxes[viewId]) {
      this.focusBox(viewId)
      return
    }
    const element = viewId ? d.views[viewId] : null
    if (!element) this.focusBox(null)
    else this.highlightElement(element)
  }

  // ------------------------------------------------------------------------------------------
  // Guided walk and ICOM list

  /** Points the walk at `view` on `diagram` (or the whole diagram) when that is a step. */
  private syncStep(diagram: string, view: string | null): void {
    const index = this.data.steps.findIndex((s) => s.diagram === diagram && s.view === view)
    if (index >= 0) this.stepIndex = index
    else if (this.data.steps[this.stepIndex]?.diagram !== diagram) this.stepIndex = this.data.steps.findIndex((s) => s.diagram === diagram)
    this.renderWalk()
  }

  private renderWalk(): void {
    const total = this.data.steps.length
    this.walkLabel.textContent = this.stepIndex >= 0 ? `${this.stepIndex + 1} / ${total}` : `– / ${total}`
    this.prevButton.disabled = this.stepIndex <= 0
    this.nextButton.disabled = this.stepIndex >= total - 1
  }

  /** Goes `delta` steps along the walk (zooming into a box that opens the next diagram). */
  private async walk(delta: number): Promise<void> {
    if (this.navigating) return
    const from = this.data.steps[this.stepIndex]
    const index = Math.max(0, Math.min(this.data.steps.length - 1, (this.stepIndex < 0 ? -1 : this.stepIndex) + delta))
    const step = this.data.steps[index]
    if (!step || index === this.stepIndex) return
    if (step.diagram !== this.currentId) {
      const drilled = from?.view && this.diagram(from.diagram)?.drill[from.view] === step.diagram
      this.engine.highlight(null)
      await this.show(step.diagram, drilled ? 'in' : this.transitionTo(step.diagram), drilled ? from.view : null)
    }
    this.stepIndex = index
    this.focusBox(step.view)
  }

  /** Lists and lights the arrows of `view` (an IDEF0 box), or of the whole sheet when null. */
  private focusBox(view: string | null): void {
    const d = this.diagram(this.currentId)
    if (!d) return
    const box = view ? d.boxes[view] : undefined
    this.focusedBox = box ? view : null
    if (box && view) this.engine.highlight(new Set([view, ...box.icom.flatMap((e) => e.views)]))
    else this.engine.highlight(null)
    if (this.currentId) this.syncStep(this.currentId, this.focusedBox)
    this.renderIcom()
  }

  private renderIcom(): void {
    const d = this.diagram(this.currentId)
    const box = d && this.focusedBox ? d.boxes[this.focusedBox] : undefined
    const entries = box ? box.icom : (d?.icom ?? [])
    this.icomPanel.hidden = !d || (Object.keys(d.boxes).length === 0 && entries.length === 0)
    if (this.icomPanel.hidden || !d) return
    const title = box ? box.label : d.context ? `${d.label}: arrows of its box` : `${d.label}: arrows crossing the sheet boundary`
    const columns = ROLE_HEADINGS.filter(([role]) => role !== 'call' || entries.some((e) => e.role === 'call')).map(([role, heading]) => {
      const rows = entries.filter((e) => e.role === role)
      const list = h('ul')
      if (rows.length === 0) list.append(h('li', { className: 'ouv-icom-none', text: 'None' }))
      for (const entry of rows) list.append(this.icomRow(entry))
      return h('div', { className: `ouv-icom-col role-${role}` }, h('h3', { text: `${heading} (${rows.length})` }), list)
    })
    const hint = box ? 'Click an arrow to show it on the diagram.' : 'Click a box (or use ← →) to see its arrows.'
    this.icomPanel.replaceChildren(
      h('header', {}, h('strong', { text: title }), h('span', { className: 'ouv-icom-hint', text: hint })),
      h('div', { className: 'ouv-icom-cols' }, ...columns)
    )
  }

  private icomRow(entry: IcomEntry): HTMLLIElement {
    const b = h(
      'button',
      { className: 'ouv-icom-row', title: [entry.code, entry.name, entry.detail].filter(Boolean).join(' · ') },
      h('span', { className: 'ouv-icom-code', text: entry.code }),
      h('span', { className: 'ouv-icom-text' }, h('span', { className: 'ouv-icom-name', text: entry.name || '(unnamed)' }), h('span', { className: 'ouv-icom-detail', text: entry.detail }))
    )
    b.type = 'button'
    b.disabled = entry.views.length === 0
    b.addEventListener('click', () => {
      const lit = new Set(entry.views)
      if (this.focusedBox) lit.add(this.focusedBox)
      this.engine.highlight(lit)
    })
    return h('li', {}, b)
  }

  /** Emphasizes the views of `elementId` on the shown diagram (null clears). */
  private highlightElement(elementId: string | null): void {
    const d = this.diagram(this.currentId)
    const boxView = elementId && d ? Object.keys(d.boxes).find((v) => d.views[v] === elementId) : undefined
    if (boxView) {
      this.focusBox(boxView)
      return
    }
    const views = elementId ? (this.data.elements[elementId]?.views ?? []).filter((v) => v.diagram === this.currentId).map((v) => v.view) : []
    this.engine.highlight(views.length > 0 ? new Set(views) : null)
  }

  private onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    const d = this.diagram(this.currentId)
    if (e.key === 'ArrowRight' || e.key === 'PageDown') void this.walk(1)
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') void this.walk(-1)
    else if (e.key === 'Escape') this.focusBox(null)
    else if (e.key === '+' || e.key === '=') void this.engine.zoomBy(1.25)
    else if (e.key === '-') void this.engine.zoomBy(1 / 1.25)
    else if (e.key === '0') this.fitAll(true)
    else if (e.key === 'Backspace' && d?.parent) void this.show(d.parent.diagram, 'out')
    else return
    e.preventDefault()
  }

  // ------------------------------------------------------------------------------------------
  // Breadcrumb

  private renderCrumbs(): void {
    const chain = this.currentId ? this.chain(this.currentId) : []
    const items: Node[] = []
    chain.forEach((d, i) => {
      if (i > 0) items.push(h('span', { className: 'sep', text: '›' }))
      const last = i === chain.length - 1
      const b = this.button(d.label, d.label, () => {
        if (!last) void this.show(d.id, 'out')
      })
      if (last) b.setAttribute('aria-current', 'page')
      items.push(b)
    })
    this.crumbs.replaceChildren(...items)
  }

  // ------------------------------------------------------------------------------------------
  // Model tree

  private expandTo(entry: TreeEntry, depth: number): void {
    if (depth <= 0) return
    this.expanded.add(entry.key)
    for (const child of entry.children) this.expandTo(child, depth - 1)
  }

  /** Opens the tree rows leading to `elementId`. */
  private revealInTree(elementId: string): void {
    const walk = (entries: readonly TreeEntry[], trail: string[]): boolean => {
      for (const entry of entries) {
        if (entry.element === elementId) {
          for (const key of trail) this.expanded.add(key)
          return true
        }
        if (walk(entry.children, [...trail, entry.key])) return true
      }
      return false
    }
    if (walk(this.data.tree, [])) this.renderTree()
  }

  private renderTree(): void {
    this.treeRows.clear()
    const list = h('ul')
    list.setAttribute('role', 'tree')
    for (const entry of this.data.tree) list.append(this.treeItem(entry, 0))
    this.treeRoot.replaceChildren(list)
    this.markCurrent(false)
  }

  private treeItem(entry: TreeEntry, depth: number): HTMLLIElement {
    const open = this.expanded.has(entry.key)
    const twisty = h('button', { className: 'ouv-twisty', text: entry.children.length > 0 ? (open ? '▾' : '▸') : '' })
    twisty.type = 'button'
    twisty.tabIndex = -1
    twisty.disabled = entry.children.length === 0
    twisty.setAttribute('aria-label', open ? 'Collapse' : 'Expand')
    twisty.addEventListener('click', () => {
      if (open) this.expanded.delete(entry.key)
      else this.expanded.add(entry.key)
      this.renderTree()
    })
    const diagram = this.diagram(entry.element)
    const element = entry.element ? this.data.elements[entry.element] : undefined
    const actionable = !!diagram || (element?.views.length ?? 0) > 0
    const label = h('button', { className: `ouv-label${diagram ? ' diagram' : ''}${actionable ? '' : ' inert'}`, text: entry.label, title: entry.tooltip })
    label.type = 'button'
    label.addEventListener('click', () => this.openEntry(entry))
    const row = h('div', { className: 'ouv-row' }, twisty, label)
    row.style.paddingLeft = `${4 + depth * 14}px`
    const item = h('li', {}, row)
    item.setAttribute('role', 'treeitem')
    if (entry.children.length > 0) item.setAttribute('aria-expanded', String(open))
    if (entry.element) this.treeRows.set(entry.element, [...(this.treeRows.get(entry.element) ?? []), row])
    if (open && entry.children.length > 0) {
      const children = h('ul')
      children.setAttribute('role', 'group')
      for (const child of entry.children) children.append(this.treeItem(child, depth + 1))
      item.append(children)
    }
    return item
  }

  /** A tree row clicked: a diagram opens; an element opens a diagram showing it, highlighted. */
  private async openEntry(entry: TreeEntry): Promise<void> {
    if (!entry.element) return
    if (this.diagram(entry.element)) {
      this.engine.highlight(null)
      await this.show(entry.element, this.transitionTo(entry.element))
      return
    }
    const views = this.data.elements[entry.element]?.views ?? []
    const target = views.find((v) => v.diagram === this.currentId) ?? views[0]
    if (!target) return
    if (target.diagram !== this.currentId) await this.show(target.diagram, this.transitionTo(target.diagram))
    this.highlightElement(entry.element)
  }

  private markCurrent(reveal = true): void {
    for (const rows of this.treeRows.values()) for (const row of rows) row.classList.remove('current')
    if (!this.currentId) return
    if (reveal && !this.treeRows.has(this.currentId)) this.revealInTree(this.currentId)
    for (const row of this.treeRows.get(this.currentId) ?? []) row.classList.add('current')
  }
}

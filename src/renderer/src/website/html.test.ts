import { createHash } from 'node:crypto'
import runtime from 'virtual:openuml-viewer'
import { describe, expect, it } from 'vitest'
import { createNode, ModelEngine, setFields } from '../commands'
import { FixedWidthTextMeasurer } from '../diagram/core'
import { ensureNotations } from '../diagram/notations'
import { createDefaultProject, Repository, type Diagram, type Elem } from '../model'
import { buildWebsiteDigest } from './digest'
import { escapeHtml, scriptJson, websiteHtml } from './html'

const HOSTILE = '</script><img src=x onerror="alert(1)"><!--'

function hostileSite(): Promise<string> {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const diagram = repository.defaultDiagram() as Diagram
  const cls = createNode(engine, { kind: 'Class', diagram, left: 40, top: 40 }).model as Elem
  setFields(engine, cls, { name: HOSTILE })
  setFields(engine, repository.project as Elem, { name: HOSTILE })
  const digest = buildWebsiteDigest(repository, { title: HOSTILE, generator: 'OpenUML test', measurer: new FixedWidthTextMeasurer() })
  return websiteHtml(digest, runtime)
}

function inlineScript(html: string): string {
  const m = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)
  if (!m) throw new Error('no inline script')
  return m[1] as string
}

describe('website page', () => {
  it('never lets model text become markup', async () => {
    const html = await hostileSite()
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<!--')
    // Exactly the two scripts of the page, nothing injected.
    expect(html.match(/<script/g)).toHaveLength(2)
    expect(html).toContain(`<title>${escapeHtml(HOSTILE)}</title>`)
    // The data block still carries the exact names.
    const data = /<script type="application\/json" id="openuml-data">([\s\S]*?)<\/script>/.exec(html)?.[1] as string
    const digest = JSON.parse(data)
    expect(digest.title).toBe(HOSTILE)
    expect(Object.values(digest.elements as Record<string, { label: string }>).some((e) => e.label === HOSTILE)).toBe(true)
  })

  it('allows only its own script and no network at all', async () => {
    const html = await hostileSite()
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''
    const hash = createHash('sha256').update(inlineScript(html), 'utf8').digest('base64')
    expect(csp.split('; ')).toEqual([
      "default-src 'none'",
      `script-src 'sha256-${hash}'`,
      "style-src 'unsafe-inline'",
      'img-src data:',
      "base-uri 'none'",
      "form-action 'none'"
    ])
  })

  it('escapes JSON for a script block', () => {
    expect(scriptJson({ a: '</script>\u2028' })).toBe('{"a":"\\u003c/script>\\u2028"}')
    expect(JSON.parse(scriptJson({ a: '</script>\u2028' }))).toEqual({ a: '</script>\u2028' })
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;')
  })

  it('bundles a small viewer that cannot reach the network or evaluate code', () => {
    expect(runtime.length).toBeGreaterThan(1000)
    expect(runtime.length).toBeLessThan(40 * 1024)
    for (const banned of ['eval(', 'new Function', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
      expect(runtime).not.toContain(banned)
    }
  })
})

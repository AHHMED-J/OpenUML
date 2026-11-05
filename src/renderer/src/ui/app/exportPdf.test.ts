import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { PdfPage } from '../../../../shared/ipc'
import { ensureNotations } from '../../diagram/notations'
import { diagramToPdfPage } from '../../export'
import { diagramNodeNumber } from '../../model/idef0-numbering'
import { projectStore } from '../../store'

const written: PdfPage[][] = []

vi.mock('./bridge', () => ({
  bridge: {
    chooseSavePath: async (name: string) => `/out/${name}`,
    writePdf: async (_path: string, pages: PdfPage[]) => {
      written.push(pages)
    }
  },
  isMac: false,
  platform: 'linux'
}))

const { exportAllDiagramsPdf } = await import('./fileOps')

describe('Export All Diagrams to One PDF', () => {
  it('prints an IDEF0 model as A-0, A0, A3 although the file stores the context diagram last', async () => {
    ensureNotations()
    const text = readFileSync(new URL('../../../../../examples/software-release-idef0.mdj', import.meta.url), 'utf8')
    projectStore.getState().openProject(text, null)
    const diagrams = projectStore.getState().repository.diagrams()
    // The file keeps A-0 after the top function, so containment order would print it last.
    expect(diagrams.map(diagramNodeNumber)).toEqual(['A0', 'A3', 'A-0'])

    await exportAllDiagramsPdf()

    const pageOf = (node: string): PdfPage => diagramToPdfPage(diagrams.find((d) => diagramNodeNumber(d) === node)!._id)
    expect(written.at(-1)).toEqual([pageOf('A-0'), pageOf('A0'), pageOf('A3')])
  })
})

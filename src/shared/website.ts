/**
 * Data of an exported interactive website (File > Export Interactive Website): what the viewer
 * runtime (`src/viewer`) needs to show the model, never the whole project file. Built by the app
 * (`src/renderer/src/website/digest.ts`) and embedded in the page as JSON.
 */

export const WEBSITE_DIGEST_VERSION = 1

export interface Bounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** One row of the model tree, as in the Model Explorer. */
export interface TreeEntry {
  readonly key: string
  readonly label: string
  readonly tooltip: string
  /** The element this row stands for (absent for IDEF0 role folders). */
  readonly element?: string
  /** Element type, for the row icon (`UMLClass`, `IDEF0Function`, ...). */
  readonly type?: string
  readonly children: readonly TreeEntry[]
}

export interface ElementDigest {
  readonly id: string
  readonly type: string
  /** Type shown to people ("Class", "Function"). */
  readonly typeLabel: string
  readonly label: string
  /** The views of this element in the exported diagrams. */
  readonly views: readonly { readonly diagram: string; readonly view: string }[]
}

export interface DiagramDigest {
  readonly id: string
  readonly type: string
  readonly label: string
  /** Standalone SVG of the diagram (the same drawing as SVG export). */
  readonly svg: string
  /** Region the SVG shows, in diagram units (its viewBox). */
  readonly bounds: Bounds
  /** Top-level view id → the model element it shows (null for notes, frames, ...). */
  readonly views: Readonly<Record<string, string | null>>
  /** IDEF0: function box view id → the exported child diagram it opens. */
  readonly drill: Readonly<Record<string, string>>
  /** IDEF0: the diagram above this one and the view of the box it details there. */
  readonly parent: { readonly diagram: string; readonly view: string | null } | null
}

export interface WebsiteDigest {
  readonly version: typeof WEBSITE_DIGEST_VERSION
  readonly title: string
  /** "OpenUML 0.1.4". */
  readonly generator: string
  readonly tree: readonly TreeEntry[]
  readonly elements: Readonly<Record<string, ElementDigest>>
  readonly diagrams: Readonly<Record<string, DiagramDigest>>
  /** Exported diagrams in model order. */
  readonly diagramOrder: readonly string[]
  /** The diagram shown first. */
  readonly start: string
}

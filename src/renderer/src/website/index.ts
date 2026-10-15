/**
 * Website module — the interactive website export (File > Export Interactive Website): the model
 * digest the viewer reads (`buildWebsiteDigest`) and the single-file page (`websiteHtml`). The
 * viewer runtime itself lives in `src/viewer`.
 */
export { buildWebsiteDigest, diagramsInTreeOrder } from './digest'
export { websiteHtml } from './html'

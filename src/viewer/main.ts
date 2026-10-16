/** Entry of the website viewer runtime: reads the embedded model digest and starts the viewer. */
import { WEBSITE_DIGEST_VERSION, type WebsiteDigest } from '../shared/website'
import { ViewerApp } from './app'
import { VIEWER_CSS } from './styles'

function start(): void {
  const style = document.createElement('style')
  style.textContent = VIEWER_CSS
  document.head.append(style)
  const root = document.getElementById('openuml-viewer')
  const data = document.getElementById('openuml-data')
  if (!root || !data) return
  try {
    const digest = JSON.parse(data.textContent ?? '') as WebsiteDigest
    if (digest.version !== WEBSITE_DIGEST_VERSION) throw new Error(`unsupported data version ${String(digest.version)}`)
    new ViewerApp(root, digest)
  } catch (err) {
    const message = document.createElement('p')
    message.className = 'ouv-error'
    message.textContent = `This model could not be shown (${err instanceof Error ? err.message : String(err)}).`
    root.replaceChildren(message)
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()

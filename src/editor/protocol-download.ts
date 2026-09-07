import { getCurrentProtocol } from '../protocol/current-protocol'

export const PROTOCOL_DOWNLOAD_FILENAME = 'article-content-protocol-latest.json'

export function downloadProtocolDefinition() {
  const protocol = getCurrentProtocol()
  const anchor = document.createElement('a')
  const blob = new Blob([`${JSON.stringify(protocol, null, 2)}\n`], { type: protocol.mediaType })
  const url = URL.createObjectURL(blob)
  try {
    anchor.href = url
    anchor.download = PROTOCOL_DOWNLOAD_FILENAME
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Give the browser time to start reading the Blob before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

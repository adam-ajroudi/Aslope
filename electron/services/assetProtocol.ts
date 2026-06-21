import { net, protocol } from 'electron'
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { pathToFileURL } from 'url'

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

export function registerNudgeProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'nudge',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export function nudgeUrlToPath(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'asset') {
      const encoded = parsed.pathname.replace(/^\/+/, '')
      const decoded = decodeURIComponent(encoded)
      if (/^[A-Za-z]:\//.test(decoded)) {
        return decoded.replace(/\//g, '\\')
      }
      return decoded
    }
  } catch {
    // fall through to legacy parsing
  }

  const raw = url.replace(/^nudge:\/\//, '')
  const decoded = decodeURIComponent(raw)

  if (decoded.startsWith('/')) {
    return decoded
  }

  if (/^[A-Za-z]:[\\/]/.test(decoded)) {
    return decoded
  }

  return `/${decoded}`
}

export function setupNudgeProtocol(): void {
  protocol.handle('nudge', async (request) => {
    try {
      const filePath = nudgeUrlToPath(request.url)
      const ext = extname(filePath).toLowerCase()
      const contentType = MIME_BY_EXT[ext]

      if (contentType) {
        const data = await readFile(filePath)
        return new Response(data, { headers: { 'Content-Type': contentType } })
      }

      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('[nudge:protocol] failed:', request.url, err)
      return new Response('Not found', { status: 404 })
    }
  })
}

export function toNudgeAssetUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/')
  return `nudge://asset/${encodeURIComponent(normalized)}`
}

import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'

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
  protocol.handle('nudge', (request) => {
    try {
      const filePath = nudgeUrlToPath(request.url)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('[nudge:protocol] failed:', request.url, err)
      return new Response('Not found', { status: 404 })
    }
  })
}

export function toNudgeAssetUrl(absolutePath: string): string {
  return `nudge://${encodeURIComponent(absolutePath)}`
}

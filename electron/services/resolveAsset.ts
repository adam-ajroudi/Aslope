import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { TriggerType } from '@shared/types'
import { toNudgeAssetUrl } from './assetProtocol'

const PLACEHOLDER_FILES: Record<TriggerType, string> = {
  slouch: 'slouch-reward.svg',
  phone: 'phone-consequence.svg'
}

function placeholderCandidates(filename: string): string[] {
  return [
    join(process.cwd(), 'renderer/public/nudges', filename),
    join(app.getAppPath(), 'out/renderer/nudges', filename),
    join(app.getAppPath(), 'renderer/nudges', filename),
    join(__dirname, '../../renderer/public/nudges', filename),
    join(__dirname, '../renderer/nudges', filename)
  ]
}

export function resolvePlaceholderAsset(type: TriggerType): string {
  const filename = PLACEHOLDER_FILES[type]
  const rendererUrl = process.env.ELECTRON_RENDERER_URL?.replace(/\/$/, '')

  if (rendererUrl) {
    return `${rendererUrl}/nudges/${filename}`
  }

  for (const candidate of placeholderCandidates(filename)) {
    if (existsSync(candidate)) {
      return toNudgeAssetUrl(candidate)
    }
  }

  const fallback = placeholderCandidates(filename)[0]
  console.warn('[assets] placeholder missing on disk, using path anyway:', fallback)
  return toNudgeAssetUrl(fallback)
}

export function normalizeAssetUrl(pathOrUrl: string): string {
  if (
    pathOrUrl.startsWith('nudge://') ||
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://')
  ) {
    return pathOrUrl
  }

  if (pathOrUrl.startsWith('nudges/')) {
    const type: TriggerType = pathOrUrl.includes('slouch') ? 'slouch' : 'phone'
    return resolvePlaceholderAsset(type)
  }

  if (pathOrUrl.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathOrUrl)) {
    return toNudgeAssetUrl(pathOrUrl)
  }

  return pathOrUrl
}

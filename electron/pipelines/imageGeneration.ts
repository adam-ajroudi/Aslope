import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { PrepImagePrompts } from '@shared/prepSchema'
import type { ImageLibrary, TriggerType } from '@shared/types'
import { cacheImagePath, downloadImageToFile } from './assetDownload'
import { mergeImageLibrary, notifyImagesReady } from './assetCache'
import { toNudgeAssetUrl } from '../services/assetProtocol'
import { resolvePlaceholderAsset } from '../services/resolveAsset'
import {
  generateImageFromPrompt,
  getMidjourneyPrepLimit,
  isMidjourneyConfigured
} from '../services/midjourneyMcp'

const TRIGGERS: TriggerType[] = ['slouch', 'phone']

function emptyLibrary(): ImageLibrary {
  return { slouch: [], phone: [] }
}

function seedPlaceholderImages(userId: string): void {
  mergeImageLibrary(userId, {
    slouch: [resolvePlaceholderAsset('slouch')],
    phone: [resolvePlaceholderAsset('phone')]
  })
}

/** Load placeholders immediately, then generate Midjourney images before session is ready. */
export async function prepareSessionImages(
  userId: string,
  imagePrompts: PrepImagePrompts
): Promise<number> {
  seedPlaceholderImages(userId)

  if (!isMidjourneyConfigured()) {
    console.log('[midjourney:prep] skipped — using placeholder images')
    return 0
  }

  const library = await generateSessionImages(userId, imagePrompts)
  const count = countImages(library)
  mergeImageLibrary(userId, library)
  console.log('[midjourney:prep] done', { images: count })
  return count
}

export function startMidjourneyPrep(
  userId: string,
  imagePrompts: PrepImagePrompts,
  mainWindow: BrowserWindow | null
): void {
  void (async () => {
    const count = await prepareSessionImages(userId, imagePrompts)
    notifyImagesReady(mainWindow, { userId, imageCount: count })
  })()
}

async function generateSessionImages(
  userId: string,
  imagePrompts: PrepImagePrompts
): Promise<ImageLibrary> {
  const library = emptyLibrary()
  const cacheRoot = join(app.getPath('userData'), 'nudge-cache')
  const limit = getMidjourneyPrepLimit()
  let generated = 0

  for (const trigger of TRIGGERS) {
    if (generated >= limit) break

    const prompt = imagePrompts[trigger][0]
    if (!prompt) continue

    console.log('[midjourney:prep] generating', { trigger })
    const cdnUrl = await generateImageFromPrompt(prompt)
    if (!cdnUrl) continue

    const filePath = cacheImagePath(cacheRoot, userId, trigger, 0)
    try {
      await downloadImageToFile(cdnUrl, filePath)
      library[trigger].push(toNudgeAssetUrl(filePath))
      generated += 1
    } catch (err) {
      console.error('[midjourney:prep] download failed:', err)
    }
  }

  return library
}

function countImages(library: ImageLibrary): number {
  return TRIGGERS.reduce((sum, trigger) => sum + library[trigger].length, 0)
}

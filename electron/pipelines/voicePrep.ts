import { createHash } from 'crypto'
import { access } from 'fs/promises'
import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { SessionPrepResult } from '@shared/prepSchema'
import type { TriggerType } from '@shared/types'
import { toNudgeAssetUrl } from '../services/assetProtocol'
import { isDeepgramConfigured, synthesizeSpeechToFile } from '../services/deepgram'
import { attachAudioToQuote, notifyVoiceReady } from './assetCache'

const TRIGGERS: TriggerType[] = ['slouch', 'phone']

function voiceCachePath(cacheRoot: string, userId: string, trigger: TriggerType, quote: string): string {
  const hash = createHash('sha256').update(quote).digest('hex').slice(0, 16)
  return join(cacheRoot, userId, trigger, `${hash}.mp3`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function startVoicePrep(
  userId: string,
  prep: SessionPrepResult,
  mainWindow: BrowserWindow | null
): void {
  if (!isDeepgramConfigured()) {
    console.log('[voice:prep] skipped — missing DEEPGRAM_API_KEY')
    return
  }

  void (async () => {
    const cacheRoot = join(app.getPath('userData'), 'voice-cache')
    let audioCount = 0

    for (const trigger of TRIGGERS) {
      for (const quote of prep.quotes[trigger]) {
        const filePath = voiceCachePath(cacheRoot, userId, trigger, quote)

        try {
          if (!(await fileExists(filePath))) {
            console.log('[voice:prep] synthesizing', { trigger, chars: quote.length })
            await synthesizeSpeechToFile(quote, filePath)
          }

          const audioPath = toNudgeAssetUrl(filePath)
          attachAudioToQuote(userId, trigger, quote, audioPath)
          audioCount += 1
        } catch (err) {
          console.error('[voice:prep] failed for quote:', err)
        }
      }
    }

    console.log('[voice:prep] done', { audioCount })
    notifyVoiceReady(mainWindow, { userId, audioCount })
  })()
}

export async function synthesizeLiveQuote(
  userId: string,
  trigger: TriggerType,
  quote: string
): Promise<string | undefined> {
  if (!isDeepgramConfigured()) return undefined

  const cacheRoot = join(app.getPath('userData'), 'voice-cache')
  const filePath = voiceCachePath(cacheRoot, userId, trigger, quote)

  try {
    await synthesizeSpeechToFile(quote, filePath)
    const audioPath = toNudgeAssetUrl(filePath)
    attachAudioToQuote(userId, trigger, quote, audioPath)
    return audioPath
  } catch (err) {
    console.error('[voice:live] failed:', err)
    return undefined
  }
}

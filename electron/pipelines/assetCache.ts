import type { BrowserWindow } from 'electron'
import type { SessionPrepResult } from '@shared/prepSchema'
import { redisKeys } from '@shared/schema'
import type { CachedNudgeAsset, ImageLibrary, NudgePayload, TriggerType } from '@shared/types'
import type { SessionEventRecord } from '@shared/agentMemory'
import { getHardcodedNudge, getPlaceholderImagePath } from '../services/nudgeHardcoded'
import { normalizeAssetUrl } from '../services/resolveAsset'
import { getRedis } from '../services/redis'
import { IPC_CHANNELS } from '../ipc/channels'

const TRIGGERS: TriggerType[] = ['slouch', 'phone']

type CoachLine = {
  quote: string
  audioPath?: string
}

type CoachLibrary = Record<TriggerType, CoachLine[]>

const memoryPrepByUser = new Map<string, SessionPrepResult>()
const memoryCoachByUser = new Map<string, CoachLibrary>()
const memoryImagesByUser = new Map<string, ImageLibrary>()

function emptyImageLibrary(): ImageLibrary {
  return { slouch: [], phone: [] }
}

function buildCoachLibrary(prep: SessionPrepResult): CoachLibrary {
  return {
    slouch: prep.quotes.slouch.map((quote) => ({ quote })),
    phone: prep.quotes.phone.map((quote) => ({ quote }))
  }
}

export function initCoachLibrary(userId: string, prep: SessionPrepResult): void {
  memoryPrepByUser.set(userId, prep)
  memoryCoachByUser.set(userId, buildCoachLibrary(prep))
}

export function attachAudioToQuote(
  userId: string,
  trigger: TriggerType,
  quote: string,
  audioPath: string
): void {
  const library = memoryCoachByUser.get(userId)
  const line = library?.[trigger]?.find((entry) => entry.quote === quote)
  if (line) {
    line.audioPath = audioPath
  }
}

export function mergeImageLibrary(userId: string, library: ImageLibrary): void {
  const existing = memoryImagesByUser.get(userId) ?? emptyImageLibrary()

  for (const trigger of TRIGGERS) {
    if (library[trigger].length > 0) {
      existing[trigger] = library[trigger]
    }
  }

  memoryImagesByUser.set(userId, existing)
}

export function notifyImagesReady(
  mainWindow: BrowserWindow | null,
  payload: { userId: string; imageCount: number }
): void {
  mainWindow?.webContents.send(IPC_CHANNELS.IMAGES_READY, payload)
}

export function notifyVoiceReady(
  mainWindow: BrowserWindow | null,
  payload: { userId: string; audioCount: number }
): void {
  mainWindow?.webContents.send(IPC_CHANNELS.VOICE_READY, payload)
}

function pickImagePath(userId: string, type: TriggerType): string {
  const library = memoryImagesByUser.get(userId)
  const generated = library?.[type] ?? []

  if (generated.length > 0) {
    return normalizeAssetUrl(generated[Math.floor(Math.random() * generated.length)])
  }

  return normalizeAssetUrl(getPlaceholderImagePath(type))
}

function pickCoachLine(userId: string, type: TriggerType): CoachLine | null {
  const library = memoryCoachByUser.get(userId)
  const lines = library?.[type] ?? []
  if (lines.length === 0) return null
  return lines[Math.floor(Math.random() * lines.length)]
}

function toCachedAsset(imagePath: string, quote: string, audioPath?: string): CachedNudgeAsset {
  return { imagePath, quote, audioPath }
}

export async function writePrepToCache(userId: string, prep: SessionPrepResult): Promise<boolean> {
  initCoachLibrary(userId, prep)

  const redis = await getRedis()
  if (!redis) return false

  try {
    await writePrepToRedis(redis, userId, prep)
    console.log('[cache:prep]', { userId, quoteTriggers: TRIGGERS.length })
    return true
  } catch (err) {
    console.error('[cache:prep] redis write failed — memory cache is still ready:', err)
    return false
  }
}

export function syncPrepToRedis(userId: string, prep: SessionPrepResult): void {
  initCoachLibrary(userId, prep)
  void (async () => {
    const redis = await getRedis()
    if (!redis) return
    try {
      await writePrepToRedis(redis, userId, prep)
      console.log('[cache:prep:bg] redis synced')
    } catch (err) {
      console.error('[cache:prep:bg] failed:', err)
    }
  })()
}

async function writePrepToRedis(
  redis: NonNullable<Awaited<ReturnType<typeof getRedis>>>,
  userId: string,
  prep: SessionPrepResult
): Promise<void> {
  const deadline = Date.now() + 8_000

  for (const trigger of TRIGGERS) {
    const quotesKey = redisKeys.quotes(userId, trigger)
    await redis.del(quotesKey)
    if (prep.quotes[trigger].length > 0) {
      await redis.rPush(quotesKey, prep.quotes[trigger])
    }
    if (Date.now() > deadline) throw new Error('Redis write timed out')
  }

  for (const trigger of TRIGGERS) {
    const assetsKey = redisKeys.assets(userId, trigger)
    await redis.del(assetsKey)
    const library = memoryCoachByUser.get(userId)
    const assets = (library?.[trigger] ?? []).map((line) =>
      JSON.stringify(
        toCachedAsset(pickImagePath(userId, trigger), line.quote, line.audioPath)
      )
    )
    if (assets.length > 0) {
      await redis.rPush(assetsKey, assets)
    }
    if (Date.now() > deadline) throw new Error('Redis write timed out')
  }

  await redis.set(redisKeys.prepPrompts(userId), JSON.stringify(prep.imagePrompts), {
    EX: 60 * 60 * 24
  })
}

export async function seedSessionCache(userId: string): Promise<boolean> {
  const redis = await getRedis()
  if (!redis) return false

  const pipeline = redis.multi()

  for (const trigger of TRIGGERS) {
    const key = redisKeys.assets(userId, trigger)
    const asset = toCachedAsset(
      getPlaceholderImagePath(trigger),
      getHardcodedNudge(trigger).quote
    )
    pipeline.del(key)
    pipeline.rPush(key, JSON.stringify(asset))
  }

  await pipeline.exec()
  return true
}

export function serveNudge(userId: string, type: TriggerType): NudgePayload {
  const line = pickCoachLine(userId, type)
  if (line) {
    const payload: NudgePayload = {
      type,
      quote: line.quote,
      imagePath: pickImagePath(userId, type),
      audioPath: line.audioPath
    }
    console.log('[nudge:serve:memory]', { type, quote: payload.quote, hasAudio: Boolean(payload.audioPath) })
    return payload
  }

  const fallback = getHardcodedNudge(type)
  const payload = {
    ...fallback,
    imagePath: normalizeAssetUrl(fallback.imagePath ?? getPlaceholderImagePath(type))
  }
  console.log('[nudge:serve:fallback]', { type, quote: payload.quote })
  return payload
}

export async function getCachedNudge(userId: string, type: TriggerType): Promise<NudgePayload> {
  return serveNudge(userId, type)
}

const memoryEventsBySession = new Map<string, SessionEventRecord[]>()

function recordSessionEvent(sessionId: string, event: SessionEventRecord): void {
  const existing = memoryEventsBySession.get(sessionId) ?? []
  existing.push(event)
  memoryEventsBySession.set(sessionId, existing)
}

export function getSessionEventsFromMemory(sessionId: string): SessionEventRecord[] {
  return memoryEventsBySession.get(sessionId) ?? []
}

export function clearSessionEvents(sessionId: string): void {
  memoryEventsBySession.delete(sessionId)
}

export async function getSessionEvents(sessionId: string): Promise<SessionEventRecord[]> {
  const fromMemory = getSessionEventsFromMemory(sessionId)
  if (fromMemory.length > 0) return fromMemory

  const redis = await getRedis()
  if (!redis) return []

  try {
    const entries = await redis.lRange(redisKeys.sessionEvents(sessionId), 0, -1)
    return entries
      .map((entry) => {
        try {
          return JSON.parse(entry) as SessionEventRecord
        } catch {
          return null
        }
      })
      .filter((entry): entry is SessionEventRecord => entry !== null)
  } catch (err) {
    console.error('[events:session] load failed:', err)
    return []
  }
}

const memorySessions = new Map<
  string,
  { userId: string; taskIntent: string; startedAt: number; prepSource?: string }
>()

export async function saveSession(
  sessionId: string,
  data: { userId: string; taskIntent: string; startedAt: number; prepSource?: string }
): Promise<void> {
  memorySessions.set(sessionId, data)

  const redis = await getRedis()
  if (!redis) return

  await redis.set(redisKeys.session(sessionId), JSON.stringify(data), { EX: 60 * 60 * 24 })
}

export async function getSession(
  sessionId: string
): Promise<{ userId: string; taskIntent: string; startedAt: number; prepSource?: string } | null> {
  const fromMemory = memorySessions.get(sessionId)
  if (fromMemory) return fromMemory

  const redis = await getRedis()
  if (!redis) return null

  try {
    const raw = await redis.get(redisKeys.session(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      userId: string
      taskIntent: string
      startedAt: number
      prepSource?: string
    }
    memorySessions.set(sessionId, parsed)
    return parsed
  } catch {
    return null
  }
}

export function logTriggerEvent(
  userId: string,
  event: {
    eventId: string
    sessionId: string
    timestamp: number
    type: TriggerType
    assetServed: string
    quote: string
  }
): void {
  const record: SessionEventRecord = {
    eventId: event.eventId,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    type: event.type,
    quote: event.quote,
    assetServed: event.assetServed
  }

  recordSessionEvent(event.sessionId, record)

  void (async () => {
    const redis = await getRedis()
    if (!redis) return

    try {
      await redis.zAdd(redisKeys.events(userId), {
        score: event.timestamp,
        value: JSON.stringify(event)
      })
      await redis.rPush(redisKeys.sessionEvents(event.sessionId), JSON.stringify(record))
    } catch (err) {
      console.error('[events:log] failed:', err)
    }
  })()
}

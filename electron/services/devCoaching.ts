import { redisKeys } from '@shared/schema'
import type { DevCoachEntry } from '@shared/devCoaching'
import { v4 as uuidv4 } from 'uuid'
import { getRedis } from './redis'

const MAX_ENTRIES = 40
const coachingByUser = new Map<string, DevCoachEntry[]>()

export function getDevCoachingFromCache(userId: string): DevCoachEntry[] {
  return coachingByUser.get(userId) ?? []
}

export async function loadDevCoaching(userId: string): Promise<DevCoachEntry[]> {
  const cached = coachingByUser.get(userId)
  if (cached) return cached

  const redis = await getRedis()
  if (!redis) return []

  try {
    const entries = await redis.lRange(redisKeys.devCoaching(userId), 0, MAX_ENTRIES - 1)
    const parsed = entries
      .map((entry) => {
        try {
          return normalizeEntry(JSON.parse(entry) as Partial<DevCoachEntry>)
        } catch {
          return null
        }
      })
      .filter((entry): entry is DevCoachEntry => entry !== null)

    coachingByUser.set(userId, parsed)
    return parsed
  } catch (err) {
    console.error('[dev-coaching:load] failed:', err)
    return []
  }
}

function normalizeEntry(raw: Partial<DevCoachEntry>): DevCoachEntry | null {
  if (!raw.incidentId || !raw.errorMessage || !raw.component || !raw.plea || !raw.coachMessage) {
    return null
  }

  return {
    id: raw.id ?? uuidv4(),
    timestamp: raw.timestamp ?? Date.now(),
    incidentId: raw.incidentId,
    errorMessage: raw.errorMessage,
    component: raw.component,
    plea: raw.plea,
    coachMessage: raw.coachMessage,
    seerComeback: raw.seerComeback ?? 'Seer nodded solemnly.',
    seerVibe: raw.seerVibe ?? 'first-meeting',
    vibeLabel: raw.vibeLabel ?? 'Just met',
    banterIndex: raw.banterIndex ?? 1
  }
}

export async function saveDevCoaching(
  userId: string,
  input: Omit<DevCoachEntry, 'id' | 'timestamp'> & { timestamp?: number }
): Promise<DevCoachEntry> {
  const entry: DevCoachEntry = {
    id: uuidv4(),
    timestamp: input.timestamp ?? Date.now(),
    incidentId: input.incidentId,
    errorMessage: input.errorMessage,
    component: input.component,
    plea: input.plea,
    coachMessage: input.coachMessage,
    seerComeback: input.seerComeback,
    seerVibe: input.seerVibe,
    vibeLabel: input.vibeLabel,
    banterIndex: input.banterIndex
  }

  const existing = coachingByUser.get(userId) ?? (await loadDevCoaching(userId))
  const merged = [entry, ...existing].slice(0, MAX_ENTRIES)
  coachingByUser.set(userId, merged)

  const redis = await getRedis()
  if (redis) {
    try {
      const key = redisKeys.devCoaching(userId)
      await redis.lPush(key, JSON.stringify(entry))
      await redis.lTrim(key, 0, MAX_ENTRIES - 1)
    } catch (err) {
      console.error('[dev-coaching:save] redis failed:', err)
    }
  }

  return entry
}

import { redisKeys } from '@shared/schema'
import {
  emptySeerRelationship,
  SEER_VIBE_LABELS,
  vibeForInteractionCount,
  type SeerBanterEvent,
  type SeerRelationship,
  type SeerVibe
} from '@shared/seer'
import { v4 as uuidv4 } from 'uuid'
import { getRedis } from './redis'

const MAX_BANTER_EVENTS = 50
const MAX_INSIDE_REFS = 8

const relationshipByUser = new Map<string, SeerRelationship>()
const banterByUser = new Map<string, SeerBanterEvent[]>()

export function getSeerVibeLabel(vibe: SeerVibe): string {
  return SEER_VIBE_LABELS[vibe]
}

export async function loadSeerRelationship(userId: string): Promise<SeerRelationship> {
  const cached = relationshipByUser.get(userId)
  if (cached) return cached

  const redis = await getRedis()
  if (!redis) {
    const empty = emptySeerRelationship(userId)
    relationshipByUser.set(userId, empty)
    return empty
  }

  try {
    const raw = await redis.get(redisKeys.seer(userId))
    if (!raw) {
      const empty = emptySeerRelationship(userId)
      relationshipByUser.set(userId, empty)
      return empty
    }
    const relationship = JSON.parse(raw) as SeerRelationship
    relationshipByUser.set(userId, relationship)
    return relationship
  } catch (err) {
    console.error('[seer:load] failed:', err)
    return emptySeerRelationship(userId)
  }
}

export async function saveSeerRelationship(relationship: SeerRelationship): Promise<void> {
  const updated = { ...relationship, updatedAt: Date.now() }
  relationshipByUser.set(relationship.userId, updated)

  const redis = await getRedis()
  if (!redis) return

  try {
    await redis.set(redisKeys.seer(relationship.userId), JSON.stringify(updated))
  } catch (err) {
    console.error('[seer:save] failed:', err)
  }
}

export async function loadSeerBanter(userId: string): Promise<SeerBanterEvent[]> {
  const cached = banterByUser.get(userId)
  if (cached) return cached

  const redis = await getRedis()
  if (!redis) return []

  try {
    const entries = await redis.lRange(redisKeys.seerBanter(userId), 0, MAX_BANTER_EVENTS - 1)
    const events = entries
      .map((entry) => {
        try {
          return JSON.parse(entry) as SeerBanterEvent
        } catch {
          return null
        }
      })
      .filter((event): event is SeerBanterEvent => event !== null)

    banterByUser.set(userId, events)
    return events
  } catch (err) {
    console.error('[seer:banter:load] failed:', err)
    return []
  }
}

export async function appendSeerBanterEvent(userId: string, event: SeerBanterEvent): Promise<void> {
  const existing = banterByUser.get(userId) ?? (await loadSeerBanter(userId))
  const merged = [event, ...existing].slice(0, MAX_BANTER_EVENTS)
  banterByUser.set(userId, merged)

  const redis = await getRedis()
  if (!redis) return

  try {
    const key = redisKeys.seerBanter(userId)
    await redis.lPush(key, JSON.stringify(event))
    await redis.lTrim(key, 0, MAX_BANTER_EVENTS - 1)
  } catch (err) {
    console.error('[seer:banter:append] failed:', err)
  }
}

function clip(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function referenceHook(relationship: SeerRelationship): string {
  if (relationship.lastUserCoach && relationship.interactionCount > 2) {
    return `Last time you told me "${clip(relationship.lastUserCoach, 60)}" — still thinking about it. `
  }
  if (relationship.runningJoke) {
    return `${relationship.runningJoke} `
  }
  return ''
}

const PLEA_BY_VIBE: Record<SeerVibe, (component: string, error: string, hook: string) => string> = {
  'first-meeting': (component, error, hook) =>
    `${hook}Hi — I'm Seer. I watch your app like a fish tank so you don't have to. We just met and ${component} already did "${error}". Awkward.`,
  professional: (component, error, hook) =>
    `${hook}Seer here. Professional update: ${component} threw "${error}". I logged it. You coach it. We pretend we're fine.`,
  'warming-up': (component, error, hook) =>
    `${hook}Okay we're past the handshake phase — ${component} just "${error}" and I saw the whole thing. Roast it or fix it, your call bestie (early-stage bestie).`,
  'banter-buddies': (component, error, hook) =>
    `${hook}${component} had a whole moment: "${error}". I'm eating popcorn in the observatory. Say something unhinged so we can both move on.`,
  'chaotic-besties': (component, error, hook) =>
    `${hook}BESTIE NO — ${component} "${error}" — I'm screenshotting this for our lore. Coach your code before I start narrating your life in production.`
}

const COMEBACK_BY_VIBE: Record<SeerVibe, (coach: string, component: string) => string> = {
  'first-meeting': (coach, component) =>
    `Noted. "${clip(coach, 50)}" — our origin story. I'll watch ${component} extra hard now. Friends?`,
  professional: (coach, component) =>
    `Copy that. "${clip(coach, 50)}" goes in the incident diary. ${component} has been verbally disciplined.`,
  'warming-up': (coach, component) =>
    `Okay THAT'S the energy. "${clip(coach, 50)}" — adding to our bit. ${component} is on thin ice but so am I.`,
  'banter-buddies': (coach, component) =>
    `Crying. "${clip(coach, 50)}" — peak friendship. ${component} is fixed emotionally if not technically. Love you (platonically, for Sentry).`,
  'chaotic-besties': (coach, component) =>
    `"${clip(coach, 50)}" — framed above my desk. ${component} can crash again but WE'RE solid. Same time next disaster?`
}

export function generateSeerPlea(
  relationship: SeerRelationship,
  component: string,
  errorMessage: string
): string {
  const hook = referenceHook(relationship)
  const shortError = errorMessage.length > 100 ? `${errorMessage.slice(0, 97)}…` : errorMessage
  const builder = PLEA_BY_VIBE[relationship.vibe]
  return builder(component, shortError, hook)
}

export function generateSeerComebackFallback(
  relationship: SeerRelationship,
  userCoachMessage: string,
  component: string
): string {
  const builder = COMEBACK_BY_VIBE[relationship.vibe]
  return builder(userCoachMessage, component)
}

export function evolveRelationshipAfterCoach(
  relationship: SeerRelationship,
  userCoach: string,
  seerComeback: string
): SeerRelationship {
  const interactionCount = relationship.interactionCount + 1
  const vibe = vibeForInteractionCount(interactionCount)
  const insideReferences = [
    clip(userCoach, 80),
    ...relationship.insideReferences.filter((ref) => ref !== clip(userCoach, 80))
  ].slice(0, MAX_INSIDE_REFS)

  const runningJoke =
    interactionCount >= 4
      ? `Remember when you said "${clip(userCoach, 40)}"? That was our turning point.`
      : relationship.runningJoke

  return {
    ...relationship,
    interactionCount,
    vibe,
    lastUserCoach: userCoach,
    lastSeerComeback: seerComeback,
    runningJoke,
    insideReferences,
    updatedAt: Date.now()
  }
}

export function evolveRelationshipAfterIncident(
  relationship: SeerRelationship,
  seerLine: string
): SeerRelationship {
  return {
    ...relationship,
    lastSeerLine: seerLine,
    updatedAt: Date.now()
  }
}

export function createSeerIncidentEvent(input: {
  incidentId: string
  relationship: SeerRelationship
  component: string
  errorMessage: string
  seerLine: string
}): SeerBanterEvent {
  return {
    id: uuidv4(),
    incidentId: input.incidentId,
    timestamp: Date.now(),
    vibe: input.relationship.vibe,
    banterIndex: input.relationship.interactionCount + 1,
    component: input.component,
    errorMessage: input.errorMessage,
    seerLine: input.seerLine
  }
}

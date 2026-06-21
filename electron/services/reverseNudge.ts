import { v4 as uuidv4 } from 'uuid'
import type { ReverseNudgePayload } from '@shared/devCoaching'
import {
  evolveRelationshipAfterIncident,
  generateSeerPlea,
  getSeerVibeLabel,
  loadSeerRelationship,
  saveSeerRelationship
} from './seer'

type DeliveryHandler = (payload: ReverseNudgePayload) => void

let deliveryHandler: DeliveryHandler | null = null
let lastDedupeKey = ''
let lastDedupeAt = 0
const DEDUPE_MS = 15_000

export function registerReverseNudgeDelivery(handler: DeliveryHandler): void {
  deliveryHandler = handler
}

export async function buildReverseNudgePayload(
  userId: string,
  errorMessage: string,
  component = 'anchor-app'
): Promise<ReverseNudgePayload> {
  const relationship = await loadSeerRelationship(userId)
  const shortError = errorMessage.length > 120 ? `${errorMessage.slice(0, 117)}…` : errorMessage
  const plea = generateSeerPlea(relationship, component, shortError)
  const updated = evolveRelationshipAfterIncident(relationship, plea)
  await saveSeerRelationship(updated)

  const incidentId = uuidv4()

  return {
    incidentId,
    errorMessage: shortError,
    component,
    plea,
    seerVibe: updated.vibe,
    vibeLabel: getSeerVibeLabel(updated.vibe),
    banterIndex: updated.interactionCount + 1,
    timestamp: Date.now()
  }
}

export async function triggerReverseNudge(
  userId: string,
  error: unknown,
  component?: string
): Promise<ReverseNudgePayload | null> {
  const message = error instanceof Error ? error.message : String(error)
  const dedupeKey = `${component ?? 'app'}:${message}`
  const now = Date.now()

  if (dedupeKey === lastDedupeKey && now - lastDedupeAt < DEDUPE_MS) {
    console.log('[reverse-nudge] deduped', dedupeKey)
    return null
  }

  lastDedupeKey = dedupeKey
  lastDedupeAt = now

  const payload = await buildReverseNudgePayload(userId, message, component ?? 'anchor-app')
  console.log('[reverse-nudge] seer triggered', {
    incidentId: payload.incidentId,
    vibe: payload.seerVibe,
    banterIndex: payload.banterIndex
  })
  deliveryHandler?.(payload)
  return payload
}

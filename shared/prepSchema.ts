import type { TriggerType } from './types'

export type PrepQuotePools = Record<TriggerType, string[]>

export type PrepImagePrompts = Record<TriggerType, string[]>

export type SessionPrepResult = {
  quotes: PrepQuotePools
  imagePrompts: PrepImagePrompts
}

export const PREP_JSON_SCHEMA = `{
  "quotes": {
    "slouch": ["string"],
    "phone": ["string"]
  },
  "imagePrompts": {
    "slouch": ["string"],
    "phone": ["string"]
  }
}`

export function parsePrepJson(raw: string): SessionPrepResult | null {
  const trimmed = raw.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(unfenced) as SessionPrepResult
    if (!isValidPrep(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isValidPrep(value: unknown): value is SessionPrepResult {
  if (!value || typeof value !== 'object') return false
  const v = value as SessionPrepResult
  return isQuotePool(v.quotes) && isImagePrompts(v.imagePrompts)
}

function isQuotePool(quotes: PrepQuotePools): boolean {
  const triggers: TriggerType[] = ['slouch', 'phone']
  return triggers.every(
    (trigger) =>
      Array.isArray(quotes?.[trigger]) &&
      quotes[trigger].length > 0 &&
      quotes[trigger].every((q) => typeof q === 'string' && q.length > 0)
  )
}

function isImagePrompts(prompts: PrepImagePrompts): boolean {
  const triggers: TriggerType[] = ['slouch', 'phone']
  return triggers.every(
    (trigger) =>
      Array.isArray(prompts?.[trigger]) &&
      prompts[trigger].length > 0 &&
      prompts[trigger].every((p) => typeof p === 'string' && p.length > 0)
  )
}

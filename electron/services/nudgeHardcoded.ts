import type { NudgePayload, TriggerType } from '@shared/types'

const PLACEHOLDER_IMAGES: Record<TriggerType, string> = {
  slouch: 'nudges/slouch-reward.svg',
  phone: 'nudges/phone-consequence.svg'
}

const FALLBACK_QUOTES: Record<TriggerType, string> = {
  slouch:
    'Your spine is filing a complaint with future-you, and future-you has ADHD too. Sit up — the laptop hunch is commendable, but your vertebrae deserve a union break.',
  phone:
    'That phone is a dopamine slot machine and you just pulled the lever. Close it — your baseline is already sky-high from surviving the modern world.'
}

export function getPlaceholderImagePath(type: TriggerType): string {
  return PLACEHOLDER_IMAGES[type]
}

export function getHardcodedNudge(type: TriggerType): NudgePayload {
  return {
    type,
    quote: FALLBACK_QUOTES[type],
    imagePath: PLACEHOLDER_IMAGES[type]
  }
}

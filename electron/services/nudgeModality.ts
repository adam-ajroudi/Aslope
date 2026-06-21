import type { NudgeModality, NudgePayload } from '@shared/types'

export const MODALITY_CYCLE: NudgeModality[] = ['quote', 'image', 'voice']

export function pickModality(index: number): { modality: NudgeModality; nextIndex: number } {
  const modality = MODALITY_CYCLE[index % MODALITY_CYCLE.length]
  return { modality, nextIndex: index + 1 }
}

export function applyModality(nudge: NudgePayload, modality: NudgeModality): NudgePayload {
  const base = { type: nudge.type, modality, quote: nudge.quote }

  switch (modality) {
    case 'quote':
      return base
    case 'image':
      return { ...base, imagePath: nudge.imagePath }
    case 'voice':
      return { ...base, audioPath: nudge.audioPath }
  }
}

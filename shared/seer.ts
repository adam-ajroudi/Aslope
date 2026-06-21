export type SeerVibe =
  | 'first-meeting'
  | 'professional'
  | 'warming-up'
  | 'banter-buddies'
  | 'chaotic-besties'

export type SeerRelationship = {
  userId: string
  interactionCount: number
  vibe: SeerVibe
  runningJoke?: string
  lastUserCoach?: string
  lastSeerLine?: string
  lastSeerComeback?: string
  insideReferences: string[]
  updatedAt: number
}

export type SeerBanterEvent = {
  id: string
  incidentId: string
  timestamp: number
  vibe: SeerVibe
  banterIndex: number
  component: string
  errorMessage: string
  seerLine: string
  userCoach?: string
  seerComeback?: string
}

export const SEER_VIBE_LABELS: Record<SeerVibe, string> = {
  'first-meeting': 'Just met',
  professional: 'Work friends',
  'warming-up': 'Warming up',
  'banter-buddies': 'Banter buddies',
  'chaotic-besties': 'Chaotic besties'
}

export function vibeForInteractionCount(count: number): SeerVibe {
  if (count <= 0) return 'first-meeting'
  if (count <= 2) return 'professional'
  if (count <= 5) return 'warming-up'
  if (count <= 10) return 'banter-buddies'
  return 'chaotic-besties'
}

export function emptySeerRelationship(userId: string): SeerRelationship {
  return {
    userId,
    interactionCount: 0,
    vibe: 'first-meeting',
    insideReferences: [],
    updatedAt: Date.now()
  }
}

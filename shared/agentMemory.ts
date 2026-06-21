import type { TriggerType, NudgeModality } from './types'

export type WinEntry = {
  id: string
  sessionId: string
  timestamp: number
  title: string
  detail: string
  triggerType?: TriggerType
}

export type MemorySnippet = {
  id: string
  sessionId: string
  timestamp: number
  text: string
  tags: string[]
}

export type AgentMemory = {
  userId: string
  totalSessions: number
  totalTriggers: number
  slouchTriggers: number
  phoneTriggers: number
  focusScoreAvg: number
  wins: WinEntry[]
  coachInsights: string[]
  lastCoachNote?: string
  /** Rotates quote → image → voice across triggers; persisted in Redis */
  nudgeModalityIndex?: number
  updatedAt: number
}

export type SessionEventRecord = {
  eventId: string
  sessionId: string
  timestamp: number
  type: TriggerType
  modality: NudgeModality
  quote: string
  assetServed: string
}

export type SessionRecord = {
  sessionId: string
  userId: string
  taskIntent: string
  startedAt: number
  endedAt?: number
}

export type PostSessionSummary = {
  slouchCount: number
  phoneCount: number
  totalTriggers: number
  durationMs: number
}

export type PostSessionResult = {
  sessionId: string
  focusScore: number
  coachNote: string
  summary: PostSessionSummary
  wins: WinEntry[]
  nextTaskSuggestion: string
  coachingAdjustments: string[]
  source: 'claude' | 'fallback'
}

export function emptyAgentMemory(userId: string): AgentMemory {
  return {
    userId,
    totalSessions: 0,
    totalTriggers: 0,
    slouchTriggers: 0,
    phoneTriggers: 0,
    focusScoreAvg: 0,
    wins: [],
    coachInsights: [],
    updatedAt: Date.now()
  }
}

import type { MotivationMode, TriggerType } from './types'

export const redisKeys = {
  profile: (userId: string) => `profile:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  assets: (userId: string, trigger: TriggerType, mode: MotivationMode) =>
    `assets:${userId}:${trigger}:${mode}`,
  quotes: (userId: string, mode: MotivationMode) => `quotes:${userId}:${mode}`,
  audio: (userId: string, quoteHash: string) => `audio:${userId}:${quoteHash}`,
  events: (userId: string) => `events:${userId}`,
  memory: (userId: string) => `memory:${userId}`,
  memvec: (userId: string) => `memvec:${userId}`,
  milestone: (userId: string) => `milestone:${userId}`
}

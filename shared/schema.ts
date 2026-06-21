import type { TriggerType } from './types'

export const redisKeys = {
  profile: (userId: string) => `profile:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  assets: (userId: string, trigger: TriggerType) => `assets:${userId}:${trigger}`,
  quotes: (userId: string, trigger: TriggerType) => `quotes:${userId}:${trigger}`,
  audio: (userId: string, quoteHash: string) => `audio:${userId}:${quoteHash}`,
  events: (userId: string) => `events:${userId}`,
  memory: (userId: string) => `memory:${userId}`,
  memvec: (userId: string) => `memvec:${userId}`,
  milestone: (userId: string) => `milestone:${userId}`,
  prepPrompts: (userId: string) => `prep:${userId}:prompts`,
  sessionEvents: (sessionId: string) => `events:session:${sessionId}`,
  devCoaching: (userId: string) => `devcoaching:${userId}`,
  seer: (userId: string) => `seer:${userId}`,
  seerBanter: (userId: string) => `seer:banter:${userId}`
}

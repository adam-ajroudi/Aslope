import type { AgentMemory, PostSessionResult } from './agentMemory'
import type { DevCoachEntry, DevCoachSubmitPayload, ReverseNudgePayload } from './devCoaching'
import type { SeerRelationship } from './seer'

export type { DevCoachEntry, DevCoachSubmitPayload, ReverseNudgePayload } from './devCoaching'
export type { SeerBanterEvent, SeerRelationship, SeerVibe } from './seer'

export type TriggerType = 'slouch' | 'phone'

export type Profile = {
  userId: string
  interests: string[]
  voicePreference?: string
}

export type TriggerPayload = {
  sessionId: string
  type: TriggerType
  timestamp: number
}

export type CachedNudgeAsset = {
  imagePath: string
  quote: string
  audioPath?: string
}

export type ImageLibrary = Record<TriggerType, string[]>

export type NudgePayload = {
  type: TriggerType
  imagePath?: string
  videoPath?: string
  quote: string
  audioPath?: string
}

export type SessionEndPayload = {
  sessionId: string
}

export type SessionEndResult = PostSessionResult & {
  memory: AgentMemory
}

export type SessionStartPayload = {
  taskIntent: string
}

export type SessionStartResult = {
  sessionId: string
  cacheSeeded: boolean
  prepSource: 'claude' | 'fallback'
  quoteCount: number
  imageCount: number
  imagesPending: boolean
  voicePending: boolean
}

export type ImagesReadyPayload = {
  userId: string
  imageCount: number
}

export type VoiceReadyPayload = {
  userId: string
  audioCount: number
}

export type FocusEvent = {
  eventId: string
  userId: string
  sessionId: string
  timestamp: number
  type: TriggerType | 'refocus'
  recoveryMs: number | null
  assetServed: string
}

export type SystemInfo = {
  isWsl: boolean
  platform: NodeJS.Platform
  redisConnected: boolean
}

export type SeerState = {
  relationship: SeerRelationship
  vibeLabel: string
}

export type OverlayAPI = {
  onNudge: (callback: (payload: NudgePayload) => void) => () => void
  onReverseNudge: (callback: (payload: ReverseNudgePayload) => void) => () => void
  submitDevCoach: (payload: DevCoachSubmitPayload) => Promise<DevCoachEntry>
  dismiss: () => void
}

export type AnchorAPI = {
  getProfile: () => Promise<Profile | null>
  getSystemInfo: () => Promise<SystemInfo>
  startSession: (payload: SessionStartPayload) => Promise<SessionStartResult>
  endSession: (payload: SessionEndPayload) => Promise<SessionEndResult>
  getMemory: () => Promise<AgentMemory>
  getDevCoaching: () => Promise<DevCoachEntry[]>
  getSeerState: () => Promise<SeerState>
  stressTest: () => Promise<void>
  sendTrigger: (payload: TriggerPayload) => Promise<void>
  onNudge: (callback: (payload: NudgePayload) => void) => () => void
  onImagesReady: (callback: (payload: ImagesReadyPayload) => void) => () => void
  onVoiceReady: (callback: (payload: VoiceReadyPayload) => void) => () => void
  onDevCoachingSaved: (callback: (entry: DevCoachEntry) => void) => () => void
  onReverseNudge: (callback: (payload: ReverseNudgePayload) => void) => () => void
}

declare global {
  interface Window {
    anchor: AnchorAPI
    overlay: OverlayAPI
  }
}

export {}

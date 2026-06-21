export type MotivationMode = 'consequence' | 'reward'
export type TriggerType = 'slouch' | 'phone'

export type Profile = {
  userId: string
  interests: string[]
  modes: MotivationMode[]
  voicePreference?: string
}

export type TriggerPayload = {
  sessionId: string
  type: TriggerType
  mode: MotivationMode
  timestamp: number
}

export type NudgePayload = {
  type: TriggerType
  mode: MotivationMode
  imagePath?: string
  videoPath?: string
  quote: string
  audioPath?: string
}

export type SessionStartPayload = {
  taskIntent: string
}

export type FocusEvent = {
  eventId: string
  userId: string
  sessionId: string
  timestamp: number
  type: TriggerType | 'refocus'
  mode: MotivationMode
  recoveryMs: number | null
  assetServed: string
}

export type AnchorAPI = {
  getProfile: () => Promise<Profile | null>
  startSession: (payload: SessionStartPayload) => Promise<{ sessionId: string }>
  sendTrigger: (payload: TriggerPayload) => Promise<void>
  onNudge: (callback: (payload: NudgePayload) => void) => () => void
}

declare global {
  interface Window {
    anchor: AnchorAPI
  }
}

export {}

export const IPC_CHANNELS = {
  PROFILE_GET: 'profile:get',
  SESSION_START: 'session:start',
  TRIGGER_FIRE: 'trigger:fire',
  NUDGE_RECEIVE: 'nudge:receive'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

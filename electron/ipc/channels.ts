export const IPC_CHANNELS = {
  PROFILE_GET: 'profile:get',
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  MEMORY_GET: 'memory:get',
  TRIGGER_FIRE: 'trigger:fire',
  NUDGE_RECEIVE: 'nudge:receive',
  NUDGE_DISMISS: 'nudge:dismiss',
  IMAGES_READY: 'images:ready',
  VOICE_READY: 'voice:ready',
  SYSTEM_INFO: 'system:info'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

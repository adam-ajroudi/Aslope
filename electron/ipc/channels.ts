export const IPC_CHANNELS = {
  PROFILE_GET: 'profile:get',
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  MEMORY_GET: 'memory:get',
  TRIGGER_FIRE: 'trigger:fire',
  NUDGE_RECEIVE: 'nudge:receive',
  NUDGE_AUDIO_PLAY: 'nudge:audio:play',
  NUDGE_DISMISS: 'nudge:dismiss',
  IMAGES_READY: 'images:ready',
  VOICE_READY: 'voice:ready',
  REVERSE_NUDGE_RECEIVE: 'reverse-nudge:receive',
  DEV_COACH_SUBMIT: 'dev-coach:submit',
  DEV_COACHING_GET: 'dev-coaching:get',
  DEV_COACHING_SAVED: 'dev-coaching:saved',
  SEER_STATE_GET: 'seer:state:get',
  DEV_STRESS_TEST: 'dev:stress-test',
  SYSTEM_INFO: 'system:info'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

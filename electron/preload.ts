import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
import type { AgentMemory } from '@shared/agentMemory'
import type { DevCoachEntry } from '@shared/devCoaching'
import type {
  AnchorAPI,
  ImagesReadyPayload,
  NudgePayload,
  Profile,
  ReverseNudgePayload,
  SeerState,
  SessionEndPayload,
  SessionEndResult,
  SessionStartPayload,
  SessionStartResult,
  SystemInfo,
  TriggerPayload,
  VoiceReadyPayload
} from '@shared/types'

const anchorAPI: AnchorAPI = {
  getProfile: (): Promise<Profile | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),

  getSystemInfo: (): Promise<SystemInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_INFO),

  startSession: (payload: SessionStartPayload): Promise<SessionStartResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, payload),

  endSession: (payload: SessionEndPayload): Promise<SessionEndResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_END, payload),

  getMemory: (): Promise<AgentMemory> =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET),

  getDevCoaching: (): Promise<DevCoachEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DEV_COACHING_GET),

  getSeerState: (): Promise<SeerState> => ipcRenderer.invoke(IPC_CHANNELS.SEER_STATE_GET),

  stressTest: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.DEV_STRESS_TEST),

  sendTrigger: (payload: TriggerPayload): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_FIRE, payload),

  onNudge: (callback: (payload: NudgePayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: NudgePayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.NUDGE_RECEIVE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NUDGE_RECEIVE, handler)
    }
  },

  onReverseNudge: (callback: (payload: ReverseNudgePayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ReverseNudgePayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.REVERSE_NUDGE_RECEIVE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.REVERSE_NUDGE_RECEIVE, handler)
    }
  },

  onDevCoachingSaved: (callback: (entry: DevCoachEntry) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: DevCoachEntry): void => {
      callback(entry)
    }
    ipcRenderer.on(IPC_CHANNELS.DEV_COACHING_SAVED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DEV_COACHING_SAVED, handler)
    }
  },

  onImagesReady: (callback: (payload: ImagesReadyPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ImagesReadyPayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.IMAGES_READY, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IMAGES_READY, handler)
    }
  },

  onVoiceReady: (callback: (payload: VoiceReadyPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: VoiceReadyPayload): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.VOICE_READY, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.VOICE_READY, handler)
    }
  }
}

contextBridge.exposeInMainWorld('anchor', anchorAPI)

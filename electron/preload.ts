import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
import type {
  AgentMemory,
  AnchorAPI,
  ImagesReadyPayload,
  NudgePayload,
  Profile,
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

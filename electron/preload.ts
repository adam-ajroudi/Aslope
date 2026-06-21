import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
import type {
  AnchorAPI,
  NudgePayload,
  Profile,
  SessionStartPayload,
  TriggerPayload
} from '@shared/types'

const anchorAPI: AnchorAPI = {
  getProfile: (): Promise<Profile | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),

  startSession: (payload: SessionStartPayload): Promise<{ sessionId: string }> =>
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
  }
}

contextBridge.exposeInMainWorld('anchor', anchorAPI)

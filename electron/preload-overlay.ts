import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
import type { DevCoachEntry, DevCoachSubmitPayload, ReverseNudgePayload } from '@shared/devCoaching'
import type { NudgePayload, OverlayAPI } from '@shared/types'

const overlayAPI: OverlayAPI = {
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

  submitDevCoach: (payload: DevCoachSubmitPayload): Promise<DevCoachEntry> =>
    ipcRenderer.invoke(IPC_CHANNELS.DEV_COACH_SUBMIT, payload),

  dismiss: (): void => {
    ipcRenderer.send(IPC_CHANNELS.NUDGE_DISMISS)
  }
}

contextBridge.exposeInMainWorld('overlay', overlayAPI)

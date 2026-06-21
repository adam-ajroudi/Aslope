import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
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

  dismiss: (): void => {
    ipcRenderer.send(IPC_CHANNELS.NUDGE_DISMISS)
  }
}

contextBridge.exposeInMainWorld('overlay', overlayAPI)

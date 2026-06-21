import 'dotenv/config'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from './ipc/channels'
import { initSentryMain, Sentry } from './services/sentry'
import type { Profile, SessionStartPayload, TriggerPayload } from '@shared/types'

initSentryMain()

let mainWindow: BrowserWindow | null = null

const DEFAULT_PROFILE: Profile = {
  userId: 'local-user',
  interests: [],
  modes: ['reward', 'consequence']
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, () => {
    return Sentry.startSpan({ name: 'ipc.profile:get', op: 'ipc' }, () => DEFAULT_PROFILE)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_START, (_event, payload: SessionStartPayload) => {
    return Sentry.startSpan({ name: 'ipc.session:start', op: 'ipc' }, () => {
      const sessionId = uuidv4()
      console.log('[session:start]', { sessionId, taskIntent: payload.taskIntent })
      return { sessionId }
    })
  })

  ipcMain.handle(IPC_CHANNELS.TRIGGER_FIRE, async (_event, payload: TriggerPayload) => {
    await Sentry.startSpan({ name: 'ipc.trigger:fire', op: 'ipc' }, async () => {
      console.log('[trigger:fire]', payload)
      // M2+ will serve cached nudges; M0 is a no-op on the main side
    })
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

import 'dotenv/config'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { IPC_CHANNELS } from './ipc/channels'
import {
  clearSessionEvents,
  getSession,
  getSessionEvents,
  logTriggerEvent,
  saveSession,
  serveNudge,
  syncPrepToRedis
} from './pipelines/assetCache'
import { loadAgentMemory } from './services/agentMemory'
import { runPostSession } from './pipelines/postSession'
import { prepareSessionImages } from './pipelines/imageGeneration'
import { countQuotes } from './pipelines/prepFallback'
import { runSessionPrep } from './pipelines/sessionPrep'
import { synthesizeLiveQuote, startVoicePrep } from './pipelines/voicePrep'
import { registerNudgeProtocol, setupNudgeProtocol } from './services/assetProtocol'
import { isDeepgramConfigured } from './services/deepgram'
import { destroyOverlayWindow, hideOverlayWindow, showFullscreenNudge } from './overlayWindow'
import { disconnectRedis, isRedisReady } from './services/redis'
import { setupMediaPermissions } from './services/mediaPermissions'
import { initSentryMain, Sentry } from './services/sentry'
import { normalizeAssetUrl } from './services/resolveAsset'
import { isWsl } from './services/systemInfo'
import type { Profile, SessionEndPayload, SessionStartPayload, TriggerPayload } from '@shared/types'

initSentryMain()
registerNudgeProtocol()

let mainWindow: BrowserWindow | null = null

const DEFAULT_PROFILE: Profile = {
  userId: 'local-user',
  interests: []
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
    destroyOverlayWindow()
    mainWindow = null
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, () => {
    return Sentry.startSpan({ name: 'ipc.profile:get', op: 'ipc' }, () => DEFAULT_PROFILE)
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_INFO, async () => {
    return {
      isWsl: isWsl(),
      platform: process.platform,
      redisConnected: await isRedisReady()
    }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_START, async (_event, payload: SessionStartPayload) => {
    return Sentry.startSpan({ name: 'ipc.session:start', op: 'ipc' }, async () => {
      const sessionId = uuidv4()
      const startedAt = Date.now()

      const { prep, source } = await runSessionPrep({
        profile: DEFAULT_PROFILE,
        taskIntent: payload.taskIntent
      })

      const quoteCount = countQuotes(prep)
      syncPrepToRedis(DEFAULT_PROFILE.userId, prep)
      startVoicePrep(DEFAULT_PROFILE.userId, prep, mainWindow)

      const imageCount = await prepareSessionImages(
        DEFAULT_PROFILE.userId,
        prep.imagePrompts
      )

      void saveSession(sessionId, {
        userId: DEFAULT_PROFILE.userId,
        taskIntent: payload.taskIntent,
        startedAt,
        prepSource: source
      }).catch((err: unknown) => {
        console.error('[session:save] redis failed:', err)
      })

      console.log('[session:start]', {
        sessionId,
        taskIntent: payload.taskIntent,
        prepSource: source,
        quoteCount
      })

      return {
        sessionId,
        cacheSeeded: true,
        prepSource: source,
        quoteCount,
        imageCount,
        imagesPending: false,
        voicePending: isDeepgramConfigured()
      }
    })
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_END, async (_event, payload: SessionEndPayload) => {
    return Sentry.startSpan({ name: 'ipc.session:end', op: 'ipc' }, async () => {
      const endedAt = Date.now()
      const sessionData = await getSession(payload.sessionId)

      if (!sessionData) {
        throw new Error(`Session not found: ${payload.sessionId}`)
      }

      const events = await getSessionEvents(payload.sessionId)
      const { result, updatedMemory } = await runPostSession({
        profile: DEFAULT_PROFILE,
        session: {
          sessionId: payload.sessionId,
          userId: sessionData.userId,
          taskIntent: sessionData.taskIntent,
          startedAt: sessionData.startedAt,
          endedAt
        },
        events
      })

      clearSessionEvents(payload.sessionId)

      console.log('[session:end]', {
        sessionId: payload.sessionId,
        focusScore: result.focusScore,
        wins: result.wins.length,
        source: result.source
      })

      return { ...result, memory: updatedMemory }
    })
  })

  ipcMain.handle(IPC_CHANNELS.MEMORY_GET, async () => {
    return loadAgentMemory(DEFAULT_PROFILE.userId)
  })

  ipcMain.handle(IPC_CHANNELS.TRIGGER_FIRE, async (_event, payload: TriggerPayload) => {
    await Sentry.startSpan({ name: 'ipc.trigger:fire', op: 'ipc' }, async () => {
      console.log('[trigger:fire]', payload)

      let nudge = serveNudge(DEFAULT_PROFILE.userId, payload.type)

      if (!nudge.audioPath) {
        const liveAudio = await synthesizeLiveQuote(
          DEFAULT_PROFILE.userId,
          payload.type,
          nudge.quote
        )
        if (liveAudio) {
          nudge = { ...nudge, audioPath: liveAudio }
        }
      }

      if (nudge.imagePath) {
        nudge = { ...nudge, imagePath: normalizeAssetUrl(nudge.imagePath) }
      }

      showFullscreenNudge(nudge, mainWindow)
      mainWindow?.webContents.send(IPC_CHANNELS.NUDGE_RECEIVE, nudge)

      logTriggerEvent(DEFAULT_PROFILE.userId, {
        eventId: uuidv4(),
        sessionId: payload.sessionId,
        timestamp: payload.timestamp,
        type: payload.type,
        assetServed: nudge.imagePath ?? 'unknown',
        quote: nudge.quote
      })
    })
  })

  ipcMain.on(IPC_CHANNELS.NUDGE_DISMISS, () => {
    hideOverlayWindow()
  })
}

app.whenReady().then(() => {
  setupNudgeProtocol()
  setupMediaPermissions()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  void disconnectRedis()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void disconnectRedis().finally(() => app.quit())
  }
})

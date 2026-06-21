import 'dotenv/config'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { SeerBanterEvent } from '@shared/seer'
import { loadDevCoaching, saveDevCoaching } from './services/devCoaching'
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
import type { Profile, SessionEndPayload, SessionStartPayload, TriggerPayload } from '@shared/types'
import { generateSeerComeback } from './pipelines/seerComeback'
import {
  appendSeerBanterEvent,
  evolveRelationshipAfterCoach,
  getSeerVibeLabel,
  loadSeerRelationship,
  saveSeerRelationship
} from './services/seer'
import { registerReverseNudgeDelivery } from './services/reverseNudge'
import { destroyOverlayWindow, hideOverlayWindow, showFullscreenNudge, showFullscreenReverseNudge } from './overlayWindow'
import { disconnectRedis, isRedisReady } from './services/redis'
import { setupMediaPermissions } from './services/mediaPermissions'
import { initSentryMain, Sentry } from './services/sentry'
import { normalizeAssetUrl } from './services/resolveAsset'
import { isWsl } from './services/systemInfo'
import type { DevCoachEntry, DevCoachSubmitPayload, ReverseNudgePayload } from '@shared/devCoaching'

initSentryMain()
registerNudgeProtocol()

let mainWindow: BrowserWindow | null = null

const pendingIncidents = new Map<string, ReverseNudgePayload>()

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

function deliverReverseNudge(payload: ReverseNudgePayload): void {
  pendingIncidents.set(payload.incidentId, payload)
  showFullscreenReverseNudge(payload, mainWindow)
  mainWindow?.webContents.send(IPC_CHANNELS.REVERSE_NUDGE_RECEIVE, payload)
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

  ipcMain.handle(IPC_CHANNELS.DEV_COACHING_GET, async () => {
    return loadDevCoaching(DEFAULT_PROFILE.userId)
  })

  ipcMain.handle(IPC_CHANNELS.SEER_STATE_GET, async () => {
    const relationship = await loadSeerRelationship(DEFAULT_PROFILE.userId)
    return {
      relationship,
      vibeLabel: getSeerVibeLabel(relationship.vibe)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DEV_COACH_SUBMIT, async (_event, payload: DevCoachSubmitPayload) => {
    console.log('[seer:coach] submit', payload.incidentId)

    const incident = pendingIncidents.get(payload.incidentId)
    if (!incident) {
      console.error('[seer:coach] incident missing', payload.incidentId)
      throw new Error(`Incident not found: ${payload.incidentId}`)
    }

    const userId = DEFAULT_PROFILE.userId
    const relationship = await loadSeerRelationship(userId)
    const { comeback: seerComeback, source } = await generateSeerComeback({
      relationship,
      userCoachMessage: payload.coachMessage,
      component: incident.component,
      errorMessage: incident.errorMessage
    })

    const updatedRelationship = evolveRelationshipAfterCoach(
      relationship,
      payload.coachMessage,
      seerComeback
    )

    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      incidentId: incident.incidentId,
      errorMessage: incident.errorMessage,
      component: incident.component,
      plea: incident.plea,
      coachMessage: payload.coachMessage,
      seerComeback,
      seerVibe: updatedRelationship.vibe,
      vibeLabel: getSeerVibeLabel(updatedRelationship.vibe),
      banterIndex: updatedRelationship.interactionCount
    }

    pendingIncidents.delete(payload.incidentId)

    void (async () => {
      try {
        await saveSeerRelationship(updatedRelationship)
        await saveDevCoaching(userId, entry)
        const banterEvent: SeerBanterEvent = {
          id: uuidv4(),
          incidentId: incident.incidentId,
          timestamp: entry.timestamp,
          vibe: updatedRelationship.vibe,
          banterIndex: updatedRelationship.interactionCount,
          component: incident.component,
          errorMessage: incident.errorMessage,
          seerLine: incident.plea,
          userCoach: payload.coachMessage,
          seerComeback
        }
        await appendSeerBanterEvent(userId, banterEvent)

        Sentry.withScope((scope) => {
          scope.setTag('human_coach_note', payload.coachMessage)
          scope.setTag('seer_vibe', updatedRelationship.vibe)
          scope.setTag('seer_banter_index', String(updatedRelationship.interactionCount))
          scope.setTag('component', incident.component)
          scope.setContext('seer_banter', {
            friendship: getSeerVibeLabel(updatedRelationship.vibe),
            banterIndex: updatedRelationship.interactionCount,
            seerLine: incident.plea,
            userCoach: payload.coachMessage,
            seerComeback,
            insideReferences: updatedRelationship.insideReferences
          })
          scope.setContext('dev_coaching', {
            incidentId: incident.incidentId,
            errorMessage: incident.errorMessage,
            coachMessage: payload.coachMessage,
            seerComeback
          })
          Sentry.captureMessage(`Seer banter: ${seerComeback}`, 'info')
        })

        mainWindow?.webContents.send(IPC_CHANNELS.DEV_COACHING_SAVED, entry)
        console.log('[seer:banter] persisted', {
          incidentId: incident.incidentId,
          vibe: updatedRelationship.vibe,
          source
        })
      } catch (err) {
        console.error('[seer:banter] persist failed:', err)
      }
    })()

    console.log('[seer:coach] reply ready', { source, vibe: updatedRelationship.vibe })
    return entry
  })

  ipcMain.handle(IPC_CHANNELS.DEV_STRESS_TEST, async () => {
    Sentry.withScope((scope) => {
      scope.setTag('component', 'redis-bridge')
      Sentry.captureException(
        new Error('Redis went for a walk without telling anyone (demo stress test)')
      )
    })
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
  registerReverseNudgeDelivery(deliverReverseNudge)
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

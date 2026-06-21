import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type { ReverseNudgePayload } from '@shared/devCoaching'
import { IPC_CHANNELS } from './ipc/channels'
import type { NudgePayload } from '@shared/types'

let overlayWindow: BrowserWindow | null = null
let pendingNudge: NudgePayload | null = null
let pendingReverseNudge: ReverseNudgePayload | null = null

function getTargetDisplay(anchor?: BrowserWindow | null) {
  if (anchor && !anchor.isDestroyed()) {
    return screen.getDisplayMatching(anchor.getBounds())
  }
  return screen.getPrimaryDisplay()
}

function positionOverlay(win: BrowserWindow, anchor?: BrowserWindow | null): void {
  const { bounds } = getTargetDisplay(anchor)
  win.setBounds(bounds)
}

function deliverWhenReady(
  win: BrowserWindow,
  deliver: () => void
): void {
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) deliver()
    })
    return
  }

  deliver()
}

function deliverNudge(win: BrowserWindow, nudge: NudgePayload): void {
  deliverWhenReady(win, () => {
    win.webContents.send(IPC_CHANNELS.NUDGE_RECEIVE, nudge)
  })
}

function deliverReverseNudge(win: BrowserWindow, payload: ReverseNudgePayload): void {
  deliverWhenReady(win, () => {
    win.webContents.send(IPC_CHANNELS.REVERSE_NUDGE_RECEIVE, payload)
  })
}

function createOverlayWindow(anchor?: BrowserWindow | null): BrowserWindow {
  const display = getTargetDisplay(anchor)
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  win.webContents.on('did-finish-load', () => {
    if (pendingNudge && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.NUDGE_RECEIVE, pendingNudge)
      pendingNudge = null
    }
    if (pendingReverseNudge && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.REVERSE_NUDGE_RECEIVE, pendingReverseNudge)
      pendingReverseNudge = null
    }
  })

  win.on('closed', () => {
    if (overlayWindow === win) {
      overlayWindow = null
    }
  })

  return win
}

export function ensureOverlayWindow(anchor?: BrowserWindow | null): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    positionOverlay(overlayWindow, anchor)
    return overlayWindow
  }

  overlayWindow = createOverlayWindow(anchor)
  return overlayWindow
}

export function showFullscreenNudge(nudge: NudgePayload, anchor?: BrowserWindow | null): void {
  const win = ensureOverlayWindow(anchor)
  positionOverlay(win, anchor)
  pendingReverseNudge = null

  if (win.webContents.isLoading()) {
    pendingNudge = nudge
  } else {
    deliverNudge(win, nudge)
  }

  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  win.focus()
}

export function showFullscreenReverseNudge(
  payload: ReverseNudgePayload,
  anchor?: BrowserWindow | null
): void {
  const win = ensureOverlayWindow(anchor)
  positionOverlay(win, anchor)
  pendingNudge = null

  if (win.webContents.isLoading()) {
    pendingReverseNudge = payload
  } else {
    deliverReverseNudge(win, payload)
  }

  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  win.focus()
}

export function hideOverlayWindow(): void {
  pendingNudge = null
  pendingReverseNudge = null
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

export function destroyOverlayWindow(): void {
  pendingNudge = null
  pendingReverseNudge = null
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

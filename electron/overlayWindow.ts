import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from './ipc/channels'
import type { NudgePayload } from '@shared/types'

let overlayWindow: BrowserWindow | null = null
let pendingNudge: NudgePayload | null = null

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

function deliverNudge(win: BrowserWindow, nudge: NudgePayload): void {
  if (win.webContents.isLoading()) {
    pendingNudge = nudge
    win.webContents.once('did-finish-load', () => {
      if (pendingNudge && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.NUDGE_RECEIVE, pendingNudge)
        pendingNudge = null
      }
    })
    return
  }

  win.webContents.send(IPC_CHANNELS.NUDGE_RECEIVE, nudge)
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
  win.setAlwaysOnTop(true, 'screen-saver')
  deliverNudge(win, nudge)
  win.show()
  win.focus()
}

export function hideOverlayWindow(): void {
  pendingNudge = null
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

export function destroyOverlayWindow(): void {
  pendingNudge = null
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

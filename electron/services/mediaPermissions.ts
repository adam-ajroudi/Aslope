import { session, type BrowserWindow } from 'electron'

export function setupMediaPermissions(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true)
      return
    }
    callback(false)
  })

  ses.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'mediaKeySystem'
  })
}

export function configureWindowAudio(win: BrowserWindow): void {
  if (win.isDestroyed()) return

  win.webContents.setAudioMuted(false)
  win.webContents.setBackgroundThrottling(false)
}

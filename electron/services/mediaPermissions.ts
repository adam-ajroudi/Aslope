import { session } from 'electron'

export function setupMediaPermissions(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })

  ses.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media'
  })
}

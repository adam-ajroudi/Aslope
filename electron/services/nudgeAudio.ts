import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../ipc/channels'
import { nudgeUrlToPath } from './assetProtocol'

let activePlayer: ChildProcess | null = null

function resolveAudioFilePath(audioPath: string): string | null {
  if (audioPath.startsWith('nudge://')) {
    return nudgeUrlToPath(audioPath)
  }

  if (/^[A-Za-z]:[\\/]/.test(audioPath) || audioPath.startsWith('/')) {
    return audioPath
  }

  return null
}

function escapePsSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function playViaWindowsMediaPlayer(filePath: string): void {
  if (activePlayer && !activePlayer.killed) {
    activePlayer.kill()
    activePlayer = null
  }

  const safePath = escapePsSingleQuoted(filePath)
  const script = [
    `$wmp = New-Object -ComObject WMPlayer.OCX`,
    `$wmp.URL = '${safePath}'`,
    `$wmp.controls.play()`,
    `Start-Sleep -Milliseconds 500`,
    `while ($wmp.playState -eq 3) { Start-Sleep -Milliseconds 200 }`,
    `Start-Sleep -Milliseconds 300`,
    `$wmp.close()`
  ].join('; ')

  activePlayer = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    { detached: true, stdio: 'ignore', windowsHide: true }
  )

  activePlayer.unref()
  activePlayer.on('exit', () => {
    activePlayer = null
  })

  console.log('[nudge:audio] system playback started', filePath)
}

function playViaRenderer(audioPath: string, mainWindow: BrowserWindow | null): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[nudge:audio] main window unavailable for renderer playback')
    return
  }

  mainWindow.webContents.send(IPC_CHANNELS.NUDGE_AUDIO_PLAY, { audioPath })
  console.log('[nudge:audio] renderer playback requested', audioPath)
}

export function playNudgeAudio(audioPath: string | undefined, mainWindow: BrowserWindow | null): void {
  if (!audioPath) return

  const filePath = resolveAudioFilePath(audioPath)
  if (!filePath || !existsSync(filePath)) {
    console.warn('[nudge:audio] file missing:', audioPath, filePath)
    return
  }

  if (process.platform === 'win32') {
    playViaWindowsMediaPlayer(filePath)
    return
  }

  playViaRenderer(audioPath, mainWindow)
}

export function stopNudgeAudio(): void {
  if (activePlayer && !activePlayer.killed) {
    activePlayer.kill()
    activePlayer = null
  }
}

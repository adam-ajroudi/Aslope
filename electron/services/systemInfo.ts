import { readFileSync } from 'fs'

export function isWsl(): boolean {
  if (process.platform !== 'linux') return false

  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

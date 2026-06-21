import { useCallback, useEffect, useState } from 'react'
import { NudgeOverlay } from '../components/NudgeOverlay'
import type { NudgePayload } from '@shared/types'

export function OverlayApp(): React.ReactElement {
  const [nudge, setNudge] = useState<NudgePayload | null>(null)

  useEffect(() => {
    if (!window.overlay) {
      console.warn('Overlay IPC bridge not available')
      return
    }

    return window.overlay.onNudge((payload) => {
      setNudge(payload)
    })
  }, [])

  const dismiss = useCallback(() => {
    setNudge(null)
    window.overlay?.dismiss()
  }, [])

  return <NudgeOverlay nudge={nudge} onDismiss={dismiss} fullscreen />
}

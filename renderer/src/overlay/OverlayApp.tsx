import { useCallback, useEffect, useState } from 'react'
import { NudgeOverlay } from '../components/NudgeOverlay'
import { ReverseNudgeOverlay } from '../components/ReverseNudgeOverlay'
import type { DevCoachSubmitPayload, ReverseNudgePayload } from '@shared/devCoaching'
import type { NudgePayload } from '@shared/types'

export function OverlayApp(): React.ReactElement {
  const [nudge, setNudge] = useState<NudgePayload | null>(null)
  const [reverseNudge, setReverseNudge] = useState<ReverseNudgePayload | null>(null)

  useEffect(() => {
    if (!window.overlay) {
      console.warn('Overlay IPC bridge not available')
      return
    }

    const unsubNudge = window.overlay.onNudge((payload) => {
      setReverseNudge(null)
      setNudge(payload)
    })

    const unsubReverse = window.overlay.onReverseNudge((payload) => {
      setNudge(null)
      setReverseNudge(payload)
    })

    return () => {
      unsubNudge()
      unsubReverse()
    }
  }, [])

  const dismiss = useCallback(() => {
    setNudge(null)
    setReverseNudge(null)
    window.overlay?.dismiss()
  }, [])

  const submitCoach = useCallback(async (payload: DevCoachSubmitPayload) => {
    return window.overlay!.submitDevCoach(payload)
  }, [])

  if (reverseNudge) {
    return (
      <ReverseNudgeOverlay
        incident={reverseNudge}
        onSubmit={submitCoach}
        onDismiss={dismiss}
        fullscreen
      />
    )
  }

  return <NudgeOverlay nudge={nudge} onDismiss={dismiss} fullscreen />
}

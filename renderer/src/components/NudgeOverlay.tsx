import { useEffect, useRef } from 'react'
import type { NudgePayload } from '@shared/types'
import './NudgeOverlay.css'

const DISMISS_MS = 8000

type NudgeOverlayProps = {
  nudge: NudgePayload | null
  onDismiss: () => void
  fullscreen?: boolean
}

export function NudgeOverlay({
  nudge,
  onDismiss,
  fullscreen = false
}: NudgeOverlayProps): React.ReactElement | null {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!nudge) return

    const timer = window.setTimeout(onDismiss, DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [nudge, onDismiss])

  useEffect(() => {
    if (!nudge?.audioPath) return

    const audio = new Audio(nudge.audioPath)
    audioRef.current = audio
    void audio.play().catch((err: unknown) => {
      console.warn('[nudge:audio] playback failed:', err)
    })

    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [nudge])

  if (!nudge) return null

  const imageSrc = nudge.imagePath?.startsWith('nudge://') ? nudge.imagePath : undefined
  const typeLabel = nudge.type === 'slouch' ? 'Posture' : 'Phone'

  return (
    <div
      className={`nudge-overlay ${fullscreen ? 'nudge-overlay--fullscreen' : ''}`}
      role="dialog"
      aria-label={`${typeLabel} coaching nudge`}
      onClick={onDismiss}
    >
      <div className={`nudge-card ${fullscreen ? 'nudge-card--fullscreen' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="nudge-header">
          <span className="nudge-type">{typeLabel}</span>
          {nudge.audioPath && <span className="nudge-voice">Speaking…</span>}
        </header>

        {imageSrc && (
          <img className="nudge-image" src={imageSrc} alt="" />
        )}

        <p className="nudge-quote">&ldquo;{nudge.quote}&rdquo;</p>

        <button type="button" className="nudge-dismiss" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  )
}

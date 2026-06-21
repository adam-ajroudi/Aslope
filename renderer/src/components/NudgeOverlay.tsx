import { useEffect } from 'react'
import type { NudgeModality, NudgePayload } from '@shared/types'
import './NudgeOverlay.css'

const DISMISS_MS = 8000

type NudgeOverlayProps = {
  nudge: NudgePayload | null
  onDismiss: () => void
  fullscreen?: boolean
}

function resolveImageSrc(imagePath: string | undefined): string | undefined {
  if (!imagePath) return undefined
  if (
    imagePath.startsWith('nudge://') ||
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://')
  ) {
    return imagePath
  }
  if (imagePath.startsWith('nudges/')) {
    return `/${imagePath}`
  }
  return undefined
}

const MODALITY_LABEL: Record<NudgeModality, string> = {
  quote: 'Coach line',
  image: 'Visual nudge',
  voice: 'Voice coach'
}

export function NudgeOverlay({
  nudge,
  onDismiss,
  fullscreen = false
}: NudgeOverlayProps): React.ReactElement | null {
  useEffect(() => {
    if (!nudge) return

    const timer = window.setTimeout(onDismiss, DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [nudge, onDismiss])

  if (!nudge) return null

  const modality = nudge.modality ?? 'quote'
  const imageSrc = modality === 'image' ? resolveImageSrc(nudge.imagePath) : undefined
  const typeLabel = nudge.type === 'slouch' ? 'Posture' : 'Phone'
  const showQuote = modality === 'quote'
  const showVoiceHint = modality === 'voice'

  return (
    <div
      className={`nudge-overlay ${fullscreen ? 'nudge-overlay--fullscreen' : ''}`}
      role="dialog"
      aria-label={`${typeLabel} coaching nudge`}
      onClick={onDismiss}
    >
      <div
        className={`nudge-card ${fullscreen ? 'nudge-card--fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nudge-header">
          <span className="nudge-type">{typeLabel}</span>
          <span className="nudge-modality">{MODALITY_LABEL[modality]}</span>
          {showVoiceHint && <span className="nudge-voice">Speaking…</span>}
        </header>

        {imageSrc && (
          <img
            className="nudge-image"
            src={imageSrc}
            alt=""
            onError={() => console.warn('[nudge:image] load failed:', imageSrc)}
          />
        )}

        {showQuote && <p className="nudge-quote">&ldquo;{nudge.quote}&rdquo;</p>}

        {showVoiceHint && !nudge.audioPath && (
          <p className="nudge-quote nudge-quote--muted">Voice line loading…</p>
        )}

        <button type="button" className="nudge-dismiss" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { DevCoachEntry, DevCoachSubmitPayload, ReverseNudgePayload } from '@shared/devCoaching'
import './ReverseNudgeOverlay.css'

type ReverseNudgeOverlayProps = {
  incident: ReverseNudgePayload | null
  onSubmit: (payload: DevCoachSubmitPayload) => Promise<DevCoachEntry>
  onDismiss: () => void
  fullscreen?: boolean
}

export function ReverseNudgeOverlay({
  incident,
  onSubmit,
  onDismiss,
  fullscreen = false
}: ReverseNudgeOverlayProps): React.ReactElement | null {
  const [coachMessage, setCoachMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [seerReply, setSeerReply] = useState<DevCoachEntry | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    setCoachMessage('')
    setSubmitting(false)
    setSeerReply(null)
    setSubmitError(null)
  }, [incident?.incidentId])

  const handleSubmit = useCallback(async () => {
    if (!incident || !coachMessage.trim() || submitting) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const entry = await onSubmit({
        incidentId: incident.incidentId,
        coachMessage: coachMessage.trim()
      })
      setSeerReply(entry)
    } catch (err) {
      console.error('[seer:overlay] submit failed:', err)
      setSubmitError('Seer zoned out — try again or hit Ignore.')
    } finally {
      setSubmitting(false)
    }
  }, [coachMessage, incident, onSubmit, submitting])

  useEffect(() => {
    if (!seerReply) return
    const timer = window.setTimeout(onDismiss, 4500)
    return () => window.clearTimeout(timer)
  }, [seerReply, onDismiss])

  if (!incident) return null

  if (seerReply) {
    return (
      <div
        className={`reverse-nudge-overlay ${fullscreen ? 'reverse-nudge-overlay--fullscreen' : ''}`}
        role="dialog"
        aria-label="Seer replies"
      >
        <div
          className={`reverse-nudge-card reverse-nudge-card--reply ${fullscreen ? 'reverse-nudge-card--fullscreen' : ''}`}
        >
          <header className="reverse-nudge-header">
            <span className="reverse-nudge-badge">Seer</span>
            <span className="reverse-nudge-vibe">{seerReply.vibeLabel}</span>
          </header>
          <p className="reverse-nudge-reply">&ldquo;{seerReply.seerComeback}&rdquo;</p>
          <p className="reverse-nudge-reply-hint">Friendship level up. Back to work.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`reverse-nudge-overlay ${fullscreen ? 'reverse-nudge-overlay--fullscreen' : ''}`}
      role="dialog"
      aria-label="Seer needs coaching"
    >
      <div
        className={`reverse-nudge-card ${fullscreen ? 'reverse-nudge-card--fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="reverse-nudge-header">
          <span className="reverse-nudge-badge">Seer</span>
          <span className="reverse-nudge-vibe">{incident.vibeLabel}</span>
        </header>

        <p className="reverse-nudge-plea">&ldquo;{incident.plea}&rdquo;</p>

        <p className="reverse-nudge-error">
          <span className="reverse-nudge-error-label">Sentry caught:</span> {incident.errorMessage}
          <span className="reverse-nudge-component-tag">{incident.component}</span>
        </p>

        <label className="reverse-nudge-label" htmlFor="coach-message">
          Coach Seer back
        </label>
        <textarea
          id="coach-message"
          className="reverse-nudge-input"
          rows={3}
          placeholder="Talk your observant fish-tank friend off the ledge…"
          value={coachMessage}
          onChange={(e) => setCoachMessage(e.target.value)}
          disabled={submitting}
        />

        {submitError && <p className="reverse-nudge-error-msg">{submitError}</p>}

        <div className="reverse-nudge-actions">
          <button
            type="button"
            className="reverse-nudge-submit"
            onClick={() => void handleSubmit()}
            disabled={submitting || !coachMessage.trim()}
          >
            {submitting ? 'Seer is listening…' : 'Banter back'}
          </button>
          <button
            type="button"
            className="reverse-nudge-skip"
            onClick={onDismiss}
            disabled={submitting}
          >
            Ignore Seer
          </button>
        </div>
      </div>
    </div>
  )
}

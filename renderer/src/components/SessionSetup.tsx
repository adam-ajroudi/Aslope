import { useCallback, useState } from 'react'
import type { TriggerType } from '@shared/types'
import './SessionSetup.css'

type SessionSetupProps = {
  sessionId: string | null
  cacheSeeded: boolean
  prepSource: 'claude' | 'fallback' | null
  quoteCount: number
  imageCount: number
  voicePending: boolean
  audioCount: number
  preparing: boolean
  onSessionStart: (taskIntent: string) => Promise<void>
  onSessionEnd: () => Promise<void>
  onTrigger: (type: TriggerType) => Promise<void>
  ending: boolean
  busy: boolean
}

export function SessionSetup({
  sessionId,
  cacheSeeded,
  prepSource,
  quoteCount,
  imageCount,
  voicePending,
  audioCount,
  preparing,
  onSessionStart,
  onSessionEnd,
  onTrigger,
  ending,
  busy
}: SessionSetupProps): React.ReactElement {
  const [taskIntent, setTaskIntent] = useState('Writing my thesis intro')

  const handleStart = useCallback(() => {
    void onSessionStart(taskIntent.trim() || 'Focus session')
  }, [onSessionStart, taskIntent])

  const fireTrigger = useCallback(
    (type: TriggerType) => {
      if (!sessionId || busy) return
      void onTrigger(type)
    },
    [busy, onTrigger, sessionId]
  )

  return (
    <section className="session-setup">
      <h2>Session</h2>

      {!sessionId ? (
        <>
          <label className="session-label" htmlFor="task-intent">
            Task intent
          </label>
          <input
            id="task-intent"
            className="session-input"
            type="text"
            value={taskIntent}
            onChange={(e) => setTaskIntent(e.target.value)}
            placeholder="What are you working on?"
            disabled={preparing}
          />
          <button
            type="button"
            className="session-btn session-btn--primary"
            onClick={handleStart}
            disabled={busy || preparing}
          >
            {preparing ? 'Prepping coaching + images…' : 'Start session'}
          </button>
        </>
      ) : (
        <>
          <p className="session-active">Session active</p>
          <p className="session-id">{sessionId.slice(0, 8)}…</p>
          <p className={`session-cache ${prepSource === 'claude' ? 'session-cache--ok' : 'session-cache--fallback'}`}>
            Coaching: {prepSource === 'claude' ? `Claude (${quoteCount} lines)` : 'local fallback'}
          </p>
          <p className={`session-cache ${cacheSeeded ? 'session-cache--ok' : 'session-cache--fallback'}`}>
            Cache: ready {cacheSeeded ? '(syncing to Redis)' : ''}
          </p>
          <p className={`session-cache ${audioCount > 0 ? 'session-cache--ok' : voicePending ? 'session-cache--fallback' : ''}`}>
            Voice:{' '}
            {voicePending && audioCount === 0
              ? 'Deepgram synthesizing…'
              : audioCount > 0
                ? `${audioCount} clips ready`
                : 'text only (no Deepgram key)'}
          </p>
          <p className={`session-cache ${imageCount > 0 ? 'session-cache--ok' : 'session-cache--ok'}`}>
            Images:{' '}
            {imageCount > 0
              ? `${imageCount} Midjourney + placeholders`
              : 'placeholders ready'}
          </p>

          <p className="session-hint">
            Auto-detects slouch (Dorso-style) + phone (YOLO26). Manual fallback:
          </p>
          <div className="session-triggers">
            <button
              type="button"
              className="session-btn"
              onClick={() => fireTrigger('slouch')}
              disabled={busy || ending}
            >
              Slouch
            </button>
            <button
              type="button"
              className="session-btn"
              onClick={() => fireTrigger('phone')}
              disabled={busy || ending}
            >
              Phone
            </button>
          </div>

          <button
            type="button"
            className="session-btn session-btn--end"
            onClick={() => void onSessionEnd()}
            disabled={busy || ending}
          >
            {ending ? 'Analyzing session…' : 'End session'}
          </button>
        </>
      )}
    </section>
  )
}

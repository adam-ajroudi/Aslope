import { useCallback, useEffect, useState } from 'react'
import { SessionSetup } from './components/SessionSetup'
import { WebcamFeed } from './components/WebcamFeed'
import type { Profile, TriggerType } from '@shared/types'

export default function App(): React.ReactElement {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ipcReady, setIpcReady] = useState(false)
  const [redisConnected, setRedisConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cacheSeeded, setCacheSeeded] = useState(false)
  const [prepSource, setPrepSource] = useState<'claude' | 'fallback' | null>(null)
  const [quoteCount, setQuoteCount] = useState(0)
  const [sessionPreparing, setSessionPreparing] = useState(false)
  const [triggerBusy, setTriggerBusy] = useState(false)
  const [lastTrigger, setLastTrigger] = useState<string | null>(null)
  const [lastQuote, setLastQuote] = useState<string | null>(null)
  const [imageCount, setImageCount] = useState(0)
  const [voicePending, setVoicePending] = useState(false)
  const [audioCount, setAudioCount] = useState(0)

  useEffect(() => {
    if (!window.anchor) {
      console.warn('Anchor IPC bridge not available (running outside Electron?)')
      return
    }

    setIpcReady(true)

    window.anchor
      .getProfile()
      .then(setProfile)
      .catch((err: unknown) => {
        console.error('Failed to load profile:', err)
      })

    window.anchor
      .getSystemInfo()
      .then((info) => setRedisConnected(info.redisConnected))
      .catch((err: unknown) => {
        console.error('Failed to load system info:', err)
      })

    const unsubscribeNudge = window.anchor.onNudge((payload) => {
      console.log('[nudge:receive]', payload)
      setTriggerBusy(false)
      setLastTrigger(payload.type)
      setLastQuote(payload.quote)
    })

    const unsubscribeImages = window.anchor.onImagesReady((payload) => {
      console.log('[images:ready]', payload)
      setImageCount(payload.imageCount)
    })

    const unsubscribeVoice = window.anchor.onVoiceReady((payload) => {
      console.log('[voice:ready]', payload)
      setVoicePending(false)
      setAudioCount(payload.audioCount)
    })

    return () => {
      unsubscribeNudge()
      unsubscribeImages()
      unsubscribeVoice()
    }
  }, [])

  const handleSessionStart = useCallback(async (taskIntent: string) => {
    if (!window.anchor) return

    setSessionPreparing(true)

    try {
      const result = await window.anchor.startSession({ taskIntent })
      setSessionId(result.sessionId)
      setCacheSeeded(result.cacheSeeded)
      setPrepSource(result.prepSource)
      setQuoteCount(result.quoteCount)
      setImageCount(result.imageCount)
      setVoicePending(result.voicePending)
      setAudioCount(0)
      setLastTrigger(null)
      setLastQuote(null)

      const info = await window.anchor.getSystemInfo()
      setRedisConnected(info.redisConnected)

      console.log('[session:active]', result)
    } finally {
      setSessionPreparing(false)
    }
  }, [])

  const handleTrigger = useCallback(
    async (type: TriggerType) => {
      if (!window.anchor || !sessionId || triggerBusy) return

      setTriggerBusy(true)

      try {
        await window.anchor.sendTrigger({
          sessionId,
          type,
          timestamp: Date.now()
        })
      } catch (err) {
        console.error('Trigger failed:', err)
        setTriggerBusy(false)
      }
    },
    [sessionId, triggerBusy]
  )

  return (
    <div className="app">
      <header className="app-header">
        <h1>Anchor Vision</h1>
        <p className="app-subtitle">Camera-driven focus coach</p>
      </header>

      <main className="app-main">
        <div className="app-stage">
          <WebcamFeed />
        </div>

        <aside className="app-sidebar">
          <div className="info-card">
            <SessionSetup
              sessionId={sessionId}
              cacheSeeded={cacheSeeded}
              prepSource={prepSource}
              quoteCount={quoteCount}
              imageCount={imageCount}
              voicePending={voicePending}
              audioCount={audioCount}
              preparing={sessionPreparing}
              onSessionStart={handleSessionStart}
              onTrigger={handleTrigger}
              busy={triggerBusy}
            />
          </div>

          <div className="info-card">
            <h2>Status</h2>
            <dl>
              <dt>Milestone</dt>
              <dd>M6 — Voice coaching</dd>
              <dt>IPC bridge</dt>
              <dd>{ipcReady ? 'Connected' : 'Unavailable'}</dd>
              <dt>Redis</dt>
              <dd>{redisConnected ? 'Connected' : 'Memory fallback'}</dd>
              <dt>Profile</dt>
              <dd>{profile ? profile.userId : 'Loading…'}</dd>
              <dt>Coaching</dt>
              <dd>
                {prepSource === 'claude'
                  ? `Claude (${quoteCount} lines)`
                  : prepSource === 'fallback'
                    ? 'Local fallback'
                    : '—'}
              </dd>
              <dt>Voice</dt>
              <dd>
                {voicePending && audioCount === 0
                  ? 'Deepgram synthesizing…'
                  : audioCount > 0
                    ? `${audioCount} clips`
                    : 'Text only'}
              </dd>
              <dt>Images</dt>
              <dd>
                {imageCount > 0
                  ? `${imageCount} Midjourney`
                  : 'Placeholders ready'}
              </dd>
              <dt>Last trigger</dt>
              <dd>{lastTrigger ?? '—'}</dd>
              <dt>Last quote</dt>
              <dd className="status-quote">{lastQuote ?? '—'}</dd>
            </dl>
          </div>
        </aside>
      </main>
    </div>
  )
}

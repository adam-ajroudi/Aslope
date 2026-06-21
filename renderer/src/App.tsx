import { useCallback, useEffect, useState } from 'react'
import { DevCoachPanel } from './components/DevCoachPanel'
import { NudgeAudioPlayer } from './components/NudgeAudioPlayer'
import { SessionDashboard } from './components/SessionDashboard'
import { SessionSetup } from './components/SessionSetup'
import { WebcamFeed } from './components/WebcamFeed'
import type { AgentMemory, PostSessionResult } from '@shared/agentMemory'
import type { DevCoachEntry } from '@shared/devCoaching'
import type { Profile, SeerState, TriggerType } from '@shared/types'

export default function App(): React.ReactElement {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ipcReady, setIpcReady] = useState(false)
  const [redisConnected, setRedisConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cacheSeeded, setCacheSeeded] = useState(false)
  const [prepSource, setPrepSource] = useState<'claude' | 'fallback' | null>(null)
  const [quoteCount, setQuoteCount] = useState(0)
  const [sessionPreparing, setSessionPreparing] = useState(false)
  const [sessionEnding, setSessionEnding] = useState(false)
  const [triggerBusy, setTriggerBusy] = useState(false)
  const [lastTrigger, setLastTrigger] = useState<string | null>(null)
  const [lastQuote, setLastQuote] = useState<string | null>(null)
  const [imageCount, setImageCount] = useState(0)
  const [voicePending, setVoicePending] = useState(false)
  const [audioCount, setAudioCount] = useState(0)
  const [postSession, setPostSession] = useState<PostSessionResult | null>(null)
  const [memory, setMemory] = useState<AgentMemory | null>(null)
  const [devCoaching, setDevCoaching] = useState<DevCoachEntry[]>([])
  const [seerState, setSeerState] = useState<SeerState | null>(null)
  const [stressTesting, setStressTesting] = useState(false)

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
      .getMemory()
      .then(setMemory)
      .catch((err: unknown) => {
        console.error('Failed to load memory:', err)
      })

    window.anchor
      .getSeerState()
      .then(setSeerState)
      .catch((err: unknown) => {
        console.error('Failed to load Seer state:', err)
      })

    window.anchor
      .getDevCoaching()
      .then(setDevCoaching)
      .catch((err: unknown) => {
        console.error('Failed to load dev coaching:', err)
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

    const unsubscribeDevCoach = window.anchor.onDevCoachingSaved((entry) => {
      setDevCoaching((prev) => [entry, ...prev].slice(0, 20))
      void window.anchor?.getSeerState().then(setSeerState)
    })

    return () => {
      unsubscribeNudge()
      unsubscribeImages()
      unsubscribeVoice()
      unsubscribeDevCoach()
    }
  }, [])

  const handleSessionStart = useCallback(async (taskIntent: string) => {
    if (!window.anchor) return

    setSessionPreparing(true)
    setPostSession(null)

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

  const handleSessionEnd = useCallback(async () => {
    if (!window.anchor || !sessionId || sessionEnding) return

    setSessionEnding(true)

    try {
      const result = await window.anchor.endSession({ sessionId })
      setPostSession(result)
      setMemory(result.memory)
      setSessionId(null)
      setPrepSource(null)
      setQuoteCount(0)
      setImageCount(0)
      setVoicePending(false)
      setAudioCount(0)
      setLastTrigger(null)
      setLastQuote(null)

      console.log('[session:complete]', result)
    } catch (err) {
      console.error('Session end failed:', err)
    } finally {
      setSessionEnding(false)
    }
  }, [sessionEnding, sessionId])

  const handleStressTest = useCallback(async () => {
    if (!window.anchor || stressTesting) return

    setStressTesting(true)
    try {
      await window.anchor.stressTest()
    } catch (err) {
      console.error('Stress test failed:', err)
    } finally {
      setStressTesting(false)
    }
  }, [stressTesting])

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
      <NudgeAudioPlayer />
      <header className="app-header">
        <h1>Anchor Vision</h1>
        <p className="app-subtitle">Camera-driven focus coach</p>
      </header>

      <main className="app-main">
        <div className="app-stage">
          <WebcamFeed
            sessionId={sessionId}
            onTrigger={handleTrigger}
            triggerBusy={triggerBusy}
          />
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
              ending={sessionEnding}
              onSessionStart={handleSessionStart}
              onSessionEnd={handleSessionEnd}
              onTrigger={handleTrigger}
              busy={triggerBusy}
            />
          </div>

          <div className="info-card">
            <DevCoachPanel
              entries={devCoaching}
              seerState={seerState}
              onStressTest={handleStressTest}
              stressTesting={stressTesting}
            />
          </div>

          <div className="info-card">
            <SessionDashboard
              postSession={postSession}
              memory={memory}
              ending={sessionEnding}
            />
          </div>

          <div className="info-card">
            <h2>Status</h2>
            <dl>
              <dt>Milestone</dt>
              <dd>M7 + Reverse Nudge</dd>
              <dt>IPC bridge</dt>
              <dd>{ipcReady ? 'Connected' : 'Unavailable'}</dd>
              <dt>Redis</dt>
              <dd>{redisConnected ? 'Connected' : 'Memory fallback'}</dd>
              <dt>Profile</dt>
              <dd>{profile ? profile.userId : 'Loading…'}</dd>
              <dt>Memory</dt>
              <dd>
                {memory && memory.totalSessions > 0
                  ? `${memory.totalSessions} sessions, ${memory.wins.length} wins`
                  : 'No sessions yet'}
              </dd>
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

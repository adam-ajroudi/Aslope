import { useCallback, useEffect, useRef, useState } from 'react'
import type { TriggerType } from '@shared/types'
import { useVisionMonitor } from '../hooks/useVisionMonitor'
import { cameraErrorMessage, countVideoInputs, openCameraStream } from '../vision/camera'
import './WebcamFeed.css'

type CameraStatus = 'idle' | 'requesting' | 'ready' | 'demo' | 'denied' | 'unavailable' | 'error'

type WebcamFeedProps = {
  sessionId?: string | null
  onTrigger?: (type: TriggerType) => void
  triggerBusy?: boolean
}

export function WebcamFeed({
  sessionId = null,
  onTrigger,
  triggerBusy = false
}: WebcamFeedProps): React.ReactElement {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isWsl, setIsWsl] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const startCamera = useCallback(async (cancelled: () => boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      setErrorMessage('Camera API is not available in this environment.')
      return
    }

    setStatus('requesting')
    setErrorMessage(null)

    try {
      const stream = await openCameraStream()

      if (cancelled()) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      setStatus('ready')
    } catch (err) {
      if (cancelled()) return

      const name = err instanceof DOMException ? err.name : 'UnknownError'
      const videoInputCount = await countVideoInputs()
      const wsl = window.anchor ? (await window.anchor.getSystemInfo()).isWsl : false
      setIsWsl(wsl)

      console.error('[camera]', { name, videoInputCount, isWsl: wsl, err })

      const noDevice = name === 'NotFoundError' || name === 'DevicesNotFoundError'

      // On WSL2 the host webcam is never visible to the Linux app, so there is no
      // point leaving the user on a dead placeholder — drop straight into the demo
      // feed (still keeps the app fully usable via the sidebar trigger buttons).
      if (wsl && noDevice) {
        setErrorMessage(null)
        setStatus('demo')
        return
      }

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('denied')
      } else if (noDevice) {
        setStatus('unavailable')
      } else {
        setStatus('error')
      }

      setErrorMessage(cameraErrorMessage(err, { isWsl: wsl, videoInputCount }))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void startCamera(() => cancelled)
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [startCamera, attempt])

  useEffect(() => {
    if (status !== 'ready' || !videoEl || !streamRef.current) return

    videoEl.srcObject = streamRef.current
    void videoEl.play().catch((err: unknown) => {
      console.error('[camera] play failed:', err)
    })
  }, [status, videoEl])

  const retry = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setAttempt((n) => n + 1)
  }, [])

  const useDemoFeed = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setErrorMessage(null)
    setStatus('demo')
  }, [])

  const visionEnabled = status === 'ready' && Boolean(sessionId) && !triggerBusy
  const visionStatus = useVisionMonitor({
    sessionId,
    enabled: visionEnabled,
    video: videoEl,
    onTrigger: (type) => {
      if (onTrigger && sessionId && !triggerBusy) {
        onTrigger(type)
      }
    }
  })

  const statusLabel: Record<CameraStatus, string> = {
    idle: 'Initializing camera…',
    requesting: 'Requesting camera permission…',
    ready: 'Camera ready',
    demo: 'Demo feed (no camera)',
    denied: 'Camera permission denied',
    unavailable: 'Camera unavailable',
    error: 'Camera error'
  }

  const showFeed = status === 'ready' || status === 'demo'

  return (
    <section className="webcam-panel">
      <div className="webcam-frame">
        {showFeed ? (
          <>
            {status === 'ready' && (
              <video
                ref={setVideoEl}
                className="webcam-video"
                autoPlay
                playsInline
                muted
              />
            )}
            {status === 'demo' && (
              <div className="webcam-demo" aria-label="Demo camera feed">
                <div className="webcam-demo-grid" />
                <p className="webcam-demo-label">Demo feed — CV needs a live camera</p>
                {isWsl && (
                  <p className="webcam-demo-hint">
                    No webcam under WSL2. For a live feed, run <code>pnpm dev</code> from{' '}
                    <strong>Windows PowerShell</strong>.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="webcam-placeholder">
            <p>{statusLabel[status]}</p>
            {errorMessage && <p className="webcam-error">{errorMessage}</p>}
            {isWsl && (
              <p className="webcam-hint">
                Quick fix: run <code>pnpm dev</code> from <strong>Windows PowerShell</strong> (not WSL).
                Open this repo via <code>{'\\\\wsl$\\<your-distro>\\home\\adam\\developer\\hackathons\\ai-hackathon-berkeley-2026'}</code>.
              </p>
            )}
            {(status === 'unavailable' || status === 'error' || status === 'denied') && (
              <div className="webcam-actions">
                <button type="button" className="webcam-btn" onClick={retry}>
                  Retry camera
                </button>
                <button type="button" className="webcam-btn webcam-btn--secondary" onClick={useDemoFeed}>
                  Use demo feed
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <p className={`webcam-status ${status === 'demo' ? 'webcam-status--demo' : ''}`}>
        {status === 'ready' && sessionId
          ? visionStatus.statusMessage
          : statusLabel[status]}
      </p>
      {status === 'ready' && sessionId && visionStatus.modelStatus !== 'idle' && (
        <p className="webcam-vision-meta">
          {visionStatus.poseModelReady ? 'Posture: Dorso-style (MediaPipe)' : 'Posture: loading…'}
          {' · '}
          {visionStatus.phoneModelReady ? 'Phone: YOLO26' : 'Phone: loading…'}
          {visionStatus.fps > 0 ? ` · ${visionStatus.fps} fps` : ''}
          {visionStatus.phoneVisible ? ' · 📱 phone detected' : ''}
        </p>
      )}
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import './WebcamFeed.css'

type CameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error'

export function WebcamFeed(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function startCamera(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        setErrorMessage('Camera API is not available in this environment.')
        return
      }

      setStatus('requesting')
      setErrorMessage(null)

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setStatus('ready')
      } catch (err) {
        if (cancelled) return

        const name = err instanceof DOMException ? err.name : 'UnknownError'
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied')
          setErrorMessage('Camera permission was denied. Allow access in system settings and reload.')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setStatus('unavailable')
          setErrorMessage('No camera device was found.')
        } else {
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Failed to start the camera.')
        }
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const statusLabel: Record<CameraStatus, string> = {
    idle: 'Initializing camera…',
    requesting: 'Requesting camera permission…',
    ready: 'M0 — camera ready',
    denied: 'Camera permission denied',
    unavailable: 'Camera unavailable',
    error: 'Camera error'
  }

  return (
    <section className="webcam-panel">
      <div className="webcam-frame">
        {status === 'ready' ? (
          <video ref={videoRef} className="webcam-video" autoPlay playsInline muted />
        ) : (
          <div className="webcam-placeholder">
            <p>{statusLabel[status]}</p>
            {errorMessage && <p className="webcam-error">{errorMessage}</p>}
          </div>
        )}
      </div>
      <p className="webcam-status">{statusLabel[status]}</p>
    </section>
  )
}

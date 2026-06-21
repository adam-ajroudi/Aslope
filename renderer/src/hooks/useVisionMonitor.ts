import { useCallback, useEffect, useRef, useState } from 'react'
import type { TriggerType } from '@shared/types'
import { PhoneDetector } from '../vision/phoneDetector'
import { PoseDetector } from '../vision/poseDetector'
import { TriggerEngine } from '../vision/triggerEngine'
import type { PhoneBox, VisionStatus } from '../vision/types'
import { VISION_DEFAULTS } from '../vision/types'

const INITIAL_STATUS: VisionStatus = {
  modelStatus: 'idle',
  statusMessage: 'Vision idle',
  postureCalibrated: false,
  phoneModelReady: false,
  poseModelReady: false,
  lastSlouchSeverity: 0,
  phoneVisible: false,
  fps: 0
}

type UseVisionMonitorArgs = {
  sessionId: string | null
  enabled: boolean
  video: HTMLVideoElement | null
  onTrigger: (type: TriggerType) => void
}

export function useVisionMonitor({
  sessionId,
  enabled,
  video,
  onTrigger
}: UseVisionMonitorArgs): VisionStatus {
  const [status, setStatus] = useState<VisionStatus>(INITIAL_STATUS)
  const poseRef = useRef<PoseDetector | null>(null)
  const phoneRef = useRef<PhoneDetector | null>(null)
  const triggerRef = useRef<TriggerEngine | null>(null)
  const onTriggerRef = useRef(onTrigger)
  const frameRef = useRef(0)
  const phoneBusyRef = useRef(false)
  const calibrationStartedAtRef = useRef<number | null>(null)
  const lastFrameAtRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  onTriggerRef.current = onTrigger

  const updateStatus = useCallback((patch: Partial<VisionStatus>) => {
    setStatus((prev: VisionStatus) => ({ ...prev, ...patch }))
  }, [])

  useEffect(() => {
    if (!enabled || !sessionId || !video) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      triggerRef.current?.reset()
      phoneRef.current?.resetTracking()
      poseRef.current?.resetCalibration()
      calibrationStartedAtRef.current = null
      setStatus(INITIAL_STATUS)
      return
    }

    let cancelled = false

    const pose = new PoseDetector()
    const phone = new PhoneDetector()
    const trigger = new TriggerEngine()
    poseRef.current = pose
    phoneRef.current = phone
    triggerRef.current = trigger
    frameRef.current = 0
    calibrationStartedAtRef.current = null

    void (async () => {
      try {
        updateStatus({
          modelStatus: 'loading',
          statusMessage: 'Loading posture model (Dorso-style)…'
        })

        await pose.initialize((message: string) => {
          if (!cancelled) updateStatus({ statusMessage: message })
        })

        if (cancelled) return

        updateStatus({
          poseModelReady: true,
          statusMessage: 'Loading phone model (YOLO26)…'
        })

        await phone.initialize((message: string) => {
          if (!cancelled) updateStatus({ statusMessage: message })
        })

        if (cancelled) return

        updateStatus({
          phoneModelReady: true,
          modelStatus: 'calibrating',
          statusMessage: 'Sit up straight — calibrating posture…'
        })
        calibrationStartedAtRef.current = performance.now()
        pose.resetCalibration()
        phone.resetTracking()
        trigger.reset()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[vision:init] FAILED:', message, err)
        if (!cancelled) {
          updateStatus({
            modelStatus: 'error',
            statusMessage: `Vision failed: ${message.slice(0, 80)}`
          })
        }
        return
      }

      const loop = (): void => {
        if (cancelled) return

        const now = performance.now()
        frameRef.current += 1
        const frame = frameRef.current

        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        const timestampMs = Math.round(now)
        const sample = pose.detectLandmarks(video, timestampMs)

        if (sample) {
          if (!pose.hasCalibration && calibrationStartedAtRef.current !== null) {
            pose.addCalibrationSample(sample.noseY, sample.faceWidth)

            const elapsed = now - calibrationStartedAtRef.current
            if (elapsed >= VISION_DEFAULTS.calibrationMs) {
              const ok = pose.finishCalibration()
              if (ok) {
                updateStatus({
                  postureCalibrated: true,
                  modelStatus: 'monitoring',
                  statusMessage: 'Monitoring posture + phone…'
                })
              } else {
                calibrationStartedAtRef.current = now
                pose.resetCalibration()
                updateStatus({
                  statusMessage: 'Calibration unclear — sit up straight and hold…'
                })
              }
            } else {
              const remaining = Math.ceil((VISION_DEFAULTS.calibrationMs - elapsed) / 1000)
              updateStatus({
                statusMessage: `Calibrating posture… ${remaining}s`
              })
            }
          }
        }

        let isBadPosture = false
        let severity = 0

        if (pose.hasCalibration && sample && frame % VISION_DEFAULTS.poseFrameStride === 0) {
          const reading = pose.evaluatePosture(sample)
          isBadPosture = reading.isBadPosture
          severity = reading.severity
        }

        if (
          pose.hasCalibration &&
          frame % VISION_DEFAULTS.phoneFrameStride === 0 &&
          !phoneBusyRef.current
        ) {
          phoneBusyRef.current = true
          void phone
            .detectPhones(video)
            .then((detections: PhoneBox[]) => {
              phone.updatePhoneState(detections.length > 0)
            })
            .catch((err: unknown) => {
              console.warn('[vision:phone]', err)
            })
            .finally(() => {
              phoneBusyRef.current = false
            })
        }

        if (pose.hasCalibration) {
          const fired = trigger.evaluate({
            isBadPosture,
            phoneVisible: phone.phoneVisible,
            now: Date.now()
          })

          if (fired) {
            onTriggerRef.current(fired)
          }

          const prev = lastFrameAtRef.current ?? now
          lastFrameAtRef.current = now

          updateStatus({
            lastSlouchSeverity: severity,
            phoneVisible: phone.phoneVisible,
            fps: Math.round(1000 / Math.max(1, now - prev))
          })
        }

        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)
    })()

    return () => {
      cancelled = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pose.dispose()
      phone.dispose()
      poseRef.current = null
      phoneRef.current = null
      triggerRef.current = null
    }
  }, [enabled, sessionId, updateStatus, video])

  return status
}

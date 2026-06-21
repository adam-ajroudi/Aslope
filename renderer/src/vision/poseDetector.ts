import { FaceDetector, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { createPostureCalibration, type CalibrationSample } from './calibration'
import type { PostureCalibration, PostureReading } from './types'
import { VISION_DEFAULTS } from './types'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

export class PoseDetector {
  private poseLandmarker: PoseLandmarker | null = null
  private faceDetector: FaceDetector | null = null
  private calibration: PostureCalibration | null = null
  private calibrationSamples: CalibrationSample[] = []
  private noseYHistory: number[] = []
  private isCurrentlySlouching = false
  private deadZone = VISION_DEFAULTS.deadZone
  private lastTimestamp = -1

  get isReady(): boolean {
    return this.poseLandmarker !== null
  }

  get hasCalibration(): boolean {
    return this.calibration !== null
  }

  async initialize(onProgress?: (message: string) => void): Promise<void> {
    if (this.poseLandmarker) return

    onProgress?.('Loading MediaPipe pose model…')
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE)

    const delegate = await this.pickDelegate()
    onProgress?.(`Using ${delegate} delegate…`)

    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: POSE_MODEL,
        delegate
      },
      runningMode: 'VIDEO',
      numPoses: 1
    })

    onProgress?.('Loading face detector…')
    this.faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_MODEL,
        delegate
      },
      runningMode: 'VIDEO'
    })
  }

  private async pickDelegate(): Promise<'GPU' | 'CPU'> {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      if (gl) return 'GPU'
    } catch {
      // fall through
    }
    return 'CPU'
  }

  resetCalibration(): void {
    this.calibration = null
    this.calibrationSamples = []
    this.noseYHistory = []
    this.isCurrentlySlouching = false
  }

  addCalibrationSample(noseY: number, faceWidth: number): void {
    this.calibrationSamples.push({ noseY, faceWidth })
  }

  finishCalibration(): boolean {
    const data = createPostureCalibration(this.calibrationSamples)
    if (!data) return false
    this.calibration = data
    this.noseYHistory = []
    this.isCurrentlySlouching = false
    return true
  }

  detectLandmarks(video: HTMLVideoElement, timestampMs: number): CalibrationSample | null {
    if (!this.poseLandmarker) return null

    if (this.lastTimestamp === timestampMs) {
      return null
    }
    this.lastTimestamp = timestampMs

    const poseResult = this.poseLandmarker.detectForVideo(video, timestampMs)
    const nose = poseResult.landmarks[0]?.[0]
    if (!nose || (nose.visibility ?? 0) < 0.3) {
      return this.detectFaceFallback(video, timestampMs)
    }

    const faceWidth = this.measureFaceWidth(video, timestampMs)
    return { noseY: nose.y, faceWidth }
  }

  evaluatePosture(sample: CalibrationSample): PostureReading {
    if (!this.calibration) {
      return {
        isBadPosture: false,
        severity: 0,
        noseY: sample.noseY,
        faceWidth: sample.faceWidth
      }
    }

    const smoothedY = this.smoothNoseY(sample.noseY)
    const cal = this.calibration

    // MediaPipe Y grows downward — slouch = larger Y than good baseline.
    const slouchAmount = smoothedY - cal.goodPostureY
    const deadZoneThreshold = this.deadZone * cal.postureRange
    const enterThreshold = deadZoneThreshold
    const exitThreshold = deadZoneThreshold * 0.7
    const threshold = this.isCurrentlySlouching ? exitThreshold : enterThreshold

    let isBadPosture = slouchAmount > threshold

    // Forward-head detection (Dorso face-width ratio).
    let forwardHeadSeverity = 0
    const forwardHeadThreshold =
      1.0 + Math.max(VISION_DEFAULTS.forwardHeadBaseThreshold, this.deadZone)

    if (cal.neutralFaceWidth > 0 && sample.faceWidth > 0) {
      const ratio = sample.faceWidth / cal.neutralFaceWidth
      if (ratio > forwardHeadThreshold) {
        isBadPosture = true
        const sizeExcess = ratio - forwardHeadThreshold
        forwardHeadSeverity = Math.min(
          1,
          Math.max(0, sizeExcess / VISION_DEFAULTS.forwardHeadSeverityRange)
        )
      }
    }

    let severity = 0
    if (isBadPosture) {
      const pastDeadZone = slouchAmount - deadZoneThreshold
      const remainingRange = Math.max(0.01, cal.postureRange - deadZoneThreshold)
      const verticalSeverity = Math.min(1, Math.max(0, pastDeadZone / remainingRange))
      severity = Math.max(verticalSeverity, forwardHeadSeverity)

      if (
        forwardHeadSeverity > 0 &&
        severity < VISION_DEFAULTS.forwardHeadMinSeverity
      ) {
        severity = VISION_DEFAULTS.forwardHeadMinSeverity
      }
    }

    if (isBadPosture) {
      this.isCurrentlySlouching = true
    } else if (!isBadPosture && severity === 0) {
      this.isCurrentlySlouching = false
    }

    return {
      isBadPosture,
      severity,
      noseY: sample.noseY,
      faceWidth: sample.faceWidth
    }
  }

  private smoothNoseY(rawY: number): number {
    this.noseYHistory.push(rawY)
    if (this.noseYHistory.length > VISION_DEFAULTS.smoothingWindow) {
      this.noseYHistory.shift()
    }
    return this.noseYHistory.reduce((sum, y) => sum + y, 0) / this.noseYHistory.length
  }

  private detectFaceFallback(
    video: HTMLVideoElement,
    timestampMs: number
  ): CalibrationSample | null {
    if (!this.faceDetector) return null

    const faces = this.faceDetector.detectForVideo(video, timestampMs)
    const face = faces.detections[0]
    if (!face?.boundingBox) return null

    const box = face.boundingBox
    const noseY = box.originY + box.height * 0.35
    const faceWidth = box.width

    return { noseY, faceWidth }
  }

  private measureFaceWidth(video: HTMLVideoElement, timestampMs: number): number {
    if (!this.faceDetector) return 0

    const faces = this.faceDetector.detectForVideo(video, timestampMs)
    const face = faces.detections[0]
    return face?.boundingBox?.width ?? 0
  }

  dispose(): void {
    this.poseLandmarker?.close()
    this.faceDetector?.close()
    this.poseLandmarker = null
    this.faceDetector = null
  }
}

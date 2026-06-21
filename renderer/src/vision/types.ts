import type { TriggerType } from '@shared/types'

/** Posture calibration inspired by [Dorso](https://github.com/tldev/dorso) camera mode. */
export type PostureCalibration = {
  /** Nose Y when sitting upright (MediaPipe: smaller = higher on screen). */
  goodPostureY: number
  /** Nose Y when slouched (larger = lower on screen). */
  badPostureY: number
  neutralY: number
  postureRange: number
  /** Max face width during calibration — proxy for distance to screen. */
  neutralFaceWidth: number
}

export type PostureReading = {
  isBadPosture: boolean
  severity: number
  noseY: number
  faceWidth: number
}

export type PhoneBox = {
  x1: number
  y1: number
  x2: number
  y2: number
  confidence: number
}

export type VisionModelStatus =
  | 'idle'
  | 'loading'
  | 'calibrating'
  | 'ready'
  | 'monitoring'
  | 'error'

export type VisionStatus = {
  modelStatus: VisionModelStatus
  statusMessage: string
  postureCalibrated: boolean
  phoneModelReady: boolean
  poseModelReady: boolean
  lastSlouchSeverity: number
  phoneVisible: boolean
  fps: number
}

export type VisionMonitorOptions = {
  sessionId: string | null
  enabled: boolean
  video: HTMLVideoElement | null
  onTrigger: (type: TriggerType) => void
}

export const VISION_DEFAULTS = {
  /** Dorso default dead zone (fraction of posture range). */
  deadZone: 0.03,
  /** Dorso smoothing window for nose Y. */
  smoothingWindow: 5,
  /** Dorso forward-head base threshold (face width ratio above neutral). */
  forwardHeadBaseThreshold: 0.15,
  forwardHeadSeverityRange: 0.25,
  forwardHeadMinSeverity: 0.35,
  /** Slouch must persist this long before nudge (PLAN.md). */
  slouchDebounceMs: 3000,
  /** Phone must persist this long before nudge (PLAN.md). */
  phoneDebounceMs: 2000,
  /** Cooldown between nudges of the same type (judgy_reachy_no_phone default). */
  nudgeCooldownMs: 30_000,
  /** Calibration sample duration. */
  calibrationMs: 4000,
  /** Phone detection — judgy_reachy_no_phone demo.js */
  phoneClassId: 67,
  pickupThreshold: 3,
  putdownThreshold: 15,
  detectionConfidence: 0.5,
  trackingConfidence: 0.2,
  trackingPersistFrames: 3,
  /** Run phone inference every N animation frames. */
  phoneFrameStride: 3,
  /** Run pose inference every N animation frames. */
  poseFrameStride: 2
} as const

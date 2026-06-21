import type { PostureCalibration } from './types'

export type CalibrationSample = {
  noseY: number
  faceWidth: number
}

/**
 * Build posture baseline from calibration samples.
 * Logic mirrors Dorso's `createCalibrationData` but uses top-left
 * MediaPipe coordinates (Y increases downward).
 */
export function createPostureCalibration(samples: CalibrationSample[]): PostureCalibration | null {
  if (samples.length < 4) return null

  const yValues = samples.map((s) => s.noseY)
  const widthValues = samples.map((s) => s.faceWidth).filter((w) => w > 0)

  const goodPostureY = Math.min(...yValues)
  const badPostureY = Math.max(...yValues)
  const neutralY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length
  const postureRange = Math.abs(badPostureY - goodPostureY)
  const neutralFaceWidth = widthValues.length > 0 ? Math.max(...widthValues) : 0

  return {
    goodPostureY,
    badPostureY,
    neutralY,
    postureRange: Math.max(postureRange, 0.02),
    neutralFaceWidth
  }
}

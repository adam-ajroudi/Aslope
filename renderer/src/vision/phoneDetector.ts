/**
 * Phone detection ported from
 * [judgy_reachy_no_phone](https://github.com/yaseminozkut/judgy_reachy_no_phone)
 * browser demo (demo.js) + detection.py state machine.
 */
import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers'
import type { PhoneBox } from './types'
import { VISION_DEFAULTS } from './types'

env.allowLocalModels = false
env.useBrowserCache = true

type YoloModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>
type YoloProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>

export class PhoneDetector {
  private model: YoloModel | null = null
  private processor: YoloProcessor | null = null
  private lastPhoneBox: PhoneBox | null = null
  private framesWithoutDetection = 0

  /** State machine — mirrors judgy `PhoneDetector.process_frame`. */
  phoneVisible = false
  consecutivePhone = 0
  consecutiveNoPhone = 0

  private offscreen = document.createElement('canvas')
  private offscreenCtx = this.offscreen.getContext('2d', { willReadFrequently: true })
  private smallCanvas = document.createElement('canvas')
  private smallCtx = this.smallCanvas.getContext('2d', { willReadFrequently: true })

  get isReady(): boolean {
    return this.model !== null && this.processor !== null
  }

  async initialize(onProgress?: (message: string) => void): Promise<void> {
    if (this.model) return

    onProgress?.('Loading YOLO26 (ONNX)…')

    const modelName = 'yolo26n-ONNX'
    const device = (await this.pickDevice()) as 'webgpu' | 'wasm'

    this.model = await AutoModel.from_pretrained(`onnx-community/${modelName}`, {
      device,
      dtype: device === 'webgpu' ? 'fp16' : 'fp32'
    })

    onProgress?.('Loading YOLO processor…')
    this.processor = await AutoProcessor.from_pretrained(`onnx-community/${modelName}`)
  }

  private async pickDevice(): Promise<'webgpu' | 'wasm'> {
    try {
      const nav = navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<{ readonly limits: unknown } | null> }
      }
      if (nav.gpu) {
        const adapter = await nav.gpu.requestAdapter()
        if (adapter) return 'webgpu'
      }
    } catch {
      // fall through to wasm
    }
    return 'wasm'
  }

  resetTracking(): void {
    this.phoneVisible = false
    this.consecutivePhone = 0
    this.consecutiveNoPhone = 0
    this.lastPhoneBox = null
    this.framesWithoutDetection = 0
  }

  /**
   * Detect phones in the current video frame.
   * Returns bounding boxes in video pixel coordinates.
   */
  async detectPhones(video: HTMLVideoElement): Promise<PhoneBox[]> {
    if (!this.model || !this.processor || !this.offscreenCtx || !this.smallCtx) {
      return []
    }

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw === 0 || vh === 0) return []

    this.offscreen.width = vw
    this.offscreen.height = vh
    this.offscreenCtx.drawImage(video, 0, 0, vw, vh)

    const targetWidth = 256
    const targetHeight = Math.round((targetWidth / vw) * vh)
    if (this.smallCanvas.width !== targetWidth || this.smallCanvas.height !== targetHeight) {
      this.smallCanvas.width = targetWidth
      this.smallCanvas.height = targetHeight
    }

    this.smallCtx.drawImage(this.offscreen, 0, 0, targetWidth, targetHeight)
    const image = RawImage.fromCanvas(this.smallCanvas)

    const inputs = await this.processor(image)
    const output = await this.model(inputs)

    const scores = output.logits.sigmoid().data as Float32Array
    const boxes = output.pred_boxes.data as Float32Array

    const confidenceThreshold = this.lastPhoneBox
      ? VISION_DEFAULTS.trackingConfidence
      : VISION_DEFAULTS.detectionConfidence

    const detections: PhoneBox[] = []
    let bestPhone: PhoneBox | null = null
    let bestScore = 0

    for (let i = 0; i < 300; i++) {
      let maxScore = 0
      let maxClass = 0

      for (let j = 0; j < 80; j++) {
        const score = scores[i * 80 + j] ?? 0
        if (score > maxScore) {
          maxScore = score
          maxClass = j
        }
      }

      if (maxClass !== VISION_DEFAULTS.phoneClassId || maxScore < confidenceThreshold) {
        continue
      }

      const cx = boxes[i * 4] ?? 0
      const cy = boxes[i * 4 + 1] ?? 0
      const w = boxes[i * 4 + 2] ?? 0
      const h = boxes[i * 4 + 3] ?? 0

      const scaleX = vw / targetWidth
      const scaleY = vh / targetHeight

      const box: PhoneBox = {
        x1: (cx - w / 2) * targetWidth * scaleX,
        y1: (cy - h / 2) * targetHeight * scaleY,
        x2: (cx + w / 2) * targetWidth * scaleX,
        y2: (cy + h / 2) * targetHeight * scaleY,
        confidence: maxScore
      }

      if (maxScore > bestScore) {
        bestScore = maxScore
        bestPhone = box
      }
    }

    if (bestPhone) {
      this.lastPhoneBox = bestPhone
      this.framesWithoutDetection = 0
      detections.push(bestPhone)
    } else if (
      this.lastPhoneBox &&
      this.framesWithoutDetection < VISION_DEFAULTS.trackingPersistFrames
    ) {
      this.framesWithoutDetection += 1
      detections.push({
        ...this.lastPhoneBox,
        confidence: this.lastPhoneBox.confidence * 0.9
      })
    } else {
      this.lastPhoneBox = null
      this.framesWithoutDetection = 0
    }

    return detections
  }

  /**
   * Update pickup/putdown counters. Returns true when phone is considered visible.
   */
  updatePhoneState(phoneInFrame: boolean): void {
    if (phoneInFrame) {
      this.consecutivePhone += 1
      this.consecutiveNoPhone = 0
    } else {
      this.consecutiveNoPhone += 1
    }

    if (
      this.consecutivePhone >= VISION_DEFAULTS.pickupThreshold &&
      !this.phoneVisible
    ) {
      this.phoneVisible = true
      this.consecutiveNoPhone = 0
    }

    if (
      this.consecutiveNoPhone >= VISION_DEFAULTS.putdownThreshold &&
      this.phoneVisible
    ) {
      this.phoneVisible = false
      this.consecutivePhone = 0
    }
  }

  dispose(): void {
    this.model = null
    this.processor = null
  }
}

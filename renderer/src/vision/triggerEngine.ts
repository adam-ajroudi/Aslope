import type { TriggerType } from '@shared/types'
import { VISION_DEFAULTS } from './types'

export class TriggerEngine {
  private slouchSince: number | null = null
  private phoneSince: number | null = null
  private lastNudgeAt: Record<TriggerType, number> = { slouch: 0, phone: 0 }

  reset(): void {
    this.slouchSince = null
    this.phoneSince = null
    this.lastNudgeAt = { slouch: 0, phone: 0 }
  }

  /**
   * Returns trigger type when debounce + cooldown allow a nudge.
   */
  evaluate(input: {
    isBadPosture: boolean
    phoneVisible: boolean
    now: number
  }): TriggerType | null {
    if (input.isBadPosture) {
      if (this.slouchSince === null) this.slouchSince = input.now
    } else {
      this.slouchSince = null
    }

    if (input.phoneVisible) {
      if (this.phoneSince === null) this.phoneSince = input.now
    } else {
      this.phoneSince = null
    }

    const slouchReady =
      this.slouchSince !== null &&
      input.now - this.slouchSince >= VISION_DEFAULTS.slouchDebounceMs &&
      input.now - this.lastNudgeAt.slouch >= VISION_DEFAULTS.nudgeCooldownMs

    const phoneReady =
      this.phoneSince !== null &&
      input.now - this.phoneSince >= VISION_DEFAULTS.phoneDebounceMs &&
      input.now - this.lastNudgeAt.phone >= VISION_DEFAULTS.nudgeCooldownMs

    if (slouchReady && phoneReady) {
      // Prefer phone — stronger distraction signal.
      this.lastNudgeAt.phone = input.now
      this.phoneSince = null
      return 'phone'
    }

    if (phoneReady) {
      this.lastNudgeAt.phone = input.now
      this.phoneSince = null
      return 'phone'
    }

    if (slouchReady) {
      this.lastNudgeAt.slouch = input.now
      this.slouchSince = null
      return 'slouch'
    }

    return null
  }
}

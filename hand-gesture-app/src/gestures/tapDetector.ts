import type { NormalizedLandmark, GlyphType } from './types'
import { FingerIndices } from './types'

// Ratio of the index-finger vector that must point toward camera to enter tap.
// 0 = sideways, 1 = perfectly toward camera.
const TOWARD_ENTER = 0.55
const TOWARD_EXIT  = 0.25
// Frames before the next tap can fire (prevents rapid repeats).
const COOLDOWN = 24

function indexTowardCamera (landmarks: NormalizedLandmark[]): number {
  const base = landmarks[FingerIndices.index.base]
  const tip  = landmarks[FingerIndices.index.tip]
  const vx   = tip.x - base.x
  const vy   = tip.y - base.y
  const vz   = tip.z - base.z
  const len  = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6
  // negative z = toward camera; normalise to [0,1]
  return -vz / len
}

export class TapDetector {
  private inTap = false
  private cooldown = 0

  update (
    landmarks: NormalizedLandmark[],
    stableGesture: GlyphType
  ): boolean {
    if (this.cooldown > 0) {
      this.cooldown--; return false
    }

    if (stableGesture !== 'fist') {
      this.inTap = false; return false
    }

    const toward = indexTowardCamera(landmarks)

    if (!this.inTap && toward > TOWARD_ENTER) {
      this.inTap = true
      return false
    }

    if (this.inTap && toward < TOWARD_EXIT) {
      this.inTap    = false
      this.cooldown = COOLDOWN
      return true
    }

    return false
  }

  reset (): void {
    this.inTap = false; this.cooldown = 0
  }
}

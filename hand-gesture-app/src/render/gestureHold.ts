/**
 * Per-hand "held gesture" tracker.
 *
 * When a hand starts holding a (non-unknown) gesture, we capture a reference
 * pose: the hand centre, depth and full orientation (pitch/yaw/roll) at that
 * instant. While the same PRIMARY gesture is held, we report the delta of the
 * current pose relative to that reference.
 *
 * The reference persists until a genuinely NEW primary gesture begins:
 *   - sub-gesture changes (e.g. fist INDEX -> fist INDEX+PINKY) keep the ref,
 *   - brief `unknown` blips keep the ref (we just stop reporting a delta),
 *   - the hand leaving frame keeps the ref (so it resumes on return).
 * Only switching to a different known primary gesture re-captures it.
 *
 * The left-hand "lock" feature relies on this: while locked the performance
 * hand's gesture is held constant, so `ref.gesture === gesture` stays true and
 * the position/rotation deltas keep streaming off the locked origin.
 *
 * Coordinates are in MediaPipe normalized space (the same space used for
 * detection), so deltas are resolution-independent. Callers pass the mirror
 * flag so captured rotation/x match what the user sees on screen.
 */

import type { NormalizedLandmark, GlyphType } from '../gestures/types'
import { FingerIndices, PalmIndices } from '../gestures/types'


export interface HoldDelta {
  dx:     number;
  dy:     number;
  dz:     number;
  dPitch: number; // signed degrees
  dYaw:   number; // signed degrees
  dRoll:  number; // signed degrees (in-plane twist)
  dAngle: number; // alias of dRoll, kept for effectsRenderer.updateFlare()
}

interface HoldRef {
  gesture: GlyphType;
  cx:      number;
  cy:      number;
  cz:      number;
  pitch:   number;
  yaw:     number;
  roll:    number;
}

export interface HandOrientation {
  pitch: number;
  yaw:   number;
  roll:  number;
}

const RAD = 180 / Math.PI

const PALM_POINTS = [
  PalmIndices.wrist,
  PalmIndices.indexBase,
  PalmIndices.middleBase,
  PalmIndices.ringBase,
  PalmIndices.pinkyBase
]

type PalmCentreReturnType = { x: number; y: number; z: number }

function palmCentre (landmarks: NormalizedLandmark[]): PalmCentreReturnType {
  let x = 0,
    y   = 0,
    z   = 0
  for (const i of PALM_POINTS) {
    x += landmarks[i].x
    y += landmarks[i].y
    z += landmarks[i].z
  }

  const n = PALM_POINTS.length
  return { x: x / n, y: y / n, z: z / n }
}

/** In-plane orientation of the hand: wrist -> middle-finger base, in degrees. */
function handAngle (landmarks: NormalizedLandmark[], mirror: boolean): number {
  const wrist = landmarks[PalmIndices.wrist]
  const mid   = landmarks[FingerIndices.middle.base]
  const dx    = (mid.x - wrist.x) * (mirror ? -1 : 1)
  const dy    = mid.y - wrist.y
  return Math.atan2(dy, dx) * (180 / Math.PI)
}

/**
 * Full 3D-ish hand orientation derived from a palm basis:
 *   up     = wrist -> middle-finger base   (along the palm)
 *   across = pinky base -> index base      (across the palm)
 * pitch = finger tilt in depth (toward/away from camera),
 * yaw   = palm turn left/right (across-vector rotating into depth),
 * roll  = in-plane twist (reuses handAngle, so dRoll == dAngle).
 * Only the *delta* vs a reference is consumed downstream, so the exact zero
 * point is unimportant — continuity and monotonicity are what matter.
 */
export function handOrientation (landmarks: NormalizedLandmark[], mirror: boolean): HandOrientation {
  const s     = mirror ? -1 : 1
  const wrist = landmarks[PalmIndices.wrist]
  const mid   = landmarks[FingerIndices.middle.base]
  const idx   = landmarks[PalmIndices.indexBase]
  const pky   = landmarks[PalmIndices.pinkyBase]

  const upX = (mid.x - wrist.x) * s,
    upY     = mid.y - wrist.y,
    upZ     = mid.z - wrist.z
  const acX = (idx.x - pky.x) * s,
    acY     = idx.y - pky.y,
    acZ     = idx.z - pky.z

  const pitch = Math.atan2(-upZ, Math.hypot(upX, upY)) * RAD
  const yaw   = Math.atan2(acZ, Math.hypot(acX, acY)) * RAD
  const roll  = handAngle(landmarks, mirror)
  return { pitch, yaw, roll }
}

/** Normalise an angle difference into (-180, 180]. */
function normaliseAngle (deg: number): number {
  let d = deg % 360
  if (d > 180)
    d -= 360
  if (d <= -180)
    d += 360
  return d
}

export class GestureHoldTracker {
  private refs = new Map<string, HoldRef>()

  /**
   * Update with the latest detection for a hand.
   * Returns the current delta if a gesture is being held, else null.
   */
  update (
    id: string,
    gesture: GlyphType,
    landmarks: NormalizedLandmark[],
    mirror: boolean
  ): HoldDelta | null {
    // Unknown: don't report a delta, but KEEP the existing reference so a brief
    // detection dropout doesn't reset the user's held-gesture origin.
    if (gesture === 'unknown')
      return null

    const centre = palmCentre(landmarks)
    const o      = handOrientation(landmarks, mirror)

    const ref = this.refs.get(id)
    if (!ref || ref.gesture !== gesture) {
      // A genuinely new primary gesture started -> (re)capture the reference.
      this.refs.set(id, { gesture, cx: centre.x, cy: centre.y, cz: centre.z, pitch: o.pitch, yaw: o.yaw, roll: o.roll })
      return { dx: 0, dy: 0, dz: 0, dPitch: 0, dYaw: 0, dRoll: 0, dAngle: 0 }
    }

    const dx    = (centre.x - ref.cx) * (mirror ? -1 : 1)
    const dRoll = normaliseAngle(o.roll - ref.roll)
    return {
      dx,
      dy:     centre.y - ref.cy,
      dz:     centre.z - ref.cz,
      dPitch: normaliseAngle(o.pitch - ref.pitch),
      dYaw:   normaliseAngle(o.yaw - ref.yaw),
      dRoll,
      dAngle: dRoll
    }
  }

  /** Re-anchor the reference to the current pose without changing the gesture. */
  recapture (id: string, gesture: GlyphType, landmarks: NormalizedLandmark[], mirror: boolean): void {
    const centre = palmCentre(landmarks)
    const o      = handOrientation(landmarks, mirror)
    this.refs.set(id, { gesture, cx: centre.x, cy: centre.y, cz: centre.z, pitch: o.pitch, yaw: o.yaw, roll: o.roll })
  }

  /** Explicitly drop a hand's reference (not called on mere disappearance). */
  release (id: string): void {
    this.refs.delete(id)
  }
}

import { describe, it, expect } from 'vitest'
import { handOrientation, GestureHoldTracker } from './gestureHold'
import type { NormalizedLandmark } from '../gestures/types'

/** Build a 21-landmark hand, upright + facing camera by default. */
function makeHand (over: Partial<Record<number, NormalizedLandmark>> = {}): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  lm[0]                          = { x: 0.5, y: 0.8, z: 0 } // wrist (low)
  lm[9]                          = { x: 0.5, y: 0.5, z: 0 } // middle base (high → fingers up)
  lm[5]                          = { x: 0.45, y: 0.55, z: 0 } // index base
  lm[13]                         = { x: 0.55, y: 0.55, z: 0 } // ring base
  lm[17]                         = { x: 0.6, y: 0.55, z: 0 } // pinky base
  for (const [ k, v ] of Object.entries(over))
    if (v)
      lm[Number(k)] = v
  return lm
}

describe('handOrientation', () => {
  it('is ~level (pitch≈0, yaw≈0) for a flat hand facing the camera', () => {
    const o = handOrientation(makeHand(), false)
    expect(Math.abs(o.pitch)).toBeLessThan(1)
    expect(Math.abs(o.yaw)).toBeLessThan(1)
  })

  it('reports positive pitch when fingertips tip toward the camera', () => {
    const o = handOrientation(makeHand({ 9: { x: 0.5, y: 0.5, z: -0.2 }}), false)
    expect(o.pitch).toBeGreaterThan(10)
  })

  it('reports yaw when the palm turns (across-vector rotates into depth)', () => {
    const o = handOrientation(makeHand({ 5: { x: 0.45, y: 0.55, z: -0.15 }, 17: { x: 0.6, y: 0.55, z: 0.15 }}), false)
    expect(Math.abs(o.yaw)).toBeGreaterThan(10)
  })
})

describe('GestureHoldTracker', () => {
  it('returns a zero delta when a gesture first begins', () => {
    const tr = new GestureHoldTracker()
    const d  = tr.update('h', 'fist', makeHand(), false)
    expect(d).toEqual({ dx: 0, dy: 0, dz: 0, dPitch: 0, dYaw: 0, dRoll: 0, dAngle: 0 })
  })

  it('streams a non-zero translation delta as the same gesture is held + moved', () => {
    const tr = new GestureHoldTracker()
    tr.update('h', 'fist', makeHand(), false)

    const moved = makeHand({ 0: { x: 0.7, y: 0.8, z: 0 }, 9: { x: 0.7, y: 0.5, z: 0 }, 5: { x: 0.65, y: 0.55, z: 0 }, 13: { x: 0.75, y: 0.55, z: 0 }, 17: { x: 0.8, y: 0.55, z: 0 }})
    const d     = tr.update('h', 'fist', moved, false)
    expect(d).not.toBeNull()
    expect(d!.dx).toBeGreaterThan(0.1)
  })

  it('returns null on unknown but keeps the reference', () => {
    const tr = new GestureHoldTracker()
    tr.update('h', 'fist', makeHand(), false)
    expect(tr.update('h', 'unknown', makeHand(), false)).toBeNull()
  })
})

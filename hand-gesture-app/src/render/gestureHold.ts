/**
 * Per-hand "held gesture" tracker.
 *
 * When a hand starts holding a (non-unknown) gesture, we capture a reference
 * pose: the hand centre, depth and in-plane rotation at that instant. While the
 * same gesture is held, we report the delta of the current pose relative to
 * that reference. Changing gesture, going unknown, or losing the hand resets
 * the reference.
 *
 * Coordinates are in MediaPipe normalized space (the same space used for
 * detection), so deltas are resolution-independent. Note: callers pass the
 * mirror flag so the captured rotation matches what the user sees on screen.
 */

import type { NormalizedLandmark, GlyphType } from '../gestures/types';
import { FingerIndices, PalmIndices } from '../gestures/types';

export interface HoldDelta {
  dx: number;
  dy: number;
  dz: number;
  dAngle: number; // signed degrees
}

interface HoldRef {
  gesture: GlyphType;
  cx: number;
  cy: number;
  cz: number;
  angle: number;
}

const PALM_POINTS = [
  PalmIndices.wrist,
  PalmIndices.indexBase,
  PalmIndices.middleBase,
  PalmIndices.ringBase,
  PalmIndices.pinkyBase
];

function palmCentre(landmarks: NormalizedLandmark[]): { x: number; y: number; z: number } {
  let x = 0, y = 0, z = 0;
  for (const i of PALM_POINTS) {
    x += landmarks[i].x;
    y += landmarks[i].y;
    z += landmarks[i].z;
  }
  const n = PALM_POINTS.length;
  return { x: x / n, y: y / n, z: z / n };
}

/** In-plane orientation of the hand: wrist -> middle-finger base, in degrees. */
function handAngle(landmarks: NormalizedLandmark[], mirror: boolean): number {
  const wrist = landmarks[PalmIndices.wrist];
  const mid = landmarks[FingerIndices.middle.base];
  const dx = (mid.x - wrist.x) * (mirror ? -1 : 1);
  const dy = mid.y - wrist.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/** Normalise an angle difference into (-180, 180]. */
function normaliseAngle(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export class GestureHoldTracker {
  private refs = new Map<string, HoldRef>();

  /**
   * Update with the latest detection for a hand.
   * Returns the current delta if a gesture is being held, else null.
   */
  update(
    id: string,
    gesture: GlyphType,
    landmarks: NormalizedLandmark[],
    mirror: boolean
  ): HoldDelta | null {
    if (gesture === 'unknown') {
      this.refs.delete(id);
      return null;
    }

    const centre = palmCentre(landmarks);
    const angle = handAngle(landmarks, mirror);

    const ref = this.refs.get(id);
    if (!ref || ref.gesture !== gesture) {
      // (Re)capture the reference pose for this newly-held gesture.
      this.refs.set(id, { gesture, cx: centre.x, cy: centre.y, cz: centre.z, angle });
      return { dx: 0, dy: 0, dz: 0, dAngle: 0 };
    }

    const dx = (centre.x - ref.cx) * (mirror ? -1 : 1);
    return {
      dx,
      dy: centre.y - ref.cy,
      dz: centre.z - ref.cz,
      dAngle: normaliseAngle(angle - ref.angle)
    };
  }

  /** Drop the reference for a hand that is no longer detected. */
  release(id: string): void {
    this.refs.delete(id);
  }
}

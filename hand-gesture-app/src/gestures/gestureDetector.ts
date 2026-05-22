/**
 * Hand Gesture Detector
 *
 * Simplified to the four gestures shown in the reference photos:
 *   - star          : open hand, all five fingers spread wide
 *   - filled_circle : closed fist
 *   - dash          : flat hand held sideways (fingers extended, horizontal spread)
 *   - V             : index + middle extended (peace / victory)
 *
 * Everything else falls through to `unknown`.
 */

import type {
  NormalizedLandmark,
  Handedness,
  DetectedGlyph,
  GlyphType,
  CheckResult
} from './types'
import {
  FingerIndices,
  PalmIndices
} from './types'

// Thresholds for gesture detection
const FINGER_EXTENDED_ANGLE = 130 // Degrees - finger is extended if angle > this
const FINGER_FOLDED_ANGLE   = 70 // Degrees - finger is folded if angle < this

/**
 * Calculate Euclidean (3D) distance between two landmarks
 */
function distance (l1: NormalizedLandmark, l2: NormalizedLandmark): number {
  const dx = l2.x - l1.x
  const dy = l2.y - l1.y
  const dz = l2.z - l1.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Calculate angle between three points (in degrees). p2 is the vertex.
 */
function angle (p1: NormalizedLandmark, p2: NormalizedLandmark, p3: NormalizedLandmark): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y }
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y }

  const dot  = v1.x * v2.x + v1.y * v2.y
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)

  const cosTheta = dot / (mag1 * mag2)
  return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI)
}

/**
 * Joint angle for a finger (base -> first knuckle -> tip).
 */
function fingerJointAngle (landmarks: NormalizedLandmark[], finger: keyof typeof FingerIndices): number {
  const indices = FingerIndices[finger]
  const base    = landmarks[indices.base]
  const mid1    = landmarks[indices.base + 1]
  const tip     = landmarks[indices.tip]
  return angle(base, mid1, tip)
}

/** Check if a finger is extended (straight). */
function isFingerExtended (landmarks: NormalizedLandmark[], finger: keyof typeof FingerIndices): boolean {
  return fingerJointAngle(landmarks, finger) > FINGER_EXTENDED_ANGLE
}

/** Check if a finger is folded (bent toward palm). */
function isFingerFolded (landmarks: NormalizedLandmark[], finger: keyof typeof FingerIndices): boolean {
  return fingerJointAngle(landmarks, finger) < FINGER_FOLDED_ANGLE
}

/**
 * Closed fist -> filled circle.
 * All four fingers folded, no fingers extended, thumb tucked toward its base.
 */
function isFist (landmarks: NormalizedLandmark[]): boolean {
  const fingers: (keyof typeof FingerIndices)[] = [ 'index', 'middle', 'ring', 'pinky' ]

  const allFingersFolded  = fingers.every(finger => isFingerFolded(landmarks, finger))
  const noFingersExtended = fingers.every(finger => !isFingerExtended(landmarks, finger))

  const thumbTip    = landmarks[FingerIndices.thumb.tip]
  const thumbBase   = landmarks[FingerIndices.thumb.base]
  const thumbFolded = distance(thumbTip, thumbBase) < 0.15

  return allFingersFolded && noFingersExtended && thumbFolded
}

/**
 * Open hand, fingers spread wide -> star.
 * All five fingers extended and horizontally spread apart.
 */
function isStar (landmarks: NormalizedLandmark[]): boolean {
  const fingers: (keyof typeof FingerIndices)[] = [ 'thumb', 'index', 'middle', 'ring', 'pinky' ]

  const allExtended = fingers.every(finger => isFingerExtended(landmarks, finger))

  if (!allExtended)
    return false

  const indexTip = landmarks[FingerIndices.index.tip]
  const pinkyTip = landmarks[FingerIndices.pinky.tip]
  const thumbTip = landmarks[FingerIndices.thumb.tip]

  const fingerSpread = Math.abs(indexTip.x - pinkyTip.x)
  const thumbSpread  = Math.abs(thumbTip.x - indexTip.x)

  return fingerSpread > 0.25 && thumbSpread > 0.15
}

/**
 * Flat hand held sideways -> dash.
 * All four fingers extended, tips spread horizontally rather than vertically.
 */
function isDash (landmarks: NormalizedLandmark[]): boolean {
  const fingers: (keyof typeof FingerIndices)[] = [ 'index', 'middle', 'ring', 'pinky' ]

  const allExtended = fingers.every(f => isFingerExtended(landmarks, f))

  if (!allExtended)
    return false

  const indexTip = landmarks[FingerIndices.index.tip]
  const pinkyTip = landmarks[FingerIndices.pinky.tip]

  const yDiff = Math.abs(indexTip.y - pinkyTip.y)
  const xDiff = Math.abs(indexTip.x - pinkyTip.x)

  // Horizontal orientation: the hand lies on its side.
  return xDiff > yDiff && xDiff > 0.2 && yDiff < 0.12
}

/**
 * Index + middle extended, ring + pinky folded -> V (peace sign).
 */
function isV (landmarks: NormalizedLandmark[]): boolean {
  const indexTip  = landmarks[FingerIndices.index.tip]
  const middleTip = landmarks[FingerIndices.middle.tip]
  const wrist     = landmarks[PalmIndices.wrist]

  const indexExtended  = isFingerExtended(landmarks, 'index')
  const middleExtended = isFingerExtended(landmarks, 'middle')
  const ringFolded     = isFingerFolded(landmarks, 'ring')
  const pinkyFolded    = isFingerFolded(landmarks, 'pinky')

  if (!indexExtended || !middleExtended || !ringFolded || !pinkyFolded)
    return false

  // The two fingers should fan out from the wrist within a sensible range.
  const vAngle = angle(indexTip, wrist, middleTip)
  return vAngle > 8 && vAngle < 70
}

/**
 * Calculate bounding box of hand landmarks
 */
type CalculateBoundingBoxReturnType = { x: number; y: number; width: number; height: number }

function calculateBoundingBox (landmarks: NormalizedLandmark[]): CalculateBoundingBoxReturnType {
  let minX = 1,
    maxX   = 0,
    minY   = 1,
    maxY   = 0

  landmarks.forEach(l => {
    minX = Math.min(minX, l.x)
    maxX = Math.max(maxX, l.x)
    minY = Math.min(minY, l.y)
    maxY = Math.max(maxY, l.y)
  })

  return {
    x:      minX,
    y:      minY,
    width:  maxX - minX,
    height: maxY - minY
  }
}

const BASE_CONFIDENCE: Record<GlyphType, number> = {
  filled_circle: 0.95,
  star:          0.85,
  V:             0.85,
  dash:          0.7,
  unknown:       0.3
}

/**
 * Detect hand gesture from landmarks.
 * Checks run from most-specific to most-general.
 */
export function detectGesture (
  landmarks: NormalizedLandmark[],
  handedness: Handedness
): DetectedGlyph {
  const boundingBox = calculateBoundingBox(landmarks)
  const handLabel   = (handedness?.label?.toLowerCase() as 'left' | 'right' | 'unknown') || 'unknown'

  const make = (type: GlyphType): DetectedGlyph => ({
    type,
    hand:       handLabel,
    confidence: BASE_CONFIDENCE[type],
    landmarks,
    boundingBox
  })

  if (isFist(landmarks))
    return make('filled_circle')
  if (isV(landmarks))
    return make('V')
  if (isStar(landmarks))
    return make('star')
  if (isDash(landmarks))
    return make('dash')

  return make('unknown')
}

/**
 * Detect gestures for multiple hands
 */
export function detectGestures (
  allLandmarks: NormalizedLandmark[][],
  allHandedness: Handedness[]
): DetectedGlyph[] {
  return allLandmarks.map((landmarks, index) =>
    detectGesture(landmarks, allHandedness[index])
  )
}

/**
 * Run all gesture check functions and return their results (debug overlay).
 */
export function runAllChecks (landmarks: NormalizedLandmark[]): CheckResult[] {
  const checks: Array<{ name: string; fn: (l: NormalizedLandmark[]) => boolean }> = [
    { name: 'isFist (filled_circle)', fn: isFist },
    { name: 'isV', fn: isV },
    { name: 'isStar', fn: isStar },
    { name: 'isDash', fn: isDash },
  ]

  return checks.map(check => ({
    name:   check.name,
    passed: check.fn(landmarks),
  }))
}

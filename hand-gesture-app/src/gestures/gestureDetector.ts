/**
 * Hand Gesture Detector
 *
 * Detects a small set of gestures (matching the reference photos) plus a
 * refining sub-gesture for each:
 *
 *   - palm   : open hand, all fingers extended, pointing roughly up
 *   - fist   : closed hand            -> sub = set of fingers kept straight
 *   - circle : thumb touching a finger -> sub = which finger (OK sign)
 *   - V      : index + middle extended -> sub = palm side vs back of hand
 *   - dash   : open hand slashing sideways -> sub = pointing direction (octant)
 *
 * Detection is orientation-independent: instead of relying on absolute joint
 * angles, fingers are judged "extended" when the fingertip is farther from the
 * wrist than the knuckle is. This works regardless of which way the hand
 * points, which is why the previous angle-only version mis-read the reference
 * photos as unknown.
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


type Finger = keyof typeof FingerIndices

const NON_THUMB: Finger[]   = [ 'index', 'middle', 'ring', 'pinky' ]
const ALL_FINGERS: Finger[] = [ 'thumb', 'index', 'middle', 'ring', 'pinky' ]

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function dist3 (a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = b.x - a.x,
    dy     = b.y - a.y,
    dz     = b.z - a.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Overall hand scale: wrist -> middle-finger knuckle. Normalises thresholds. */
function handScale (landmarks: NormalizedLandmark[]): number {
  const s = dist3(landmarks[PalmIndices.wrist], landmarks[FingerIndices.middle.base])
  return s > 1e-4 ? s : 1e-4
}

/**
 * A non-thumb finger is extended when its tip sits clearly farther from the
 * wrist than its first knuckle (base+1 / PIP joint).
 */
function isFingerExtended (landmarks: NormalizedLandmark[], finger: Finger, scale: number): boolean {
  if (finger === 'thumb')
    return isThumbExtended(landmarks, scale)

  const idx   = FingerIndices[finger]
  const wrist = landmarks[PalmIndices.wrist]
  const tip   = landmarks[idx.tip]
  const pip   = landmarks[idx.base + 1]
  return dist3(tip, wrist) > dist3(pip, wrist) + 0.10 * scale
}

/** Thumb extended when its tip is splayed away from the palm. */
function isThumbExtended (landmarks: NormalizedLandmark[], scale: number): boolean {
  const thumbTip = landmarks[FingerIndices.thumb.tip]
  const indexMcp = landmarks[FingerIndices.index.base]
  const pinkyMcp = landmarks[FingerIndices.pinky.base]
  return dist3(thumbTip, indexMcp) > 0.7 * scale && dist3(thumbTip, pinkyMcp) > 0.6 * scale
}

function extendedSet (landmarks: NormalizedLandmark[], scale: number): Record<Finger, boolean> {
  return {
    thumb:  isFingerExtended(landmarks, 'thumb', scale),
    index:  isFingerExtended(landmarks, 'index', scale),
    middle: isFingerExtended(landmarks, 'middle', scale),
    ring:   isFingerExtended(landmarks, 'ring', scale),
    pinky:  isFingerExtended(landmarks, 'pinky', scale)
  }
}

// ---------------------------------------------------------------------------
// Sub-gesture helpers
// ---------------------------------------------------------------------------

/** Which finger (if any) the thumb tip is touching. */
function thumbTouchingFinger (landmarks: NormalizedLandmark[], scale: number): Finger | null {
  const thumbTip = landmarks[FingerIndices.thumb.tip]
  let best: Finger | null = null
  let bestDist            = 0.55 * scale
  for (const finger of NON_THUMB) {
    const d = dist3(thumbTip, landmarks[FingerIndices[finger].tip])
    if (d < bestDist) {
      bestDist = d
      best     = finger
    }
  }
  return best
}

const OCTANTS = [
  { tok: 'N', arrow: '\u2191' },
  { tok: 'NE', arrow: '\u2197' },
  { tok: 'E', arrow: '\u2192' },
  { tok: 'SE', arrow: '\u2198' },
  { tok: 'S', arrow: '\u2193' },
  { tok: 'SW', arrow: '\u2199' },
  { tok: 'W', arrow: '\u2190' },
  { tok: 'NW', arrow: '\u2196' }
]

/**
 * Pointing direction of the hand (wrist -> middle fingertip), quantised into 8
 * compass octants. `mirror` flips x so the direction matches the mirrored
 * on-screen preview.
 */
type PointingOctantReturnType = { tok: string; label: string; deg: number }

function pointingOctant (landmarks: NormalizedLandmark[], mirror: boolean): PointingOctantReturnType {
  const wrist = landmarks[PalmIndices.wrist]
  const tip   = landmarks[FingerIndices.middle.tip]
  const dx    = (tip.x - wrist.x) * (mirror ? -1 : 1)
  const dy    = tip.y - wrist.y
  let deg     = Math.atan2(dx, -dy) * (180 / Math.PI)
  if (deg < 0)
    deg += 360

  const sector = Math.round(deg / 45) % 8
  const o      = OCTANTS[sector]
  return { tok: o.tok, label: `${o.arrow} ${o.tok}  (${Math.round(deg)}\u00b0)`, deg }
}

/** Angle of the pointing vector away from straight-up, in degrees. */
function tiltFromVertical (landmarks: NormalizedLandmark[]): number {
  const wrist = landmarks[PalmIndices.wrist]
  const tip   = landmarks[FingerIndices.middle.tip]
  const dx    = tip.x - wrist.x
  const dy    = tip.y - wrist.y
  return Math.abs(Math.atan2(dx, -dy) * (180 / Math.PI))
}

/**
 * Whether the palm faces the camera, via the z-component of the palm-triangle
 * normal (wrist, index knuckle, pinky knuckle). `mirror` flips x to match the
 * preview. The palm/back convention may need a single sign flip per setup.
 */
function palmFacing (landmarks: NormalizedLandmark[], mirror: boolean): boolean {
  const m  = mirror ? -1 : 1
  const w  = landmarks[PalmIndices.wrist]
  const i  = landmarks[FingerIndices.index.base]
  const p  = landmarks[FingerIndices.pinky.base]
  const ax = (i.x - w.x) * m,
    ay     = i.y - w.y
  const bx = (p.x - w.x) * m,
    by     = p.y - w.y
  const nz = ax * by - ay * bx
  return nz < 0
}

// ---------------------------------------------------------------------------
// Primary gesture predicates
// ---------------------------------------------------------------------------

/** circle / OK sign: thumb touches a finger, with other fingers mostly open. */
function detectCircle (landmarks: NormalizedLandmark[], ext: Record<Finger, boolean>, scale: number): Finger | null {
  const touched = thumbTouchingFinger(landmarks, scale)
  if (!touched)
    return null

  const others    = NON_THUMB.filter(f => f !== touched)
  const openCount = others.filter(f => ext[f]).length
  return openCount >= 2 ? touched : null
}

function isV (ext: Record<Finger, boolean>): boolean {
  return ext.index && ext.middle && !ext.ring && !ext.pinky
}

// ---------------------------------------------------------------------------
// Bounding box + confidence
// ---------------------------------------------------------------------------
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
  fist:    0.9,
  circle:  0.88,
  V:       0.85,
  palm:    0.85,
  dash:    0.8,
  unknown: 0.3
}

const FINGER_LABEL: Record<Finger, string> = {
  thumb:  'THUMB',
  index:  'INDEX',
  middle: 'MIDDLE',
  ring:   'RING',
  pinky:  'PINKY'
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------
export function detectGesture (
  landmarks: NormalizedLandmark[],
  handedness: Handedness,
  mirror: boolean = false
): DetectedGlyph {
  const boundingBox = calculateBoundingBox(landmarks)
  const handLabel   = (handedness?.label?.toLowerCase() as 'left' | 'right' | 'unknown') || 'unknown'
  const scale       = handScale(landmarks)
  const ext         = extendedSet(landmarks, scale)

  const make = (type: GlyphType, subGesture?: string, subLabel?: string): DetectedGlyph => ({
    type,
    subGesture,
    subLabel,
    hand:       handLabel,
    confidence: BASE_CONFIDENCE[type],
    landmarks,
    boundingBox
  })

  // 1. circle / OK (thumb touches a finger).
  const circleFinger = detectCircle(landmarks, ext, scale)
  if (circleFinger)
    return make('circle', circleFinger.toUpperCase(), `\uD83D\uDC46 ${FINGER_LABEL[circleFinger]}`)

  // 2. V (index + middle only) -> sub = facing.
  if (isV(ext)) {
    const facing = palmFacing(landmarks, mirror)
    return make('V', facing ? 'PALM' : 'BACK', facing ? 'PALM SIDE' : 'BACK SIDE')
  }

  // 3. all four fingers extended -> palm (upright) or dash (slashing sideways).
  const fourExtended = ext.index && ext.middle && ext.ring && ext.pinky
  if (fourExtended) {
    const tilt = tiltFromVertical(landmarks)
    if (tilt < 35)
      return make('palm')

    const oct = pointingOctant(landmarks, mirror)
    return make('dash', oct.tok, oct.label)
  }

  // 4. fist (>= 2 fingers folded) -> sub = which fingers are kept straight.
  const foldedCount = NON_THUMB.filter(f => !ext[f]).length
  if (foldedCount >= 2) {
    const straight = ALL_FINGERS.filter(f => ext[f])
    if (straight.length === 0)
      return make('fist', 'CLOSED', 'CLOSED')

    const tok   = straight.map(f => f.toUpperCase()).join('+')
    const label = straight.map(f => FINGER_LABEL[f]).join(' + ')
    return make('fist', tok, label)
  }

  return make('unknown')
}

export function detectGestures (
  allLandmarks: NormalizedLandmark[][],
  allHandedness: Handedness[],
  mirror: boolean = false
): DetectedGlyph[] {
  return allLandmarks.map((landmarks, index) =>
    detectGesture(landmarks, allHandedness[index], mirror)
  )
}

/** Debug overlay helper: per-finger extension + the resolved gesture. */
export function runAllChecks (landmarks: NormalizedLandmark[]): CheckResult[] {
  const scale = handScale(landmarks)
  const ext   = extendedSet(landmarks, scale)
  const g     = detectGesture(landmarks, { label: 'Right', score: 1, index: 0 })
  return [
    { name: `=> ${g.type}${g.subLabel ? ' [' + g.subLabel + ']' : ''}`, passed: g.type !== 'unknown' },
    { name: 'thumb extended', passed: ext.thumb },
    { name: 'index extended', passed: ext.index },
    { name: 'middle extended', passed: ext.middle },
    { name: 'ring extended', passed: ext.ring },
    { name: 'pinky extended', passed: ext.pinky }
  ]
}

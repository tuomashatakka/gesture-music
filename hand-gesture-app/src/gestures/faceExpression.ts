/**
 * Lightweight facial-expression detector for MediaPipe Holistic face landmarks.
 *
 * Uses a few canonical landmark indices (valid in both the 468- and 478-point
 * face meshes) and simple ratios normalised by the inter-ocular distance, so it
 * is resolution-independent. Heuristic, not ML — good enough for a fun glyph.
 */

import type { NormalizedLandmark } from './types'

export type ExpressionType = 'smile' | 'neutral' | 'surprise' | 'unknown'

export interface DetectedExpression {
  type: ExpressionType
  confidence: number
}

// Canonical face-mesh indices
const LEFT_EYE_OUTER  = 33
const RIGHT_EYE_OUTER = 263
const UPPER_LIP_INNER = 13
const LOWER_LIP_INNER = 14
const MOUTH_LEFT      = 61
const MOUTH_RIGHT     = 291

function dist2 (a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = b.x - a.x, dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Classify a facial expression from face landmarks.
 * Returns `unknown` if the landmark array is too small.
 */
export function detectExpression (face: NormalizedLandmark[]): DetectedExpression {
  if (!face || face.length < 292)
    return { type: 'unknown', confidence: 0 }

  const eyeDist = dist2(face[LEFT_EYE_OUTER], face[RIGHT_EYE_OUTER])
  if (eyeDist < 1e-4)
    return { type: 'unknown', confidence: 0 }

  const upper  = face[UPPER_LIP_INNER]
  const lower  = face[LOWER_LIP_INNER]
  const left   = face[MOUTH_LEFT]
  const right  = face[MOUTH_RIGHT]

  const mouthOpen  = dist2(upper, lower) / eyeDist
  const mouthWidth = dist2(left, right) / eyeDist

  // Corners lifted above the lip midline -> smile (screen y grows downward).
  const lipMidY     = (upper.y + lower.y) / 2
  const cornerY     = (left.y + right.y) / 2
  const cornerLift  = (lipMidY - cornerY) / eyeDist

  if (mouthOpen > 0.32)
    return { type: 'surprise', confidence: 0.8 }
  if (cornerLift > 0.03 && mouthWidth > 0.95)
    return { type: 'smile', confidence: 0.75 }
  return { type: 'neutral', confidence: 0.6 }
}

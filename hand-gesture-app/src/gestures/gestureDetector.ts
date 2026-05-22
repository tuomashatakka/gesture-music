/**
 * Hand Gesture Detector
 * Analyzes hand landmarks to detect various glyph shapes
 */

import { 
  NormalizedLandmark, 
  Handedness, 
  GlyphType, 
  CircleVariant, 
  DetectedGlyph,
  FingerIndices,
  PalmIndices 
} from './types';

// Thresholds for gesture detection
const THUMB_FINGER_DISTANCE_THRESHOLD = 0.15; // Normalized distance for thumb-finger connection
const FINGER_EXTENDED_ANGLE = 140; // Degrees - finger is extended if angle > this
const FINGER_FOLDED_ANGLE = 60; // Degrees - finger is folded if angle < this
const FINGER_SPREAD_THRESHOLD = 0.1; // Normalized distance between finger tips

/**
 * Calculate Euclidean distance between two landmarks
 */
function distance(l1: NormalizedLandmark, l2: NormalizedLandmark): number {
  const dx = l2.x - l1.x;
  const dy = l2.y - l1.y;
  const dz = l2.z - l1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate 2D distance (ignoring z-axis)
 */
function distance2D(l1: NormalizedLandmark, l2: NormalizedLandmark): number {
  const dx = l2.x - l1.x;
  const dy = l2.y - l1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate angle between three points (in degrees)
 * p2 is the vertex
 */
function angle(p1: NormalizedLandmark, p2: NormalizedLandmark, p3: NormalizedLandmark): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  
  const cosTheta = dot / (mag1 * mag2);
  return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI);
}

/**
 * Check if a finger is extended (straight)
 */
function isFingerExtended(landmarks: NormalizedLandmark, finger: keyof typeof FingerIndices): boolean {
  const indices = FingerIndices[finger];
  // Check angle at the middle joint (between base, middle, tip)
  const base = landmarks[indices.base];
  const mid1 = landmarks[indices.base + 1];
  const mid2 = landmarks[indices.base + 2];
  const tip = landmarks[indices.tip];
  
  const jointAngle = angle(base, mid1, tip);
  return jointAngle > FINGER_EXTENDED_ANGLE;
}

/**
 * Check if a finger is folded (bent)
 */
function isFingerFolded(landmarks: NormalizedLandmark, finger: keyof typeof FingerIndices): boolean {
  const indices = FingerIndices[finger];
  const base = landmarks[indices.base];
  const mid1 = landmarks[indices.base + 1];
  const tip = landmarks[indices.tip];
  
  const jointAngle = angle(base, mid1, tip);
  return jointAngle < FINGER_FOLDED_ANGLE;
}

/**
 * Check if thumb is touching a specific finger
 */
function isThumbTouchingFinger(
  landmarks: NormalizedLandmark,
  finger: keyof typeof FingerIndices
): boolean {
  const thumbTip = landmarks[FingerIndices.thumb.tip];
  const fingerTip = landmarks[FingerIndices[finger].tip];
  
  return distance(thumbTip, fingerTip) < THUMB_FINGER_DISTANCE_THRESHOLD;
}

/**
 * Get which finger the thumb is touching, if any
 */
function getThumbConnection(landmarks: NormalizedLandmark): CircleVariant {
  const fingers: (keyof typeof FingerIndices)[] = ['index', 'middle', 'ring', 'pinky'];
  
  for (const finger of fingers) {
    if (isThumbTouchingFinger(landmarks, finger)) {
      return `thumb_${finger}` as CircleVariant;
    }
  }
  
  return 'thumb_none';
}

/**
 * Check if all fingers are folded (fist)
 */
function isFist(landmarks: NormalizedLandmark): boolean {
  const fingers: (keyof typeof FingerIndices)[] = ['index', 'middle', 'ring', 'pinky'];
  
  // All fingers must be folded
  const allFingersFolded = fingers.every(finger => 
    isFingerFolded(landmarks, finger)
  );
  
  // Thumb should also be folded towards palm
  const thumbTip = landmarks[FingerIndices.thumb.tip];
  const thumbBase = landmarks[FingerIndices.thumb.base];
  const palmCenter = landmarks[PalmIndices.wrist];
  
  // Thumb tip should be close to palm
  const thumbFolded = distance(thumbTip, thumbBase) < 0.1;
  
  return allFingersFolded && thumbFolded;
}

/**
 * Check if hand is forming a circle (thumb touching a finger, other fingers extended)
 */
function isCircle(landmarks: NormalizedLandmark): { isCircle: boolean; variant: CircleVariant } {
  const thumbConnection = getThumbConnection(landmarks);
  
  if (thumbConnection === 'thumb_none') {
    return { isCircle: false, variant: 'thumb_none' };
  }
  
  // For circle, the finger being touched should be extended
  const touchedFinger = thumbConnection.replace('thumb_', '') as keyof typeof FingerIndices;
  const fingerExtended = isFingerExtended(landmarks, touchedFinger);
  
  // Other fingers should be relatively extended too
  const otherFingers: (keyof typeof FingerIndices)[] = ['index', 'middle', 'ring', 'pinky'];
  const otherFingersExtended = otherFingers
    .filter(f => f !== touchedFinger)
    .every(f => isFingerExtended(landmarks, f) || !isFingerFolded(landmarks, f));
  
  if (fingerExtended && otherFingersExtended) {
    return { isCircle: true, variant: thumbConnection };
  }
  
  return { isCircle: false, variant: thumbConnection };
}

/**
 * Check if hand is forming a dash (horizontal line - flat hand, palm down)
 */
function isDash(landmarks: NormalizedLandmark): boolean {
  const fingers: (keyof typeof FingerIndices)[] = ['index', 'middle', 'ring', 'pinky'];
  
  // All fingers extended and parallel
  const allExtended = fingers.every(f => isFingerExtended(landmarks, f));
  if (!allExtended) return false;
  
  // Check if fingers are spread horizontally (similar y positions)
  const indexTip = landmarks[FingerIndices.index.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  
  const yDiff = Math.abs(indexTip.y - pinkyTip.y);
  const xDiff = Math.abs(indexTip.x - pinkyTip.x);
  
  // Horizontal orientation: x difference > y difference
  return xDiff > yDiff && xDiff > 0.15;
}

/**
 * Check if hand is forming a slash (diagonal line - hand at angle)
 */
function isSlash(landmarks: NormalizedLandmark): boolean {
  const fingers: (keyof typeof FingerIndices)[] = ['index', 'middle', 'ring', 'pinky'];
  
  // All fingers extended
  const allExtended = fingers.every(f => isFingerExtended(landmarks, f));
  if (!allExtended) return false;
  
  // Check diagonal orientation
  const indexTip = landmarks[FingerIndices.index.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  
  const yDiff = Math.abs(indexTip.y - pinkyTip.y);
  const xDiff = Math.abs(indexTip.x - pinkyTip.x);
  
  // Diagonal: both x and y differences are significant and roughly equal
  return xDiff > 0.15 && yDiff > 0.15 && Math.abs(xDiff - yDiff) < 0.05;
}

/**
 * Check if hand is forming a triangle (index and middle extended, others folded)
 */
function isTriangle(landmarks: NormalizedLandmark): boolean {
  const indexExtended = isFingerExtended(landmarks, 'index');
  const middleExtended = isFingerExtended(landmarks, 'middle');
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  
  // Thumb should be touching or close to index/middle
  const thumbClose = distance(
    landmarks[FingerIndices.thumb.tip],
    landmarks[FingerIndices.index.tip]
  ) < 0.2 || distance(
    landmarks[FingerIndices.thumb.tip],
    landmarks[FingerIndices.middle.tip]
  ) < 0.2;
  
  return indexExtended && middleExtended && ringFolded && pinkyFolded && thumbClose;
}

/**
 * Check if hand is forming a square (index and middle extended at right angle)
 */
function isSquare(landmarks: NormalizedLandmark): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  const ringTip = landmarks[FingerIndices.ring.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  
  const indexExtended = isFingerExtended(landmarks, 'index');
  const middleExtended = isFingerExtended(landmarks, 'middle');
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  
  if (!indexExtended || !middleExtended || !ringFolded || !pinkyFolded) {
    return false;
  }
  
  // Check if index and middle are at right angle
  const wrist = landmarks[PalmIndices.wrist];
  const indexBase = landmarks[FingerIndices.index.base];
  const middleBase = landmarks[FingerIndices.middle.base];
  
  const indexAngle = angle(wrist, indexBase, indexTip);
  const middleAngle = angle(wrist, middleBase, middleTip);
  
  // Angles should be roughly perpendicular
  const angleDiff = Math.abs(indexAngle - middleAngle);
  return angleDiff > 70 && angleDiff < 110;
}

/**
 * Check if hand is forming salmiakki (Scandinavian candy symbol - like X but specific hand position)
 * Typically: index and middle crossed, or specific finger arrangement
 */
function isSalmiakki(landmarks: NormalizedLandmark): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  const ringTip = landmarks[FingerIndices.ring.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  
  // Check if index and middle are crossed (index tip is to the right of middle tip)
  const fingersCrossed = indexTip.x > middleTip.x && 
    Math.abs(indexTip.y - middleTip.y) < 0.1;
  
  // Alternative: all fingers except thumb folded, thumb extended
  const thumbExtended = isFingerExtended(landmarks, 'thumb');
  const otherFingersFolded = 
    isFingerFolded(landmarks, 'index') &&
    isFingerFolded(landmarks, 'middle') &&
    isFingerFolded(landmarks, 'ring') &&
    isFingerFolded(landmarks, 'pinky');
  
  return fingersCrossed || (thumbExtended && otherFingersFolded);
}

/**
 * Check if hand is forming an X (crossed fingers)
 */
function isX(landmarks: NormalizedLandmark): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  
  // Check if index and middle are crossed (index tip is to the right of middle base)
  const middleBase = landmarks[FingerIndices.middle.base];
  
  const fingersCrossed = indexTip.x > middleBase.x && 
    Math.abs(indexTip.y - middleBase.y) < 0.15;
  
  // Also check that other fingers are in position
  const ringTip = landmarks[FingerIndices.ring.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  
  // Ring and pinky should be somewhat extended or neutral
  const ringNeutral = !isFingerFolded(landmarks, 'ring');
  const pinkyNeutral = !isFingerFolded(landmarks, 'pinky');
  
  return fingersCrossed && ringNeutral && pinkyNeutral;
}

/**
 * Check if hand is forming an I (single finger extended - index)
 */
function isI(landmarks: NormalizedLandmark): boolean {
  const indexExtended = isFingerExtended(landmarks, 'index');
  const middleFolded = isFingerFolded(landmarks, 'middle');
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  const thumbFolded = isFingerFolded(landmarks, 'thumb');
  
  return indexExtended && middleFolded && ringFolded && pinkyFolded && thumbFolded;
}

/**
 * Check if hand is forming a V (index and middle extended, forming V shape)
 */
function isV(landmarks: NormalizedLandmark): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  const indexBase = landmarks[FingerIndices.index.base];
  const middleBase = landmarks[FingerIndices.middle.base];
  
  const indexExtended = isFingerExtended(landmarks, 'index');
  const middleExtended = isFingerExtended(landmarks, 'middle');
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  
  if (!indexExtended || !middleExtended || !ringFolded || !pinkyFolded) {
    return false;
  }
  
  // Check V shape: tips should be closer together than bases
  const tipDistance = distance2D(indexTip, middleTip);
  const baseDistance = distance2D(indexBase, middleBase);
  
  return tipDistance < baseDistance * 0.8;
}

/**
 * Calculate bounding box of hand landmarks
 */
function calculateBoundingBox(landmarks: NormalizedLandmark[]): { x: number; y: number; width: number; height: number } {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  
  landmarks.forEach(l => {
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x);
    minY = Math.min(minY, l.y);
    maxY = Math.max(maxY, l.y);
  });
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Detect hand gesture from landmarks
 */
export function detectGesture(
  landmarks: NormalizedLandmark[],
  handedness: Handedness
): DetectedGlyph {
  const boundingBox = calculateBoundingBox(landmarks);
  const handLabel = handedness?.label?.toLowerCase() as 'left' | 'right' | 'unknown' || 'unknown';
  
  // Try each gesture in order of specificity
  
  // 1. Check for filled circle (fist)
  if (isFist(landmarks)) {
    return {
      type: 'filled_circle',
      hand: handLabel,
      confidence: 0.95,
      landmarks,
      boundingBox
    };
  }
  
  // 2. Check for circle with thumb connection
  const circleResult = isCircle(landmarks);
  if (circleResult.isCircle) {
    return {
      type: 'circle',
      variant: circleResult.variant,
      hand: handLabel,
      confidence: 0.9,
      landmarks,
      boundingBox
    };
  }
  
  // 3. Check for V
  if (isV(landmarks)) {
    return {
      type: 'V',
      hand: handLabel,
      confidence: 0.85,
      landmarks,
      boundingBox
    };
  }
  
  // 4. Check for I
  if (isI(landmarks)) {
    return {
      type: 'I',
      hand: handLabel,
      confidence: 0.85,
      landmarks,
      boundingBox
    };
  }
  
  // 5. Check for X
  if (isX(landmarks)) {
    return {
      type: 'X',
      hand: handLabel,
      confidence: 0.85,
      landmarks,
      boundingBox
    };
  }
  
  // 6. Check for salmiakki
  if (isSalmiakki(landmarks)) {
    return {
      type: 'salmiakki',
      hand: handLabel,
      confidence: 0.8,
      landmarks,
      boundingBox
    };
  }
  
  // 7. Check for triangle
  if (isTriangle(landmarks)) {
    return {
      type: 'triangle',
      hand: handLabel,
      confidence: 0.8,
      landmarks,
      boundingBox
    };
  }
  
  // 8. Check for square
  if (isSquare(landmarks)) {
    return {
      type: 'square',
      hand: handLabel,
      confidence: 0.75,
      landmarks,
      boundingBox
    };
  }
  
  // 9. Check for slash
  if (isSlash(landmarks)) {
    return {
      type: 'slash',
      hand: handLabel,
      confidence: 0.75,
      landmarks,
      boundingBox
    };
  }
  
  // 10. Check for dash
  if (isDash(landmarks)) {
    return {
      type: 'dash',
      hand: handLabel,
      confidence: 0.7,
      landmarks,
      boundingBox
    };
  }
  
  // Default: unknown
  return {
    type: 'unknown',
    hand: handLabel,
    confidence: 0.1,
    landmarks,
    boundingBox
  };
}

/**
 * Detect gestures for multiple hands
 */
export function detectGestures(
  allLandmarks: NormalizedLandmark[][],
  allHandedness: Handedness[]
): DetectedGlyph[] {
  return allLandmarks.map((landmarks, index) => {
    const handedness = allHandedness[index];
    return detectGesture(landmarks, handedness);
  });
}

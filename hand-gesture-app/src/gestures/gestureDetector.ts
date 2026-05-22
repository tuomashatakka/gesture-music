/**
 * Hand Gesture Detector
 * Analyzes hand landmarks to detect various glyph shapes
 */

import type { 
  NormalizedLandmark, 
  Handedness, 
  CircleVariant, 
  DetectedGlyph,
  GlyphType,
  CheckResult
} from './types';
import { 
  FingerIndices,
  PalmIndices 
} from './types';

// Thresholds for gesture detection
const THUMB_FINGER_DISTANCE_THRESHOLD = 0.15; // Normalized distance for thumb-finger connection
const FINGER_EXTENDED_ANGLE = 130; // Degrees - finger is extended if angle > this (more lenient)
const FINGER_FOLDED_ANGLE = 70; // Degrees - finger is folded if angle < this (more realistic)
const FINGER_NEUTRAL_LOW = 70; // Lower bound for neutral position
const FINGER_NEUTRAL_HIGH = 130; // Upper bound for neutral position

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
function isFingerExtended(landmarks: NormalizedLandmark[], finger: keyof typeof FingerIndices): boolean {
  const indices = FingerIndices[finger];
  // Check angle at the middle joint (between base, middle, tip)
  const base = landmarks[indices.base];
  const mid1 = landmarks[indices.base + 1];
  const tip = landmarks[indices.tip];
  
  const jointAngle = angle(base, mid1, tip);
  return jointAngle > FINGER_EXTENDED_ANGLE;
}

/**
 * Check if a finger is folded (bent)
 */
function isFingerFolded(landmarks: NormalizedLandmark[], finger: keyof typeof FingerIndices): boolean {
  const indices = FingerIndices[finger];
  const base = landmarks[indices.base];
  const mid1 = landmarks[indices.base + 1];
  const tip = landmarks[indices.tip];
  
  const jointAngle = angle(base, mid1, tip);
  return jointAngle < FINGER_FOLDED_ANGLE;
}

/**
 * Check if a finger is in neutral position (not clearly extended or folded)
 */
function isFingerNeutral(landmarks: NormalizedLandmark[], finger: keyof typeof FingerIndices): boolean {
  const indices = FingerIndices[finger];
  const base = landmarks[indices.base];
  const mid1 = landmarks[indices.base + 1];
  const tip = landmarks[indices.tip];
  
  const jointAngle = angle(base, mid1, tip);
  return jointAngle >= FINGER_NEUTRAL_LOW && jointAngle <= FINGER_NEUTRAL_HIGH;
}

/**
 * Check if thumb is touching a specific finger
 */
function isThumbTouchingFinger(
  landmarks: NormalizedLandmark[],
  finger: keyof typeof FingerIndices
): boolean {
  const thumbTip = landmarks[FingerIndices.thumb.tip];
  const fingerTip = landmarks[FingerIndices[finger].tip];
  
  return distance(thumbTip, fingerTip) < THUMB_FINGER_DISTANCE_THRESHOLD;
}

/**
 * Get which finger the thumb is touching, if any
 */
function getThumbConnection(landmarks: NormalizedLandmark[]): CircleVariant {
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
function isFist(landmarks: NormalizedLandmark[]): boolean {
  const fingers: (keyof typeof FingerIndices)[] = ['index', 'middle', 'ring', 'pinky'];
  
  // All fingers must be folded
  const allFingersFolded = fingers.every(finger => 
    isFingerFolded(landmarks, finger)
  );
  
  // Thumb should also be folded towards palm
  const thumbTip = landmarks[FingerIndices.thumb.tip];
  const thumbBase = landmarks[FingerIndices.thumb.base];
  
  // Thumb tip should be close to palm
  const thumbFolded = distance(thumbTip, thumbBase) < 0.15;
  
  // Also check that no fingers are extended
  const noFingersExtended = fingers.every(finger => 
    !isFingerExtended(landmarks, finger)
  );
  
  return allFingersFolded && thumbFolded && noFingersExtended;
}

/**
 * Check if hand is forming a circle (thumb touching a finger, other fingers extended)
 */
function isCircle(landmarks: NormalizedLandmark[]): { isCircle: boolean; variant: CircleVariant } {
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
  
  // For circle detection, we need to ensure this is NOT a fist
  // A fist has all fingers folded, so if all fingers are folded, it's not a circle
  const allFingersFolded = otherFingers.every(f => isFingerFolded(landmarks, f));
  
  if (fingerExtended && otherFingersExtended && !allFingersFolded) {
    return { isCircle: true, variant: thumbConnection };
  }
  
  return { isCircle: false, variant: thumbConnection };
}

/**
 * Check if hand is forming a dash (horizontal line - flat hand, palm down)
 */
function isDash(landmarks: NormalizedLandmark[]): boolean {
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
  // Make dash detection more strict to avoid false positives
  return xDiff > yDiff && xDiff > 0.2 && yDiff < 0.1;
}

/**
 * Check if hand is forming a slash (diagonal line - hand at angle)
 */
function isSlash(landmarks: NormalizedLandmark[]): boolean {
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
function isTriangle(landmarks: NormalizedLandmark[]): boolean {
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
function isSquare(landmarks: NormalizedLandmark[]): boolean {
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
 * Check if hand is forming a heart shape (thumb and index finger forming a heart)
 */
function isHeart(landmarks: NormalizedLandmark[]): boolean {
  const thumbTip = landmarks[FingerIndices.thumb.tip];
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  
  // Thumb and index should be close together (forming the top of the heart)
  const thumbIndexDistance = distance(thumbTip, indexTip);
  
  // Middle finger should be extended downward (forming the point of the heart)
  const middleExtended = isFingerExtended(landmarks, 'middle');
  
  // Ring and pinky should be folded
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  
  // Check the angle between thumb and index (should be acute for heart shape)
  const wrist = landmarks[PalmIndices.wrist];
  const heartAngle = angle(thumbTip, wrist, indexTip);
  
  return thumbIndexDistance < 0.15 && 
    middleExtended && 
    ringFolded && 
    pinkyFolded &&
    heartAngle < 45;
}

/**
 * Check if hand is forming a star shape (all fingers spread wide)
 */
function isStar(landmarks: NormalizedLandmark[]): boolean {
  const fingers: (keyof typeof FingerIndices)[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  
  // All fingers should be extended
  const allExtended = fingers.every(finger => isFingerExtended(landmarks, finger));
  
  if (!allExtended) return false;
  
  // Check that fingers are spread apart
  const indexTip = landmarks[FingerIndices.index.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  const fingerSpread = Math.abs(indexTip.x - pinkyTip.x);
  
  // Check that thumb is also spread away from index
  const thumbTip = landmarks[FingerIndices.thumb.tip];
  const thumbSpread = Math.abs(thumbTip.x - indexTip.x);
  
  return fingerSpread > 0.25 && thumbSpread > 0.15;
}

/**
 * Check if hand is forming a checkmark shape (index finger curved like a checkmark)
 */
function isCheckmark(landmarks: NormalizedLandmark[]): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const indexBase = landmarks[FingerIndices.index.base];
  const middleBase = landmarks[FingerIndices.middle.base];
  
  // Index finger should be extended but curved
  const indexExtended = isFingerExtended(landmarks, 'index');
  
  // Other fingers should be folded
  const middleFolded = isFingerFolded(landmarks, 'middle');
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  const thumbFolded = isFingerFolded(landmarks, 'thumb');
  
  // Check the angle of the index finger (should be curved, not straight)
  const indexAngle = angle(indexBase, landmarks[FingerIndices.index.base + 1], indexTip);
  const isCurved = indexAngle > 90 && indexAngle < 130;
  
  // Check that index tip is positioned like a checkmark (down and to the side)
  const wrist = landmarks[PalmIndices.wrist];
  const checkmarkPosition = indexTip.y > wrist.y && Math.abs(indexTip.x - middleBase.x) > 0.1;
  
  return indexExtended && middleFolded && ringFolded && pinkyFolded && thumbFolded && 
    isCurved && checkmarkPosition;
}

/**
 * Check if hand is forming a peace sign (index and middle fingers extended, V-like but more open)
 */
function isPeace(landmarks: NormalizedLandmark[]): boolean {
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
  
  // For peace sign, fingers should be more parallel than V
  const tipDistance = distance2D(indexTip, middleTip);
  const baseDistance = distance2D(indexBase, middleBase);
  
  // Tips should be roughly the same distance as bases (parallel fingers)
  const isParallel = Math.abs(tipDistance - baseDistance) < 0.05;
  
  // Check angle between fingers (should be small for peace sign)
  const wrist = landmarks[PalmIndices.wrist];
  const peaceAngle = angle(indexTip, wrist, middleTip);
  const isPeaceAngle = peaceAngle < 20;
  
  return isParallel && isPeaceAngle;
}

/**
 * Check if hand is forming salmiakki (Scandinavian candy symbol - like X but specific hand position)
 * Typically: index and middle crossed, or specific finger arrangement
 */
function isSalmiakki(landmarks: NormalizedLandmark[]): boolean {
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
 * Simple gesture detection for common hand positions
 * This provides a fallback when specific gestures aren't clearly detected
 */
function detectSimpleGesture(landmarks: NormalizedLandmark[]): { type: GlyphType; confidence: number } {
  const fingers: (keyof typeof FingerIndices)[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  
  // Count extended fingers
  const extendedCount = fingers.filter(finger => isFingerExtended(landmarks, finger)).length;
  const foldedCount = fingers.filter(finger => isFingerFolded(landmarks, finger)).length;
  const neutralCount = fingers.filter(finger => isFingerNeutral(landmarks, finger)).length;
  
  // Simple heuristics
  if (foldedCount >= 4) {
    return { type: 'filled_circle', confidence: 0.7 };
  }
  if (extendedCount >= 4) {
    return { type: 'star', confidence: 0.6 };
  }
  if (extendedCount === 2 && foldedCount >= 2) {
    return { type: 'V', confidence: 0.5 };
  }
  if (extendedCount === 1 && foldedCount >= 3) {
    return { type: 'I', confidence: 0.6 };
  }
  
  return { type: 'unknown', confidence: 0.3 };
}

/**
 * Check if hand is forming an X (crossed fingers)
 */
function isX(landmarks: NormalizedLandmark[]): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  const middleBase = landmarks[FingerIndices.middle.base];
  const indexBase = landmarks[FingerIndices.index.base];
  
  // Check if index and middle are crossed (index tip is to the right of middle base)
  const fingersCrossed = indexTip.x > middleBase.x && 
    Math.abs(indexTip.y - middleBase.y) < 0.15;
  
  // Also check that middle tip is to the left of index base for proper crossing
  const properCrossing = middleTip.x < indexBase.x;
  
  // Check that fingers are at different heights (not just overlapping)
  const heightDifference = Math.abs(indexTip.y - middleTip.y) > 0.05;
  
  // Also check that other fingers are in position
  const ringTip = landmarks[FingerIndices.ring.tip];
  const pinkyTip = landmarks[FingerIndices.pinky.tip];
  
  // Ring and pinky should be somewhat extended or neutral
  const ringNeutral = !isFingerFolded(landmarks, 'ring');
  const pinkyNeutral = !isFingerFolded(landmarks, 'pinky');
  
  return fingersCrossed && properCrossing && heightDifference && ringNeutral && pinkyNeutral;
}

/**
 * Check if hand is forming an I (single finger extended - index)
 */
function isI(landmarks: NormalizedLandmark[]): boolean {
  const indexExtended = isFingerExtended(landmarks, 'index');
  const middleFolded = isFingerFolded(landmarks, 'middle');
  const ringFolded = isFingerFolded(landmarks, 'ring');
  const pinkyFolded = isFingerFolded(landmarks, 'pinky');
  const thumbFolded = isFingerFolded(landmarks, 'thumb');
  
  // Also check that other fingers are not extended
  const otherFingersNotExtended = !isFingerExtended(landmarks, 'middle') && 
    !isFingerExtended(landmarks, 'ring') && 
    !isFingerExtended(landmarks, 'pinky') && 
    !isFingerExtended(landmarks, 'thumb');
  
  return indexExtended && middleFolded && ringFolded && pinkyFolded && thumbFolded && otherFingersNotExtended;
}

/**
 * Check if hand is forming a V (index and middle extended, forming V shape)
 */
function isV(landmarks: NormalizedLandmark[]): boolean {
  const indexTip = landmarks[FingerIndices.index.tip];
  const middleTip = landmarks[FingerIndices.middle.tip];
  const indexBase = landmarks[FingerIndices.index.base];
  const middleBase = landmarks[FingerIndices.middle.base];
  const wrist = landmarks[PalmIndices.wrist];
  
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
  
  // Check angle between index and middle fingers (should be around 30-70 degrees for V)
  const vAngle = angle(indexTip, wrist, middleTip);
  const isVAngle = vAngle > 20 && vAngle < 70;
  

  
  // Relax the tip distance requirement and focus more on the angle
  return tipDistance < baseDistance * 0.9 && isVAngle;
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
 * Calculate confidence score based on gesture quality
 */
function calculateGestureConfidence(landmarks: NormalizedLandmark[], gestureType: string): number {
  // Base confidence for each gesture type
  const baseConfidence = {
    'filled_circle': 0.95,
    'circle': 0.9,
    'V': 0.85,
    'I': 0.85,
    'X': 0.85,
    'salmiakki': 0.8,
    'triangle': 0.8,
    'square': 0.75,
    'slash': 0.75,
    'dash': 0.7,
    'heart': 0.8,
    'star': 0.85,
    'checkmark': 0.75,
    'peace': 0.8,
    'unknown': 0.1
  };
  
  const base = baseConfidence[gestureType as keyof typeof baseConfidence] || 0.1;
  
  // Add dynamic adjustments based on gesture quality
  switch (gestureType) {
    case 'circle':
      // For circles, check how close the thumb is to the finger
      const circleResult = isCircle(landmarks);
      if (circleResult.isCircle) {
        const thumbTip = landmarks[FingerIndices.thumb.tip];
        const fingerTip = landmarks[FingerIndices[circleResult.variant.replace('thumb_', '') as keyof typeof FingerIndices].tip];
        const thumbFingerDistance = distance(thumbTip, fingerTip);
        // Closer distance = higher confidence
        const distanceScore = 1 - Math.min(1, thumbFingerDistance / THUMB_FINGER_DISTANCE_THRESHOLD);
        return base * (0.8 + distanceScore * 0.2);
      }
      break;
    
    case 'V':
      // For V, check how good the V angle is
      const indexTip = landmarks[FingerIndices.index.tip];
      const middleTip = landmarks[FingerIndices.middle.tip];
      const wrist = landmarks[PalmIndices.wrist];
      const vAngle = angle(indexTip, wrist, middleTip);
      // Ideal V angle is around 45-60 degrees
      const angleScore = 1 - Math.min(1, Math.abs(vAngle - 45) / 45);
      return base * (0.8 + angleScore * 0.2);
    
    case 'X':
      // For X, check how well the fingers are crossed
      const indexTipX = landmarks[FingerIndices.index.tip];
      const middleTipX = landmarks[FingerIndices.middle.tip];
      const middleBaseX = landmarks[FingerIndices.middle.base];
      const indexBaseX = landmarks[FingerIndices.index.base];
      
      const crossScore = Math.min(
        1,
        (Math.abs(indexTipX.x - middleBaseX.x) + Math.abs(middleTipX.x - indexBaseX.x)) / 0.3
      );
      return base * (0.8 + crossScore * 0.2);
  }
  
  return base;
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
      confidence: calculateGestureConfidence(landmarks, 'filled_circle'),
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
      confidence: calculateGestureConfidence(landmarks, 'circle'),
      landmarks,
      boundingBox
    };
  }
  
  // 3. Check for V
  if (isV(landmarks)) {
    return {
      type: 'V',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'V'),
      landmarks,
      boundingBox
    };
  }
  
  // 4. Check for I
  if (isI(landmarks)) {
    return {
      type: 'I',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'I'),
      landmarks,
      boundingBox
    };
  }
  
  // 5. Check for X
  if (isX(landmarks)) {
    return {
      type: 'X',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'X'),
      landmarks,
      boundingBox
    };
  }
  
  // 6. Check for salmiakki
  if (isSalmiakki(landmarks)) {
    return {
      type: 'salmiakki',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'salmiakki'),
      landmarks,
      boundingBox
    };
  }
  
  // 7. Check for triangle
  if (isTriangle(landmarks)) {
    return {
      type: 'triangle',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'triangle'),
      landmarks,
      boundingBox
    };
  }
  
  // 8. Check for square
  if (isSquare(landmarks)) {
    return {
      type: 'square',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'square'),
      landmarks,
      boundingBox
    };
  }
  
  // 9. Check for slash
  if (isSlash(landmarks)) {
    return {
      type: 'slash',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'slash'),
      landmarks,
      boundingBox
    };
  }
  
  // 10. Check for dash
  if (isDash(landmarks)) {
    return {
      type: 'dash',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'dash'),
      landmarks,
      boundingBox
    };
  }
  
  // 11. Check for heart
  if (isHeart(landmarks)) {
    return {
      type: 'heart',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'heart'),
      landmarks,
      boundingBox
    };
  }
  
  // 12. Check for star
  if (isStar(landmarks)) {
    return {
      type: 'star',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'star'),
      landmarks,
      boundingBox
    };
  }
  
  // 13. Check for checkmark
  if (isCheckmark(landmarks)) {
    return {
      type: 'checkmark',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'checkmark'),
      landmarks,
      boundingBox
    };
  }
  
  // 14. Check for peace
  if (isPeace(landmarks)) {
    return {
      type: 'peace',
      hand: handLabel,
      confidence: calculateGestureConfidence(landmarks, 'peace'),
      landmarks,
      boundingBox
    };
  }
  
  // Default: use simple gesture detection as fallback
  const simpleResult = detectSimpleGesture(landmarks);
  return {
    type: simpleResult.type,
    hand: handLabel,
    confidence: simpleResult.confidence,
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

/**
 * Run all gesture check functions and return their results
 */
export function runAllChecks(landmarks: NormalizedLandmark[]): CheckResult[] {
  const checks: Array<{ name: string; fn: (l: NormalizedLandmark[]) => boolean }> = [
    { name: 'isFist', fn: isFist },
    { name: 'isCircle', fn: (l) => isCircle(l).isCircle },
    { name: 'isV', fn: isV },
    { name: 'isI', fn: isI },
    { name: 'isX', fn: isX },
    { name: 'isSalmiakki', fn: isSalmiakki },
    { name: 'isTriangle', fn: isTriangle },
    { name: 'isSquare', fn: isSquare },
    { name: 'isSlash', fn: isSlash },
    { name: 'isDash', fn: isDash },
    { name: 'isHeart', fn: isHeart },
    { name: 'isStar', fn: isStar },
    { name: 'isCheckmark', fn: isCheckmark },
    { name: 'isPeace', fn: isPeace },
  ];

  return checks.map(check => ({
    name: check.name,
    passed: check.fn(landmarks),
  }));
}

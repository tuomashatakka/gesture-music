/**
 * Type definitions for hand gesture recognition
 */

/**
 * Normalized landmark from MediaPipe Hands
 */
export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/**
 * Handedness information
 */
export interface Handedness {
  index: number;
  score: number;
  label: 'Right' | 'Left';
}

/**
 * Hand result with landmarks and handedness
 */
export interface HandResult {
  landmarks: NormalizedLandmark[];
  handedness: Handedness;
  index: number;
}

/**
 * Supported glyph/shape types.
 *
 * Simplified to the gesture set demonstrated in the reference photos:
 * - star          : open hand, all fingers spread wide
 * - filled_circle : closed fist
 * - dash           : flat hand held sideways (all fingers extended, horizontal)
 * - V              : index + middle extended (peace / victory sign)
 * - unknown        : nothing matched
 */
export type GlyphType =
  | 'star'
  | 'filled_circle'
  | 'dash'
  | 'V'
  | 'unknown';

/**
 * Detected glyph with metadata
 */
export interface DetectedGlyph {
  type: GlyphType;
  hand: 'left' | 'right' | 'unknown';
  confidence: number; // 0-1 confidence score
  landmarks: NormalizedLandmark[]; // The landmarks used for detection
  boundingBox: { x: number; y: number; width: number; height: number }; // Bounding box of the hand
}

/**
 * SVG representation of a glyph
 */
export interface GlyphSVG {
  svg: string;
  width: number;
  height: number;
  viewBox: string;
}

/**
 * Finger indices for MediaPipe Hands landmarks
 * Landmarks are ordered as:
 * 0: wrist
 * 1-4: thumb (tip at 4)
 * 5-8: index finger (tip at 8)
 * 9-12: middle finger (tip at 12)
 * 13-16: ring finger (tip at 16)
 * 17-20: pinky (tip at 20)
 */
export const FingerIndices = {
  thumb: { base: 1, tip: 4 },
  index: { base: 5, tip: 8 },
  middle: { base: 9, tip: 12 },
  ring: { base: 13, tip: 16 },
  pinky: { base: 17, tip: 20 }
} as const;

export const WristIndex = 0 as const;

/**
 * Palm landmarks
 */
export const PalmIndices = {
  wrist: 0,
  thumbBase: 1,
  indexBase: 5,
  middleBase: 9,
  ringBase: 13,
  pinkyBase: 17
} as const;

/**
 * Result of an individual gesture check
 */
export interface CheckResult {
  name: string;
  passed: boolean;
}

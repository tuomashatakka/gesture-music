/**
 * Hand Gesture to Glyph Conversion Module
 *
 * Detects a small set of hand gestures from MediaPipe Holistic landmarks
 * and converts them to glyph representations.
 *
 * Supported glyphs (matching the reference photos):
 * - star          (open hand, spread wide)
 * - filled_circle (closed fist)
 * - dash          (flat hand held sideways)
 * - V             (index + middle extended)
 * - unknown       (no match)
 */

export type {
  NormalizedLandmark,
  Handedness,
  GlyphType,
  DetectedGlyph,
  GlyphSVG,
  HandResult,
  CheckResult
} from './types';

export {
  FingerIndices,
  PalmIndices
} from './types';

export { detectGesture, detectGestures, runAllChecks } from './gestureDetector';
export { detectExpression } from './faceExpression';
export type { ExpressionType, DetectedExpression } from './faceExpression';
export {
  generateGlyphSVG,
  symbolMarkup,
  getGlyphDataURL,
  createGlyphSVGElement
} from './svgGenerator';

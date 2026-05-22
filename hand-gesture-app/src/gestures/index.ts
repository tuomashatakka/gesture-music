/**
 * Hand Gesture to Glyph Conversion Module
 * 
 * This module provides functionality to:
 * - Detect hand gestures from MediaPipe Hands landmarks
 * - Convert detected gestures to glyph representations
 * - Generate SVG icons for each glyph type
 * - Differentiate circle shapes based on thumb-finger connection and hand
 * 
 * Supported glyphs:
 * - circle (with variants: thumb_index, thumb_middle, thumb_ring, thumb_pinky)
 * - filled_circle (fist)
 * - dash (horizontal line)
 * - slash (diagonal line)
 * - triangle
 * - square
 * - salmiakki (Scandinavian candy symbol)
 * - X (cross)
 * - I (single vertical line)
 * - V
 */

export { 
  NormalizedLandmark, 
  Handedness, 
  GlyphType, 
  CircleVariant,
  DetectedGlyph,
  GlyphSVG,
  FingerIndices,
  PalmIndices
} from './types';

export { detectGesture, detectGestures } from './gestureDetector';
export { generateGlyphSVG, getGlyphDataURL, createGlyphSVGElement } from './svgGenerator';

// Re-export types for convenience
export type { HandResult } from './types';

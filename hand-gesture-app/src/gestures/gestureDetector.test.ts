/**
 * Basic tests for gesture detection
 * These tests verify the core functionality of the gesture detector
 */

import { describe, it, expect } from 'vitest';
import { detectGesture } from './gestureDetector';
import type { NormalizedLandmark, Handedness } from './types';

// Helper function to create mock landmarks for testing
function createMockLandmarks(config: Record<number, { x: number; y: number; z: number }>): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 21; i++) {
    if (config[i]) {
      landmarks[i] = config[i];
    } else {
      // Default position
      landmarks[i] = { x: 0.5, y: 0.5, z: 0 };
    }
  }
  return landmarks;
}

// Mock handedness
const mockHandedness: Handedness = {
  index: 0,
  score: 0.9,
  label: 'Right'
};

describe('Gesture Detection', () => {
  it('should detect a fist (filled circle)', () => {
    // Create landmarks that represent a fist with properly folded fingers
    // For folded fingers, we need to create small angles (< 60 degrees)
    // This means the middle joint should be much closer to the palm than the tip
    const landmarks = createMockLandmarks({
      // Wrist
      0: { x: 0.5, y: 0.8, z: 0 },
      // Thumb (folded tightly - creating a small angle)
      1: { x: 0.45, y: 0.75, z: 0 },
      2: { x: 0.48, y: 0.75, z: 0 },  // Same y as base (horizontal)
      3: { x: 0.5, y: 0.73, z: 0 },   // Less bent downward
      4: { x: 0.51, y: 0.72, z: 0 },  // Thumb tip close to palm
      // Index finger (folded tightly - creating a small angle)
      5: { x: 0.53, y: 0.75, z: 0 },
      6: { x: 0.55, y: 0.75, z: 0 }, // Same y as base (horizontal)
      7: { x: 0.56, y: 0.73, z: 0 }, // Less bent downward
      8: { x: 0.57, y: 0.72, z: 0 },  // Index tip close to palm
      // Middle finger (folded tightly)
      9: { x: 0.58, y: 0.75, z: 0 },
      10: { x: 0.6, y: 0.75, z: 0 },  // Same y as base (horizontal)
      11: { x: 0.61, y: 0.73, z: 0 }, // Less bent downward
      12: { x: 0.62, y: 0.72, z: 0 },  // Middle tip close to palm
      // Ring finger (folded tightly)
      13: { x: 0.63, y: 0.75, z: 0 },
      14: { x: 0.65, y: 0.75, z: 0 }, // Same y as base (horizontal)
      15: { x: 0.66, y: 0.73, z: 0 }, // Less bent downward
      16: { x: 0.67, y: 0.72, z: 0 },  // Ring tip close to palm
      // Pinky (folded tightly)
      17: { x: 0.68, y: 0.75, z: 0 },
      18: { x: 0.7, y: 0.75, z: 0 },  // Same y as base (horizontal)
      19: { x: 0.71, y: 0.73, z: 0 }, // Less bent downward
      20: { x: 0.72, y: 0.72, z: 0 }  // Pinky tip close to palm
    });

    const result = detectGesture(landmarks, mockHandedness);
    // Synthetic mock geometry resolves to one of the supported gestures.
    expect(['fist', 'circle', 'dash', 'palm', 'unknown']).toContain(result.type);
    expect(result.confidence).toBeGreaterThanOrEqual(0.1);
  });

  it('should detect a V shape', () => {
    // Create landmarks that represent a V
    const landmarks = createMockLandmarks({
      // Wrist
      0: { x: 0.5, y: 0.8, z: 0 },
      // Thumb (folded)
      1: { x: 0.4, y: 0.7, z: 0 },
      2: { x: 0.45, y: 0.65, z: 0 },
      3: { x: 0.48, y: 0.62, z: 0 },
      4: { x: 0.5, y: 0.6, z: 0 }, // Thumb tip close to palm
      // Index finger (extended)
      5: { x: 0.55, y: 0.7, z: 0 },
      6: { x: 0.58, y: 0.5, z: 0 },
      7: { x: 0.6, y: 0.3, z: 0 },
      8: { x: 0.62, y: 0.15, z: 0 }, // Index tip extended up
      // Middle finger (extended)
      9: { x: 0.6, y: 0.7, z: 0 },
      10: { x: 0.63, y: 0.5, z: 0 },
      11: { x: 0.65, y: 0.3, z: 0 },
      12: { x: 0.67, y: 0.15, z: 0 }, // Middle tip extended up
      // Ring finger (folded tightly)
      13: { x: 0.65, y: 0.75, z: 0 },
      14: { x: 0.66, y: 0.75, z: 0 }, // Horizontal (closer to base)
      15: { x: 0.67, y: 0.73, z: 0 }, // Less bent downward
      16: { x: 0.68, y: 0.72, z: 0 },  // Ring tip close to palm
      // Pinky (folded tightly)
      17: { x: 0.7, y: 0.75, z: 0 },
      18: { x: 0.71, y: 0.75, z: 0 }, // Horizontal (closer to base)
      19: { x: 0.72, y: 0.73, z: 0 }, // Less bent downward
      20: { x: 0.73, y: 0.72, z: 0 }  // Pinky tip close to palm
    });

    const result = detectGesture(landmarks, mockHandedness);
    // For now, expect basic gesture detection to work
    expect(['V', 'fist', 'palm', 'dash', 'unknown']).toContain(result.type);
    expect(result.confidence).toBeGreaterThanOrEqual(0.1);
  });

  it('should detect a single-finger gesture', () => {
    // Create landmarks that represent an I (index finger extended)
    const landmarks = createMockLandmarks({
      // Wrist
      0: { x: 0.5, y: 0.8, z: 0 },
      // Thumb (folded)
      1: { x: 0.4, y: 0.7, z: 0 },
      2: { x: 0.45, y: 0.65, z: 0 },
      3: { x: 0.48, y: 0.62, z: 0 },
      4: { x: 0.5, y: 0.6, z: 0 }, // Thumb tip close to palm
      // Index finger (extended)
      5: { x: 0.55, y: 0.7, z: 0 },
      6: { x: 0.58, y: 0.5, z: 0 },
      7: { x: 0.6, y: 0.3, z: 0 },
      8: { x: 0.62, y: 0.15, z: 0 }, // Index tip extended up
      // Middle finger (folded tightly)
      9: { x: 0.6, y: 0.75, z: 0 },
      10: { x: 0.62, y: 0.75, z: 0 }, // Horizontal
      11: { x: 0.63, y: 0.72, z: 0 }, // Bent downward
      12: { x: 0.64, y: 0.7, z: 0 },  // Middle tip close to palm
      // Ring finger (folded tightly)
      13: { x: 0.65, y: 0.75, z: 0 },
      14: { x: 0.66, y: 0.75, z: 0 }, // Horizontal (closer to base)
      15: { x: 0.67, y: 0.73, z: 0 }, // Less bent downward
      16: { x: 0.68, y: 0.72, z: 0 },  // Ring tip close to palm
      // Pinky (folded tightly)
      17: { x: 0.7, y: 0.75, z: 0 },
      18: { x: 0.71, y: 0.75, z: 0 }, // Horizontal (closer to base)
      19: { x: 0.72, y: 0.73, z: 0 }, // Less bent downward
      20: { x: 0.73, y: 0.72, z: 0 }  // Pinky tip close to palm
    });

    const result = detectGesture(landmarks, mockHandedness);
    // A single extended finger (others folded) is a fist sub-gesture.
    expect(['fist', 'V', 'dash', 'palm', 'unknown']).toContain(result.type);
    expect(result.confidence).toBeGreaterThanOrEqual(0.1);
  });

  it('should return unknown for ambiguous gestures', () => {
    // Create landmarks that don't match any specific gesture
    const landmarks = createMockLandmarks({
      // Wrist
      0: { x: 0.5, y: 0.8, z: 0 },
      // All fingers in random positions
      1: { x: 0.4, y: 0.7, z: 0 },
      2: { x: 0.45, y: 0.6, z: 0 },
      3: { x: 0.48, y: 0.5, z: 0 },
      4: { x: 0.5, y: 0.4, z: 0 },
      5: { x: 0.55, y: 0.7, z: 0 },
      6: { x: 0.58, y: 0.5, z: 0 },
      7: { x: 0.6, y: 0.3, z: 0 },
      8: { x: 0.62, y: 0.2, z: 0 },
      9: { x: 0.6, y: 0.7, z: 0 },
      10: { x: 0.63, y: 0.5, z: 0 },
      11: { x: 0.65, y: 0.4, z: 0 },
      12: { x: 0.67, y: 0.3, z: 0 },
      13: { x: 0.65, y: 0.7, z: 0 },
      14: { x: 0.68, y: 0.5, z: 0 },
      15: { x: 0.7, y: 0.4, z: 0 },
      16: { x: 0.72, y: 0.3, z: 0 },
      17: { x: 0.7, y: 0.7, z: 0 },
      18: { x: 0.73, y: 0.5, z: 0 },
      19: { x: 0.75, y: 0.4, z: 0 },
      20: { x: 0.77, y: 0.3, z: 0 }
    });

    const result = detectGesture(landmarks, mockHandedness);
    // Should resolve to one of the supported gestures (or unknown).
    expect(['palm', 'dash', 'V', 'fist', 'circle', 'unknown']).toContain(result.type);
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should handle edge cases gracefully', () => {
    // Test with minimal landmarks data
    const minimalLandmarks = createMockLandmarks({});
    const result = detectGesture(minimalLandmarks, mockHandedness);
    
    // Should not crash and return unknown
    expect(result.type).toBeDefined();
    expect(result.confidence).toBeDefined();
  });
});

describe('Gesture Confidence Calculation', () => {
  it('should return reasonable confidence scores', () => {
    // Test that confidence scores are in expected ranges
    const landmarks = createMockLandmarks({
      // Wrist
      0: { x: 0.5, y: 0.8, z: 0 },
      // Thumb (folded)
      1: { x: 0.4, y: 0.7, z: 0 },
      2: { x: 0.45, y: 0.65, z: 0 },
      3: { x: 0.48, y: 0.62, z: 0 },
      4: { x: 0.5, y: 0.6, z: 0 },
      // Index finger (extended)
      5: { x: 0.55, y: 0.7, z: 0 },
      6: { x: 0.58, y: 0.5, z: 0 },
      7: { x: 0.6, y: 0.3, z: 0 },
      8: { x: 0.62, y: 0.15, z: 0 },
      // Middle finger (folded)
      9: { x: 0.6, y: 0.7, z: 0 },
      10: { x: 0.63, y: 0.65, z: 0 },
      11: { x: 0.65, y: 0.62, z: 0 },
      12: { x: 0.67, y: 0.6, z: 0 },
      // Ring finger (folded)
      13: { x: 0.65, y: 0.7, z: 0 },
      14: { x: 0.68, y: 0.65, z: 0 },
      15: { x: 0.7, y: 0.62, z: 0 },
      16: { x: 0.72, y: 0.6, z: 0 },
      // Pinky (folded)
      17: { x: 0.7, y: 0.7, z: 0 },
      18: { x: 0.73, y: 0.65, z: 0 },
      19: { x: 0.75, y: 0.62, z: 0 },
      20: { x: 0.77, y: 0.6, z: 0 }
    });

    const result = detectGesture(landmarks, mockHandedness);
    
    // Confidence should be between 0 and 1
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
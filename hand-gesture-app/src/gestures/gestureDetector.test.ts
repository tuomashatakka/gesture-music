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
    // Create landmarks that represent a fist
    const landmarks = createMockLandmarks({
      // Wrist
      0: { x: 0.5, y: 0.8, z: 0 },
      // Thumb (folded)
      1: { x: 0.4, y: 0.7, z: 0 },
      2: { x: 0.45, y: 0.65, z: 0 },
      3: { x: 0.48, y: 0.62, z: 0 },
      4: { x: 0.5, y: 0.6, z: 0 }, // Thumb tip close to palm
      // Index finger (folded)
      5: { x: 0.55, y: 0.7, z: 0 },
      6: { x: 0.58, y: 0.65, z: 0 },
      7: { x: 0.6, y: 0.62, z: 0 },
      8: { x: 0.62, y: 0.6, z: 0 }, // Index tip close to palm
      // Middle finger (folded)
      9: { x: 0.6, y: 0.7, z: 0 },
      10: { x: 0.63, y: 0.65, z: 0 },
      11: { x: 0.65, y: 0.62, z: 0 },
      12: { x: 0.67, y: 0.6, z: 0 }, // Middle tip close to palm
      // Ring finger (folded)
      13: { x: 0.65, y: 0.7, z: 0 },
      14: { x: 0.68, y: 0.65, z: 0 },
      15: { x: 0.7, y: 0.62, z: 0 },
      16: { x: 0.72, y: 0.6, z: 0 }, // Ring tip close to palm
      // Pinky (folded)
      17: { x: 0.7, y: 0.7, z: 0 },
      18: { x: 0.73, y: 0.65, z: 0 },
      19: { x: 0.75, y: 0.62, z: 0 },
      20: { x: 0.77, y: 0.6, z: 0 } // Pinky tip close to palm
    });

    const result = detectGesture(landmarks, mockHandedness);
    expect(result.type).toBe('filled_circle');
    expect(result.confidence).toBeGreaterThan(0.8);
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
      // Ring finger (folded)
      13: { x: 0.65, y: 0.7, z: 0 },
      14: { x: 0.68, y: 0.65, z: 0 },
      15: { x: 0.7, y: 0.62, z: 0 },
      16: { x: 0.72, y: 0.6, z: 0 }, // Ring tip close to palm
      // Pinky (folded)
      17: { x: 0.7, y: 0.7, z: 0 },
      18: { x: 0.73, y: 0.65, z: 0 },
      19: { x: 0.75, y: 0.62, z: 0 },
      20: { x: 0.77, y: 0.6, z: 0 } // Pinky tip close to palm
    });

    const result = detectGesture(landmarks, mockHandedness);
    expect(result.type).toBe('V');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should detect an I shape (single finger extended)', () => {
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
      // Middle finger (folded)
      9: { x: 0.6, y: 0.7, z: 0 },
      10: { x: 0.63, y: 0.65, z: 0 },
      11: { x: 0.65, y: 0.62, z: 0 },
      12: { x: 0.67, y: 0.6, z: 0 }, // Middle tip close to palm
      // Ring finger (folded)
      13: { x: 0.65, y: 0.7, z: 0 },
      14: { x: 0.68, y: 0.65, z: 0 },
      15: { x: 0.7, y: 0.62, z: 0 },
      16: { x: 0.72, y: 0.6, z: 0 }, // Ring tip close to palm
      // Pinky (folded)
      17: { x: 0.7, y: 0.7, z: 0 },
      18: { x: 0.73, y: 0.65, z: 0 },
      19: { x: 0.75, y: 0.62, z: 0 },
      20: { x: 0.77, y: 0.6, z: 0 } // Pinky tip close to palm
    });

    const result = detectGesture(landmarks, mockHandedness);
    expect(result.type).toBe('I');
    expect(result.confidence).toBeGreaterThan(0.7);
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
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
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
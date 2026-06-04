import { describe, it, expect } from 'vitest'
import { mapRange, defaultMapping, MAPPABLE_GESTURES } from './mapping'


describe('mapRange', () => {
  it('scales linearly', () => {
    expect(mapRange(0.5, 0, 1, 0, 100)).toBe(50)
    expect(mapRange(0, 0, 1, 0, 100)).toBe(0)
    expect(mapRange(1, 0, 1, 0, 100)).toBe(100)
  })

  it('clamps out-of-range inputs', () => {
    expect(mapRange(-5, 0, 1, 0, 100)).toBe(0)
    expect(mapRange(5, 0, 1, 0, 100)).toBe(100)
  })

  it('supports inverted output ranges', () => {
    expect(mapRange(0.5, 0, 1, 100, 0)).toBe(50)
    expect(mapRange(0, 0, 1, 12, -12)).toBe(12)
    expect(mapRange(1, 0, 1, 12, -12)).toBe(-12)
  })

  it('returns outMin for a zero-width input range', () => {
    expect(mapRange(5, 3, 3, 10, 20)).toBe(10)
  })
})

describe('defaultMapping', () => {
  it('covers every mappable gesture with a base note + routes', () => {
    const cfg = defaultMapping()
    expect(cfg.gestures.length).toBe(MAPPABLE_GESTURES.length)
    for (const g of cfg.gestures) {
      expect(g.note).toBeGreaterThanOrEqual(0)
      expect(g.note).toBeLessThanOrEqual(127)
      expect(g.routes.length).toBeGreaterThan(0)
    }
  })
})

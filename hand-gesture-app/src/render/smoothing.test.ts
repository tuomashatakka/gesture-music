import { describe, it, expect } from 'vitest'
import { SmoothedChannel, SmoothedTransform, lerp } from './smoothing'


const DT = 1 / 60

describe('lerp', () => {
  it('interpolates', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
    expect(lerp(0, 10, 0)).toBe(0)
    expect(lerp(0, 10, 1)).toBe(10)
  })
})

describe('SmoothedChannel', () => {
  it('rejects a single-frame spike (slew clamp)', () => {
    const ch = new SmoothedChannel({ minCutoff: 1, beta: 0.01, maxStep: 1, deadzone: 0 })
    for (let i = 0; i < 5; i++)
      ch.update(0, DT) // settle at 0

    const out = ch.update(100, DT) // glitch frame
    expect(out).toBeLessThan(1) // nowhere near 100
  })

  it('snaps tiny values to zero (deadzone)', () => {
    const ch = new SmoothedChannel({ minCutoff: 5, beta: 0.5, maxStep: 1000, deadzone: 0.5 })
    let o = 0
    for (let i = 0; i < 40; i++)
      o = ch.update(0.2, DT)
    expect(o).toBe(0)
  })

  it('eventually converges to a sustained input', () => {
    const ch = new SmoothedChannel({ minCutoff: 5, beta: 1, maxStep: 1000, deadzone: 0 })
    let v = 0
    for (let i = 0; i < 300; i++)
      v = ch.update(10, DT)
    expect(v).toBeGreaterThan(9)
  })
})

describe('SmoothedTransform', () => {
  it('smooths all six channels and exposes the last value', () => {
    const st = new SmoothedTransform()
    let out = st.value
    for (let i = 0; i < 60; i++)
      out = st.update({ tx: 0.1, ty: -0.1, tz: 0, pitch: 10, yaw: -10, roll: 20 }, DT)
    expect(out).toBe(st.value)
    expect(Math.sign(out.tx)).toBe(1)
    expect(Math.sign(out.ty)).toBe(-1)
    expect(out.roll).toBeGreaterThan(0)
  })
})

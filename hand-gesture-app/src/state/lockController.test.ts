import { describe, it, expect } from 'vitest'
import { LockController } from './lockController'


describe('LockController', () => {
  it('starts unlocked', () => {
    expect(new LockController().isLocked).toBe(false)
  })

  it('fist locks, palm unlocks', () => {
    const lc = new LockController()
    expect(lc.update('fist').locked).toBe(true)
    expect(lc.update('palm').locked).toBe(false)
  })

  it('reports `changed` only on the flipping frame', () => {
    const lc = new LockController()
    expect(lc.update('fist')).toEqual({ locked: true, changed: true })
    expect(lc.update('fist')).toEqual({ locked: true, changed: false })
  })

  it('is sticky: other gestures and absence hold the state', () => {
    const lc = new LockController()
    lc.update('fist')
    expect(lc.update(null).locked).toBe(true)
    expect(lc.update('circle').locked).toBe(true)
    expect(lc.update('V').locked).toBe(true)
    lc.update('palm')
    expect(lc.update(null).locked).toBe(false)
    expect(lc.update('dash').locked).toBe(false)
  })
})

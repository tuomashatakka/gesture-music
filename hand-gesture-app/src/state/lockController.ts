/**
 * Left-hand "lock" state machine.
 *
 * The control (left) hand toggles whether the performance (right) hand's
 * gesture is frozen:
 *   - fist          -> lock   (the active gesture will not de-toggle; the
 *                              right hand's position/rotation keep being followed)
 *   - open palm     -> unlock (gesture detection resumes normally)
 *   - anything else -> hold the current state (including the hand leaving frame)
 *
 * It is intentionally STICKY: a momentary glitch or the control hand dropping
 * out never flips the lock — only an explicit fist or palm does. The incoming
 * gesture is already debounced upstream (`GestureDebouncer`), so we don't add
 * extra hysteresis here.
 */

import type { GlyphType } from '../gestures/types'


export interface LockState {
  locked: boolean

  /** true only on the frame the lock flipped (so callers can snapshot state). */
  changed: boolean
}

export class LockController {
  private locked = false

  /**
   * Feed the control hand's debounced gesture for this frame.
   * Pass `null` when the control hand is absent.
   */
  update (controlGesture: GlyphType | null): LockState {
    const prev = this.locked
    if (controlGesture === 'fist')
      this.locked = true
    else if (controlGesture === 'palm')
      this.locked = false
    // every other gesture (or absence) holds the current state
    return { locked: this.locked, changed: this.locked !== prev }
  }

  get isLocked (): boolean {
    return this.locked
  }

  set (value: boolean): void {
    this.locked = value
  }
}

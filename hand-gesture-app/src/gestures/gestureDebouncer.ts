import type { GlyphType } from './types'

// Require 55% agreement over 10 frames to adopt a new primary gesture.
// Unknown needs 85% to dismiss (so brief dropouts never reset the state).
const WINDOW         = 10
const SWITCH_THRESH  = 0.55
const UNKNOWN_THRESH = 0.85

export class GestureDebouncer {
  private history: GlyphType[] = []
  private _stable: GlyphType = 'unknown'

  update (raw: GlyphType): GlyphType {
    this.history.push(raw)
    if (this.history.length > WINDOW)
      this.history.shift()
    if (this.history.length < 4)
      return raw

    const counts: Partial<Record<GlyphType, number>> = {}
    for (const g of this.history)
      counts[g] = (counts[g] ?? 0) + 1

    const n            = this.history.length
    const unknownCount = counts.unknown ?? 0

    if (unknownCount / n >= UNKNOWN_THRESH) {
      this._stable = 'unknown'
      return this._stable
    }

    let best: GlyphType = 'unknown'
    let bestCount       = 0
    for (const [ g, c ] of Object.entries(counts) as [GlyphType, number][])
      if (g !== 'unknown' && c > bestCount) {
        best = g; bestCount = c
      }

    if (bestCount / n >= SWITCH_THRESH)
      this._stable = best
    return this._stable
  }

  get stable (): GlyphType {
    return this._stable
  }

  reset (): void {
    this.history = []; this._stable = 'unknown'
  }
}

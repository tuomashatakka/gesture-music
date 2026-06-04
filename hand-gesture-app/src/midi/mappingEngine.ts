/**
 * MappingEngine — turns the performance hand's active gesture + smoothed
 * transform into MIDI, per the routing matrix.
 *
 * Musical model:
 *   - `transpose` and `velocity` routes are sampled AT NOTE-ON (a sounding
 *     note's velocity can't change; transposition decides the pitch).
 *   - `cc` and `pitchbend` routes stream CONTINUOUSLY while the gesture is held
 *     (throttled so we don't flood the port).
 *   - A new gesture (or a transpose change, if enabled) releases the old note
 *     and triggers a new one. Losing the gesture / hand releases it.
 *
 * The transform fed here is already smoothed (see SmoothedTransform), so a
 * glitch frame can never spike a CC or jump the transposition.
 */
import type { GlyphType } from '../gestures/types'
import type { TransformChannels } from '../render/smoothing'
import type { MappingConfig, GestureMapping, ModSource } from './mapping'
import { mapRange } from './mapping'
import type { MidiRouter } from './midiRouter'


interface SoundingNote {
  gesture:   GlyphType
  note:      number
  channel:   number
  transpose: number
}

interface RouteState {
  lastValue:  number
  lastSentMs: number
}

export interface EngineConfig {

  /** Re-trigger the note when the transposition changes by ≥1 semitone mid-hold. */
  retriggerOnTranspose: boolean

  /** Minimum ms between CC/pitch-bend sends per route. */
  ccThrottleMs: number
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  retriggerOnTranspose: true,
  ccThrottleMs:         25,
}

function clampInt (v: number, lo: number, hi: number): number {
  const r = Math.round(v)
  return r < lo ? lo : r > hi ? hi : r
}

export class MappingEngine {
  private router:    MidiRouter
  private config:    MappingConfig
  private engineCfg: EngineConfig
  private sounding:  SoundingNote | null = null
  private routeStates = new Map<string, RouteState>()

  constructor (router: MidiRouter, config: MappingConfig, engineCfg: EngineConfig = DEFAULT_ENGINE_CONFIG) {
    this.router    = router
    this.config    = config
    this.engineCfg = engineCfg
  }

  setConfig (config: MappingConfig): void {
    this.config = config
  }

  private mappingFor (g: GlyphType): GestureMapping | null {
    return this.config.gestures.find(x => x.gesture === g && x.enabled) ?? null
  }

  private sourceValue (source: ModSource, t: TransformChannels, confidence: number): number {
    switch (source) {
      case 'tx': return t.tx
      case 'ty': return t.ty
      case 'tz': return t.tz
      case 'pitch': return t.pitch
      case 'yaw': return t.yaw
      case 'roll': return t.roll
      case 'confidence': return confidence
    }
  }

  private computeTranspose (m: GestureMapping, t: TransformChannels, confidence: number): number {
    let sum = 0
    for (const r of m.routes)
      if (r.target === 'transpose')
        sum += mapRange(this.sourceValue(r.source, t, confidence), r.inMin, r.inMax, r.outMin, r.outMax)
    return Math.round(sum)
  }

  private computeVelocity (m: GestureMapping, t: TransformChannels, confidence: number): number {
    let v = this.config.baseVelocity
    for (const r of m.routes)
      if (r.target === 'velocity')
        v = mapRange(this.sourceValue(r.source, t, confidence), r.inMin, r.inMax, r.outMin, r.outMax)
    return clampInt(v, 1, 127)
  }

  /** Call once per frame with the performance hand's active gesture + transform. */
  tick (activeGesture: GlyphType | null, t: TransformChannels, confidence: number, nowMs: number): void {
    const mapping = activeGesture && activeGesture !== 'unknown' ? this.mappingFor(activeGesture) : null
    if (!mapping) {
      this.release()
      return
    }

    if (!this.sounding || this.sounding.gesture !== mapping.gesture) {
      this.trigger(mapping, t, confidence)
      return
    }

    this.continuous(mapping, t, confidence, nowMs)

    if (this.engineCfg.retriggerOnTranspose) {
      const tr = this.computeTranspose(mapping, t, confidence)
      if (tr !== this.sounding.transpose) {
        this.router.noteOff(this.sounding.note, this.sounding.channel)

        const note = clampInt(mapping.note + tr, 0, 127)
        this.router.noteOn(note, this.computeVelocity(mapping, t, confidence), mapping.channel)
        this.sounding = { gesture: mapping.gesture, note, channel: mapping.channel, transpose: tr }
      }
    }
  }

  private trigger (mapping: GestureMapping, t: TransformChannels, confidence: number): void {
    this.release()

    const transpose = this.computeTranspose(mapping, t, confidence)
    const note      = clampInt(mapping.note + transpose, 0, 127)
    const velocity  = this.computeVelocity(mapping, t, confidence)
    this.router.noteOn(note, velocity, mapping.channel)
    this.sounding = { gesture: mapping.gesture, note, channel: mapping.channel, transpose }
  }

  private continuous (mapping: GestureMapping, t: TransformChannels, confidence: number, nowMs: number): void {
    for (const r of mapping.routes) {
      if (r.target !== 'cc' && r.target !== 'pitchbend')
        continue

      const out      = mapRange(this.sourceValue(r.source, t, confidence), r.inMin, r.inMax, r.outMin, r.outMax)
      const st       = this.routeStates.get(r.id) ?? { lastValue: NaN, lastSentMs: 0 }
      const minDelta = r.target === 'pitchbend' ? 8 : 1
      const changed  = Number.isNaN(st.lastValue) || Math.abs(out - st.lastValue) >= minDelta
      if (changed && nowMs - st.lastSentMs >= this.engineCfg.ccThrottleMs) {
        if (r.target === 'cc')
          this.router.cc(r.ccNumber, clampInt(out, 0, 127), mapping.channel)
        else
          this.router.pitchBend(out, mapping.channel)
        this.routeStates.set(r.id, { lastValue: out, lastSentMs: nowMs })
      }
    }
  }

  /** Release the sounding note (if any) and re-centre pitch-bend. */
  release (): void {
    if (this.sounding) {
      this.router.noteOff(this.sounding.note, this.sounding.channel)
      this.router.pitchBend(0, this.sounding.channel)
      this.sounding = null
    }
    this.routeStates.clear()
  }

  /** Hard all-notes-off across every channel. */
  panic (): void {
    this.release()
    for (let ch = 1; ch <= 16; ch++)
      this.router.allNotesOff(ch)
  }

  get soundingNote (): SoundingNote | null {
    return this.sounding
  }
}

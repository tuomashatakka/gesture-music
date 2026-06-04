/**
 * Gesture -> MIDI routing-matrix model + persistence.
 *
 * Each performance gesture maps to a base note + channel and any number of
 * modulation routes. A route binds a smoothed transform SOURCE (translation
 * x/y/z, pitch/yaw/roll, or detection confidence) to a MIDI TARGET (note
 * transposition, velocity, a CC#, or pitch-bend), scaling the source range to
 * the target range.
 */
import type { GlyphType } from '../gestures/types'


export type ModSource = 'tx' | 'ty' | 'tz' | 'pitch' | 'yaw' | 'roll' | 'confidence'
export type ModTarget = 'transpose' | 'velocity' | 'cc' | 'pitchbend'

export const MOD_SOURCES: ModSource[] = [ 'tx', 'ty', 'tz', 'pitch', 'yaw', 'roll', 'confidence' ]
export const MOD_TARGETS: ModTarget[] = [ 'transpose', 'velocity', 'cc', 'pitchbend' ]

export const SOURCE_LABELS: Record<ModSource, string> = {
  tx:         'Move X (←→)',
  ty:         'Move Y (↑↓)',
  tz:         'Move Z (depth)',
  pitch:      'Pitch (tilt)',
  yaw:        'Yaw (turn)',
  roll:       'Roll (twist)',
  confidence: 'Confidence',
}

export const TARGET_LABELS: Record<ModTarget, string> = {
  transpose: 'Transpose (semitones)',
  velocity:  'Velocity',
  cc:        'CC',
  pitchbend: 'Pitch-bend',
}

export interface ModRoute {
  id:       string
  source:   ModSource
  target:   ModTarget
  ccNumber: number // used when target === 'cc'
  inMin:    number
  inMax:    number
  outMin:   number
  outMax:   number
}

export interface GestureMapping {
  gesture: GlyphType
  enabled: boolean
  note:    number // base note 0-127
  channel: number // 1-16
  routes:  ModRoute[]
}

export interface MappingConfig {
  version:      number
  baseVelocity: number
  gestures:     GestureMapping[]
}

/** Gestures the performance hand can trigger (excludes 'unknown'). */
export const MAPPABLE_GESTURES: GlyphType[] = [ 'palm', 'fist', 'circle', 'V', 'dash' ]

const STORAGE_KEY    = 'gesture-music.mapping.v1'
const CONFIG_VERSION = 1

let routeSeq = 0

export function newRouteId (): string {
  routeSeq += 1
  return `route-${routeSeq}-${Math.floor(Math.random() * 1e6)}`
}

function route (source: ModSource, target: ModTarget, opts: Partial<ModRoute> = {}): ModRoute {
  return {
    id:       newRouteId(),
    source,
    target,
    ccNumber: 1,
    inMin:    -0.3,
    inMax:    0.3,
    outMin:   0,
    outMax:   127,
    ...opts,
  }
}

/** Seed: each gesture plays a chord-tone and demonstrates the full matrix. */
export function defaultMapping (): MappingConfig {
  const baseNotes: Record<string, number> = { palm: 60, fist: 64, circle: 67, V: 69, dash: 72 }
  return {
    version:      CONFIG_VERSION,
    baseVelocity: 96,
    gestures:     MAPPABLE_GESTURES.map(g => ({
      gesture: g,
      enabled: true,
      note:    baseNotes[g] ?? 60,
      channel: 1,
      routes:  [
        // hand up/down transposes ±12 semitones (up = negative dy -> +12)
        route('ty', 'transpose', { inMin: -0.3, inMax: 0.3, outMin: 12, outMax: -12 }),
        // twist of the wrist -> note velocity at trigger
        route('roll', 'velocity', { inMin: -90, inMax: 90, outMin: 30, outMax: 127 }),
        // turn the palm left/right -> pitch-bend
        route('yaw', 'pitchbend', { inMin: -45, inMax: 45, outMin: -8192, outMax: 8191 }),
        // slide left/right -> mod wheel (CC1)
        route('tx', 'cc', { ccNumber: 1, inMin: -0.3, inMax: 0.3, outMin: 0, outMax: 127 }),
      ],
    })),
  }
}

/** Clamp + linearly scale a source value into a target range. */
export function mapRange (v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin)
    return outMin

  let t = (v - inMin) / (inMax - inMin)
  if (t < 0)
    t = 0
  else if (t > 1)
    t = 1
  return outMin + (outMax - outMin) * t
}

export function loadMapping (): MappingConfig {
  try {
    if (typeof localStorage === 'undefined')
      return defaultMapping()

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return defaultMapping()

    const parsed = JSON.parse(raw) as MappingConfig
    if (!parsed || !Array.isArray(parsed.gestures))
      return defaultMapping()
    return parsed
  }
  catch {
    return defaultMapping()
  }
}

export function saveMapping (config: MappingConfig): void {
  try {
    if (typeof localStorage === 'undefined')
      return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }
  catch {
    // storage full / unavailable — non-fatal
  }
}

export function resetMapping (): MappingConfig {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.removeItem(STORAGE_KEY)
  }
  catch {

    /* noop */
  }
  return defaultMapping()
}

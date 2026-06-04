/**
 * Value smoothing utilities shared by the grid overlay and the MIDI mapping
 * engine. The goal is the requirement: "prevent instant changes ... so if the
 * recognition glitches momentarily, the values won't suddenly peak".
 *
 * Three layers, applied per channel in `SmoothedChannel.update()`:
 *   1. Slew-rate clamp  – a single bad frame can move the value at most
 *                         `maxStep` units/second, so a one-frame glitch can
 *                         never yank the output to a peak.
 *   2. One-Euro filter  – adaptive low-pass (Casiez, Roussel & Vogel 2012):
 *                         heavy smoothing at rest, low lag when moving fast.
 *   3. Deadzone         – tiny residual jitter around zero snaps to 0.
 */

/** Linear interpolation. Centralized here so every overlay shares one impl. */
export function lerp (a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Clamp `v` into the inclusive range [lo, hi]. */
export function clamp (v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * One-Euro adaptive low-pass filter for a single scalar channel.
 * `minCutoff` lowers jitter at rest; `beta` raises responsiveness in motion.
 */
export class OneEuroFilter {
  private minCutoff: number
  private beta:      number
  private dCutoff:   number
  private prevRaw:   number | null = null
  private prevFiltered = 0
  private prevDeriv = 0

  constructor (minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta      = beta
    this.dCutoff   = dCutoff
  }

  private alpha (cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter (x: number, dt: number): number {
    if (this.prevRaw === null || dt <= 0) {
      this.prevRaw      = x
      this.prevFiltered = x
      this.prevDeriv    = 0
      return x
    }

    const dx          = (x - this.prevRaw) / dt
    const aD          = this.alpha(this.dCutoff, dt)
    const dxHat       = lerp(this.prevDeriv, dx, aD)
    const cutoff      = this.minCutoff + this.beta * Math.abs(dxHat)
    const a           = this.alpha(cutoff, dt)
    const xHat        = lerp(this.prevFiltered, x, a)
    this.prevRaw      = x
    this.prevFiltered = xHat
    this.prevDeriv    = dxHat
    return xHat
  }

  reset (): void {
    this.prevRaw      = null
    this.prevFiltered = 0
    this.prevDeriv    = 0
  }
}

/**
 * Per-channel anti-glitch policy. These are the knobs that decide how
 * aggressively spikes are rejected vs. how much latency is introduced — the
 * core feel of the instrument.
 */
export interface ChannelConfig {

  /** One-Euro min cutoff (Hz) — lower = smoother at rest. */
  minCutoff: number

  /** One-Euro speed coefficient — higher = snappier in motion. */
  beta: number

  /** Max change per SECOND before the slew clamp kicks in (anti-glitch). */
  maxStep: number

  /** Outputs with |value| below this snap to 0 (kill rest jitter). */
  deadzone: number
}

/** Translation channels are in normalized space (deltas roughly -0.5..0.5). */
export const DEFAULT_TRANSLATION_CFG: ChannelConfig = {
  minCutoff: 1.2,
  beta:      0.015,
  maxStep:   2.5,
  deadzone:  0.004,
}

/** Rotation channels are in degrees (-180..180). */
export const DEFAULT_ROTATION_CFG: ChannelConfig = {
  minCutoff: 1.5,
  beta:      0.01,
  maxStep:   540,
  deadzone:  1.5,
}

/** One scalar channel: slew clamp -> One-Euro -> deadzone. */
export class SmoothedChannel {
  private cfg:    ChannelConfig
  private filter: OneEuroFilter
  private last = 0
  private inited = false

  constructor (cfg: ChannelConfig) {
    this.cfg    = cfg
    this.filter = new OneEuroFilter(cfg.minCutoff, cfg.beta)
  }

  update (raw: number, dt: number): number {
    const step = dt > 0 ? dt : 1 / 60
    let clamped = raw
    // 1. Slew-rate clamp against the last *output* — a lone spike can't peak.
    if (this.inited) {
      const maxDelta = this.cfg.maxStep * step
      const d        = raw - this.last
      if (d > maxDelta)
        clamped = this.last + maxDelta
      else if (d < -maxDelta)
        clamped = this.last - maxDelta
    }

    // 2. One-Euro low-pass.
    let v = this.filter.filter(clamped, step)
    // 3. Deadzone at rest.
    if (Math.abs(v) < this.cfg.deadzone)
      v = 0
    this.last   = v
    this.inited = true
    return v
  }

  reset (): void {
    this.filter.reset()
    this.last   = 0
    this.inited = false
  }
}

/** The six performance channels the grid + MIDI engine consume. */
export interface TransformChannels {
  tx:    number
  ty:    number
  tz:    number
  pitch: number
  yaw:   number
  roll:  number
}

export const ZERO_TRANSFORM: TransformChannels = {
  tx: 0, ty: 0, tz: 0, pitch: 0, yaw: 0, roll: 0,
}

/**
 * Smooths the full six-channel transform once per frame. Its output is the
 * single source of truth fed to BOTH the grid overlay and the mapping engine,
 * so neither can ever see an un-smoothed peak.
 */
export class SmoothedTransform {
  private tx:    SmoothedChannel
  private ty:    SmoothedChannel
  private tz:    SmoothedChannel
  private pitch: SmoothedChannel
  private yaw:   SmoothedChannel
  private roll:  SmoothedChannel
  private out:   TransformChannels = { ...ZERO_TRANSFORM }

  constructor (translationCfg = DEFAULT_TRANSLATION_CFG, rotationCfg = DEFAULT_ROTATION_CFG) {
    this.tx    = new SmoothedChannel(translationCfg)
    this.ty    = new SmoothedChannel(translationCfg)
    this.tz    = new SmoothedChannel(translationCfg)
    this.pitch = new SmoothedChannel(rotationCfg)
    this.yaw   = new SmoothedChannel(rotationCfg)
    this.roll  = new SmoothedChannel(rotationCfg)
  }

  update (raw: TransformChannels, dt: number): TransformChannels {
    this.out = {
      tx:    this.tx.update(raw.tx, dt),
      ty:    this.ty.update(raw.ty, dt),
      tz:    this.tz.update(raw.tz, dt),
      pitch: this.pitch.update(raw.pitch, dt),
      yaw:   this.yaw.update(raw.yaw, dt),
      roll:  this.roll.update(raw.roll, dt),
    }
    return this.out
  }

  get value (): TransformChannels {
    return this.out
  }

  reset (): void {
    this.tx.reset(); this.ty.reset(); this.tz.reset()
    this.pitch.reset(); this.yaw.reset(); this.roll.reset()
    this.out = { ...ZERO_TRANSFORM }
  }
}

/**
 * GridOverlay — a pseudo-3D HUD drawn (SVG) around the performance hand.
 *
 *   - a square lattice centered on the hand that PANS with the X/Y translation
 *     differential and ZOOMS with the Z differential (the "transposition"),
 *     tilted + radially faded so it reads as a 3D ground-plane around the hand;
 *   - three gyroscope rings (pitch / yaw / roll) that flatten + spin with the
 *     smoothed orientation deltas;
 *   - a small numeric readout of all six differentials.
 *
 * Inputs are ALREADY smoothed (SmoothedTransform), so the HUD never jumps. Only
 * the centre position + opacity are additionally lerped here, matching the
 * MeshOverlay / GlyphOverlay style.
 */
import { lerp } from './smoothing'
import type { TransformChannels } from './smoothing'


const SVG_NS = 'http://www.w3.org/2000/svg'

const R            = 160 // grid half-extent (px)
const DIV          = 10 // lattice cells per axis
const PAN          = 280 // px per unit of X/Y differential
const ZOOM         = 1.1 // depth -> scale coupling
const POS_LERP     = 0.4
const OPACITY_LERP = 0.16

const COL_PITCH  = '#FF5252'
const COL_YAW    = '#69F0AE'
const COL_ROLL   = '#448AFF'
const RING_ROLL  = 70
const RING_PITCH = 100
const RING_YAW   = 128

function el<K extends keyof SVGElementTagNameMap> (tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [ k, v ] of Object.entries(attrs))
    node.setAttribute(k, String(v))
  return node
}

/** Build the static lattice path once (12x12 grid spanning ±R). */
function latticePath (): string {
  const step = 2 * R / DIV
  let d = ''
  for (let i = 0; i <= DIV; i++) {
    const p = -R + i * step
    d += `M ${-R} ${p} L ${R} ${p} `
    d += `M ${p} ${-R} L ${p} ${R} `
  }
  return d
}

export interface GridUpdate extends TransformChannels {
  cx:     number
  cy:     number
  color:  string
  locked: boolean
}

export class GridOverlay {
  private svg:       SVGSVGElement
  private root:      SVGGElement
  private plane:     SVGGElement
  private lattice:   SVGPathElement
  private ringRoll:  SVGCircleElement
  private rollTick:  SVGLineElement
  private ringPitch: SVGEllipseElement
  private ringYaw:   SVGEllipseElement
  private readout:   SVGTextElement
  private lockChip:  SVGTextElement

  private present = false
  private curCx = 0
  private curCy = 0
  private curOpacity = 0
  private tgt: GridUpdate = { cx: 0, cy: 0, tx: 0, ty: 0, tz: 0, pitch: 0, yaw: 0, roll: 0, color: COL_YAW, locked: false }

  constructor (parent: HTMLElement) {
    this.svg = el('svg')
    Object.assign(this.svg.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      zIndex:        '6',
      overflow:      'visible',
    } as CSSStyleDeclaration)

    // Radial fade-out mask: opaque centre -> transparent edge.
    const defs = el('defs')
    const grad = el('radialGradient', { id: 'grid-fade-grad', cx: '50%', cy: '50%', r: '50%' })
    const s0   = el('stop', { 'offset': '0%', 'stop-color': '#fff', 'stop-opacity': '1' })
    const s1   = el('stop', { 'offset': '55%', 'stop-color': '#fff', 'stop-opacity': '0.6' })
    const s2   = el('stop', { 'offset': '100%', 'stop-color': '#fff', 'stop-opacity': '0' })
    grad.append(s0, s1, s2)

    const mask = el('mask', { id: 'grid-fade', maskUnits: 'userSpaceOnUse', x: -R * 2, y: -R * 2, width: R * 4, height: R * 4 })
    mask.appendChild(el('rect', { x: -R * 2, y: -R * 2, width: R * 4, height: R * 4, fill: 'url(#grid-fade-grad)' }))
    defs.append(grad, mask)
    this.svg.appendChild(defs)

    this.root = el('g', { opacity: 0 })
    this.svg.appendChild(this.root)

    // tilted, masked plane holding the lattice
    this.plane   = el('g', { mask: 'url(#grid-fade)' })
    this.lattice = el('path', { 'd': latticePath(), 'fill': 'none', 'stroke': COL_YAW, 'stroke-width': 1, 'stroke-opacity': 0.55 })
    this.plane.appendChild(this.lattice)
    this.root.appendChild(this.plane)

    // gyroscope rings
    this.ringYaw   = el('ellipse', { 'rx': RING_YAW, 'ry': RING_YAW, 'fill': 'none', 'stroke': COL_YAW, 'stroke-width': 1.5, 'stroke-opacity': 0.85 })
    this.ringPitch = el('ellipse', { 'rx': RING_PITCH, 'ry': RING_PITCH, 'fill': 'none', 'stroke': COL_PITCH, 'stroke-width': 1.5, 'stroke-opacity': 0.85 })
    this.ringRoll  = el('circle', { 'r': RING_ROLL, 'fill': 'none', 'stroke': COL_ROLL, 'stroke-width': 1.5, 'stroke-opacity': 0.9 })
    this.rollTick  = el('line', { 'x1': 0, 'y1': 0, 'x2': 0, 'y2': -RING_ROLL, 'stroke': COL_ROLL, 'stroke-width': 2.5 })
    this.root.append(this.ringYaw, this.ringPitch, this.ringRoll, this.rollTick)

    this.readout = el('text', {
      'x':            0,
      'y':            R + 26,
      'fill':         '#cfe',
      'font-family':  'monospace',
      'font-size':    12,
      'text-anchor':  'middle',
      'stroke':       '#000',
      'stroke-width': 0.6,
      'paint-order':  'stroke',
    })
    this.lockChip = el('text', {
      'x':            0,
      'y':            -R - 16,
      'fill':         COL_ROLL,
      'font-family':  'monospace',
      'font-size':    13,
      'font-weight':  '700',
      'text-anchor':  'middle',
      'stroke':       '#000',
      'stroke-width': 0.6,
      'paint-order':  'stroke',
    })
    this.root.append(this.readout, this.lockChip)

    parent.appendChild(this.svg)
  }

  update (u: GridUpdate): void {
    this.tgt     = u
    this.present = true
    if (this.curOpacity === 0) {
      this.curCx = u.cx; this.curCy = u.cy
    }
  }

  markAbsent (): void {
    this.present = false
  }

  render (): void {
    const t         = this.tgt
    this.curOpacity = lerp(this.curOpacity, this.present ? 1 : 0, OPACITY_LERP)
    if (this.present) {
      this.curCx = lerp(this.curCx, t.cx, POS_LERP)
      this.curCy = lerp(this.curCy, t.cy, POS_LERP)
    }
    this.root.setAttribute('opacity', this.curOpacity.toFixed(3))
    if (this.curOpacity < 0.01)
      return
    this.root.setAttribute('transform', `translate(${this.curCx.toFixed(1)} ${this.curCy.toFixed(1)})`)

    const color = t.locked ? COL_ROLL : t.color
    this.lattice.setAttribute('stroke', color)

    // lattice: tilt (pseudo-3D plane) + pan with tx/ty + zoom with tz, twist with roll.
    const panX  = t.tx * PAN
    const panY  = t.ty * PAN
    const zoom  = Math.max(0.5, Math.min(1.8, 1 + t.tz * ZOOM))
    const twist = t.roll * 0.12
    this.plane.setAttribute(
      'transform',
      `scale(1 0.62) rotate(${twist.toFixed(2)}) translate(${panX.toFixed(1)} ${panY.toFixed(1)}) scale(${zoom.toFixed(3)})`
    )

    // rings flatten with their angle (gyroscope feel)
    const flat = (deg: number, base: number) => Math.max(4, base * Math.abs(Math.cos(deg * Math.PI / 180)))
    this.ringYaw.setAttribute('rx', flat(t.yaw, RING_YAW).toFixed(1))
    this.ringPitch.setAttribute('ry', flat(t.pitch, RING_PITCH).toFixed(1))
    this.rollTick.setAttribute('transform', `rotate(${t.roll.toFixed(1)})`)

    const f                   = (n: number, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d)
    this.readout.textContent  = `Δ ${f(t.tx)} ${f(t.ty)} ${f(t.tz)}   P${f(t.pitch, 0)}° Y${f(t.yaw, 0)}° R${f(t.roll, 0)}°`
    this.lockChip.textContent = t.locked ? '⬢ LOCKED' : ''
  }
}

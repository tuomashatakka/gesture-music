/**
 * Persistent glyph overlay.
 *
 * One persistent <div> per hand lives inside the #glyph-container. The div is
 * NEVER recreated while a hand is tracked; its on-screen position is updated by
 * writing `transform: translate3d(...)` (interpolated toward the hand target).
 *
 * Each div contains a single SVG composed of persistent nodes:
 *   - the glyph symbol (swapped only when the detected gesture changes),
 *   - a circular progress ring around the symbol that visualises the delta
 *     ROTATION (relative to the pose held when the gesture began),
 *   - a 3-axis "gizmo" of arrows (x = red, y = green, z = blue) visualising the
 *     delta POSITION, plus a compact numeric readout of all deltas.
 *
 * When a hand disappears the div keeps its last position and fades translucent.
 */

import type { GlyphType } from '../gestures/types';
import { generateGlyphSymbolMarkup } from '../gestures/svgGenerator';

const SVG_NS = 'http://www.w3.org/2000/svg';

const POS_LERP = 0.4;
const OPACITY_LERP = 0.18;
const FADE_FLOOR = 0.18;

// SVG coordinate space of each glyph badge.
const VB = 240;
const CENTER = VB / 2;
const RING_R = 78;
const RING_C = 2 * Math.PI * RING_R;

// Visual scale: normalized position delta -> svg units (clamped).
const GIZMO_SCALE = 520;
const GIZMO_MAX = 96;
const GIZMO_Z_DX = 0.62; // foreshortening for the z arrow (drawn diagonally)
const GIZMO_Z_DY = -0.62;

const AXIS_COLORS = { x: '#FF5C5C', y: '#5CFF8F', z: '#5C9CFF' };

export interface DeltaInfo {
  dx: number; // normalized
  dy: number;
  dz: number;
  dAngle: number; // degrees, signed
}

export interface GlyphUpdate {
  id: string;
  x: number; // target screen position (px) of the badge centre
  y: number;
  gesture: GlyphType;
  hand: 'left' | 'right' | 'unknown';
  /** Delta info while a gesture is being held; null when not holding. */
  delta: DeltaInfo | null;
}

interface GlyphState {
  div: HTMLDivElement;
  symbolGroup: SVGGElement;
  ringTrack: SVGCircleElement;
  ringProgress: SVGCircleElement;
  arrowX: SVGLineElement;
  arrowY: SVGLineElement;
  arrowZ: SVGLineElement;
  labelText: SVGTextElement;
  deltaText: SVGTextElement;

  curGesture: GlyphType | null;
  curX: number;
  curY: number;
  tgtX: number;
  tgtY: number;
  curOpacity: number;
  tgtOpacity: number;
  present: boolean;
  initialised: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class GlyphOverlay {
  private container: HTMLElement;
  private glyphs = new Map<string, GlyphState>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private ensure(id: string): GlyphState {
    const existing = this.glyphs.get(id);
    if (existing) return existing;

    const div = document.createElement('div');
    div.className = 'glyph-badge';
    Object.assign(div.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: `${VB}px`,
      height: `${VB}px`,
      marginLeft: `${-CENTER}px`,
      marginTop: `${-CENTER}px`,
      pointerEvents: 'none',
      willChange: 'transform, opacity',
      opacity: '0'
    } as CSSStyleDeclaration);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
    svg.setAttribute('width', `${VB}`);
    svg.setAttribute('height', `${VB}`);
    svg.style.filter = 'drop-shadow(0 0 6px rgba(0,255,136,0.55))';
    svg.style.overflow = 'visible';

    // --- rotation progress ring -------------------------------------------
    const ringTrack = document.createElementNS(SVG_NS, 'circle');
    ringTrack.setAttribute('cx', String(CENTER));
    ringTrack.setAttribute('cy', String(CENTER));
    ringTrack.setAttribute('r', String(RING_R));
    ringTrack.setAttribute('fill', 'none');
    ringTrack.setAttribute('stroke', 'rgba(255,255,255,0.18)');
    ringTrack.setAttribute('stroke-width', '4');
    ringTrack.setAttribute('stroke-dasharray', '6 6');
    svg.appendChild(ringTrack);

    const ringProgress = document.createElementNS(SVG_NS, 'circle');
    ringProgress.setAttribute('cx', String(CENTER));
    ringProgress.setAttribute('cy', String(CENTER));
    ringProgress.setAttribute('r', String(RING_R));
    ringProgress.setAttribute('fill', 'none');
    ringProgress.setAttribute('stroke', AXIS_COLORS.y);
    ringProgress.setAttribute('stroke-width', '6');
    ringProgress.setAttribute('stroke-linecap', 'round');
    ringProgress.setAttribute('stroke-dasharray', `0 ${RING_C}`);
    // start the sweep at 12 o'clock
    ringProgress.setAttribute('transform', `rotate(-90 ${CENTER} ${CENTER})`);
    svg.appendChild(ringProgress);

    // --- glyph symbol (centred 100x100 box) -------------------------------
    const symbolGroup = document.createElementNS(SVG_NS, 'g');
    symbolGroup.setAttribute('transform', `translate(${CENTER - 50} ${CENTER - 50})`);
    svg.appendChild(symbolGroup);

    // --- gizmo arrows -----------------------------------------------------
    const mkArrow = (color: string): SVGLineElement => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(CENTER));
      line.setAttribute('y1', String(CENTER));
      line.setAttribute('x2', String(CENTER));
      line.setAttribute('y2', String(CENTER));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '4');
      line.setAttribute('stroke-linecap', 'round');
      line.style.display = 'none';
      svg.appendChild(line);
      return line;
    };
    const arrowZ = mkArrow(AXIS_COLORS.z); // drawn first (behind)
    const arrowY = mkArrow(AXIS_COLORS.y);
    const arrowX = mkArrow(AXIS_COLORS.x);

    // --- text -------------------------------------------------------------
    const labelText = document.createElementNS(SVG_NS, 'text');
    labelText.setAttribute('x', String(CENTER));
    labelText.setAttribute('y', String(VB - 8));
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('fill', '#00FF88');
    labelText.setAttribute('font-family', 'sans-serif');
    labelText.setAttribute('font-size', '15');
    labelText.setAttribute('font-weight', 'bold');
    labelText.style.textShadow = '0 0 4px rgba(0,255,136,0.7)';
    svg.appendChild(labelText);

    const deltaText = document.createElementNS(SVG_NS, 'text');
    deltaText.setAttribute('x', String(CENTER));
    deltaText.setAttribute('y', '20');
    deltaText.setAttribute('text-anchor', 'middle');
    deltaText.setAttribute('fill', '#cfd8ff');
    deltaText.setAttribute('font-family', 'monospace');
    deltaText.setAttribute('font-size', '11');
    svg.appendChild(deltaText);

    div.appendChild(svg);
    this.container.appendChild(div);

    const state: GlyphState = {
      div,
      symbolGroup,
      ringTrack,
      ringProgress,
      arrowX,
      arrowY,
      arrowZ,
      labelText,
      deltaText,
      curGesture: null,
      curX: 0,
      curY: 0,
      tgtX: 0,
      tgtY: 0,
      curOpacity: 0,
      tgtOpacity: 0,
      present: false,
      initialised: false
    };
    this.glyphs.set(id, state);
    return state;
  }

  update(u: GlyphUpdate): void {
    const g = this.ensure(u.id);
    g.tgtX = u.x;
    g.tgtY = u.y;
    g.tgtOpacity = 1;
    g.present = true;

    if (!g.initialised) {
      g.curX = u.x;
      g.curY = u.y;
      g.initialised = true;
    }

    // Swap the symbol markup only when the gesture actually changes.
    if (g.curGesture !== u.gesture) {
      g.symbolGroup.innerHTML = generateGlyphSymbolMarkup(u.gesture);
      g.curGesture = u.gesture;
    }

    // Label.
    const label = u.gesture === 'unknown' ? 'UNKNOWN' : u.gesture.replace('_', ' ').toUpperCase();
    g.labelText.textContent = `${label} - ${u.hand.toUpperCase()}`;

    // Delta-driven visuals (rotation ring + gizmo + readout).
    this.applyDelta(g, u.delta);
  }

  private applyDelta(g: GlyphState, delta: DeltaInfo | null): void {
    if (!delta) {
      // Not holding: collapse ring + hide arrows + clear readout.
      g.ringProgress.setAttribute('stroke-dasharray', `0 ${RING_C}`);
      g.arrowX.style.display = 'none';
      g.arrowY.style.display = 'none';
      g.arrowZ.style.display = 'none';
      g.deltaText.textContent = '';
      return;
    }

    // Rotation ring: fraction of a full turn, sign picks the colour.
    const frac = clamp(Math.abs(delta.dAngle) / 360, 0, 1);
    g.ringProgress.setAttribute('stroke-dasharray', `${(frac * RING_C).toFixed(2)} ${RING_C}`);
    g.ringProgress.setAttribute('stroke', delta.dAngle >= 0 ? AXIS_COLORS.y : AXIS_COLORS.x);

    // Gizmo arrows from centre, scaled + clamped.
    const lenX = clamp(delta.dx * GIZMO_SCALE, -GIZMO_MAX, GIZMO_MAX);
    const lenY = clamp(delta.dy * GIZMO_SCALE, -GIZMO_MAX, GIZMO_MAX);
    const lenZ = clamp(delta.dz * GIZMO_SCALE, -GIZMO_MAX, GIZMO_MAX);

    this.setArrow(g.arrowX, CENTER + lenX, CENTER, Math.abs(lenX) > 1.5);
    this.setArrow(g.arrowY, CENTER, CENTER + lenY, Math.abs(lenY) > 1.5);
    this.setArrow(
      g.arrowZ,
      CENTER + lenZ * GIZMO_Z_DX,
      CENTER + lenZ * GIZMO_Z_DY,
      Math.abs(lenZ) > 1.5
    );

    // Numeric readout.
    g.deltaText.textContent =
      `Δx ${delta.dx.toFixed(2)}  Δy ${delta.dy.toFixed(2)}  Δz ${delta.dz.toFixed(2)}  Δθ ${delta.dAngle.toFixed(0)}°`;
  }

  private setArrow(line: SVGLineElement, x2: number, y2: number, visible: boolean): void {
    if (!visible) {
      line.style.display = 'none';
      return;
    }
    line.style.display = '';
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
  }

  markAbsent(id: string): void {
    const g = this.glyphs.get(id);
    if (!g) return;
    g.present = false;
    g.tgtOpacity = FADE_FLOOR;
  }

  markAllAbsent(): void {
    this.glyphs.forEach(g => {
      g.present = false;
      g.tgtOpacity = FADE_FLOOR;
    });
  }

  render(): void {
    this.glyphs.forEach(g => {
      g.curOpacity = lerp(g.curOpacity, g.tgtOpacity, OPACITY_LERP);
      g.div.style.opacity = g.curOpacity.toFixed(3);

      if (g.present) {
        g.curX = lerp(g.curX, g.tgtX, POS_LERP);
        g.curY = lerp(g.curY, g.tgtY, POS_LERP);
      }

      g.div.style.transform = `translate3d(${g.curX.toFixed(2)}px, ${g.curY.toFixed(2)}px, 0)`;
    });
  }
}

/**
 * SVG symbol markup for gesture glyphs and facial-expression glyphs.
 * Every symbol is drawn inside a 0 0 100 100 box and accepts a stroke colour,
 * so hand glyphs render green and expression glyphs render blue.
 */

import type { GlyphType, GlyphSVG } from './types'


const SVG_SIZE     = 100
const STROKE_WIDTH = 8
const STROKE_COLOR = '#00FF88'

/**
 * Inner markup for a named symbol, centred in a 0 0 100 100 viewBox.
 * `name` covers hand glyph types plus expression names ('smile' | 'neutral'
 * | 'surprise'). Used both standalone and embedded in the glyph overlay.
 */
export function symbolMarkup (
  name: string,
  color: string = STROKE_COLOR,
  strokeWidth: number = STROKE_WIDTH
): string {
  const sw = strokeWidth
  switch (name) {
    // --- hand glyphs -----------------------------------------------------
    case 'palm':
      // open hand: five prongs fanning up from a wrist point
      return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
  <line x1="50" y1="88" x2="18" y2="54"/>
  <line x1="50" y1="88" x2="30" y2="26"/>
  <line x1="50" y1="88" x2="50" y2="18"/>
  <line x1="50" y1="88" x2="70" y2="22"/>
  <line x1="50" y1="88" x2="84" y2="40"/>
</g>`
    case 'fist':
      // closed fist: filled rounded block with knuckle ticks
      return `<g>
  <rect x="24" y="32" width="52" height="46" rx="12" fill="${color}" stroke="${color}" stroke-width="${sw}"/>
  <line x1="34" y1="34" x2="34" y2="24" stroke="${color}" stroke-width="${sw * 0.6}" stroke-linecap="round"/>
  <line x1="46" y1="33" x2="46" y2="22" stroke="${color}" stroke-width="${sw * 0.6}" stroke-linecap="round"/>
  <line x1="58" y1="33" x2="58" y2="22" stroke="${color}" stroke-width="${sw * 0.6}" stroke-linecap="round"/>
  <line x1="68" y1="34" x2="68" y2="24" stroke="${color}" stroke-width="${sw * 0.6}" stroke-linecap="round"/>
</g>`
    case 'circle':
      // OK / open circle: a ring
      return `<circle cx="50" cy="50" r="30" fill="none" stroke="${color}" stroke-width="${sw}"/>`
    case 'V':
      return `<path d="M 22 18 L 50 82 L 78 18" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'dash':
      return `<line x1="16" y1="50" x2="84" y2="50" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`
    // --- expression glyphs (little faces) --------------------------------
    case 'smile':
      return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round">
  <circle cx="50" cy="50" r="36"/>
  <circle cx="38" cy="42" r="3" fill="${color}" stroke="none"/>
  <circle cx="62" cy="42" r="3" fill="${color}" stroke="none"/>
  <path d="M 34 58 Q 50 74 66 58" fill="none"/>
</g>`
    case 'neutral':
      return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round">
  <circle cx="50" cy="50" r="36"/>
  <circle cx="38" cy="44" r="3" fill="${color}" stroke="none"/>
  <circle cx="62" cy="44" r="3" fill="${color}" stroke="none"/>
  <line x1="36" y1="62" x2="64" y2="62"/>
</g>`
    case 'surprise':
      return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round">
  <circle cx="50" cy="50" r="36"/>
  <circle cx="38" cy="42" r="3.5" fill="${color}" stroke="none"/>
  <circle cx="62" cy="42" r="3.5" fill="${color}" stroke="none"/>
  <circle cx="50" cy="64" r="8"/>
</g>`
    case 'unknown':
    default:
      return `<circle cx="50" cy="50" r="34" fill="none" stroke="${color === STROKE_COLOR ? '#888' : color}" stroke-width="${sw}" stroke-dasharray="7,5"/>
  <text x="50" y="58" font-size="34" text-anchor="middle" fill="${color === STROKE_COLOR ? '#888' : color}" font-family="sans-serif">?</text>`
  }
}

/** Standalone SVG for a hand glyph type. */
export function generateGlyphSVG (type: GlyphType): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${symbolMarkup(type)}
</svg>`,
    width:   SVG_SIZE,
    height:  SVG_SIZE,
    viewBox: '0 0 100 100'
  }
}

/** SVG as a data URL for easy embedding. */
export function getGlyphDataURL (type: GlyphType): string {
  const svg = generateGlyphSVG(type)
  return `data:image/svg+xml,${encodeURIComponent(svg.svg)}`
}

/** Create an SVG element for a glyph. */
export function createGlyphSVGElement (type: GlyphType, size: number = SVG_SIZE): SVGSVGElement {
  const glyph  = generateGlyphSVG(type)
  const parser = new DOMParser()
  const doc    = parser.parseFromString(glyph.svg, 'image/svg+xml')
  const svgEl  = doc.documentElement.cloneNode(true) as SVGSVGElement
  svgEl.setAttribute('width', size.toString())
  svgEl.setAttribute('height', size.toString())
  svgEl.style.pointerEvents = 'none'
  return svgEl
}

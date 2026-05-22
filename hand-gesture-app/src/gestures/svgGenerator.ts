/**
 * SVG Generator for hand gesture glyphs.
 * Simplified to the four supported gestures (+ unknown).
 */

import type { GlyphType, GlyphSVG } from './types';

const SVG_SIZE = 100;
const STROKE_WIDTH = 8;
const STROKE_COLOR = '#00FF88';
const FILL_COLOR = '#00FF88';

/**
 * Inner SVG markup for a glyph symbol, centred in a 0 0 100 100 viewBox.
 * Used both standalone and embedded inside the composite glyph overlay.
 */
export function generateGlyphSymbolMarkup(
  type: GlyphType,
  color: string = STROKE_COLOR,
  strokeWidth: number = STROKE_WIDTH
): string {
  switch (type) {
    case 'filled_circle':
      // Closed fist
      return `<circle cx="50" cy="50" r="34" fill="${FILL_COLOR}" stroke="${color}" stroke-width="${strokeWidth}"/>`;

    case 'star':
      // Open hand, spread wide
      return `<path d="M 50 12 L 61 39 L 88 39 L 66 57 L 75 84 L 50 67 L 25 84 L 34 57 L 12 39 L 39 39 Z" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;

    case 'dash':
      // Flat hand held sideways
      return `<line x1="16" y1="50" x2="84" y2="50" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;

    case 'V':
      // Peace / victory
      return `<path d="M 22 18 L 50 82 L 78 18" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;

    case 'unknown':
    default:
      return `<circle cx="50" cy="50" r="34" fill="none" stroke="#888" stroke-width="${strokeWidth}" stroke-dasharray="7,5"/>
  <text x="50" y="58" font-size="34" text-anchor="middle" fill="#888" font-family="sans-serif">?</text>`;
  }
}

/**
 * Generate a standalone SVG for a given glyph type.
 */
export function generateGlyphSVG(type: GlyphType): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${generateGlyphSymbolMarkup(type)}
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Get SVG as a data URL for easy embedding
 */
export function getGlyphDataURL(type: GlyphType): string {
  const svg = generateGlyphSVG(type);
  return `data:image/svg+xml,${encodeURIComponent(svg.svg)}`;
}

/**
 * Create an SVG element for a glyph
 */
export function createGlyphSVGElement(type: GlyphType, size: number = SVG_SIZE): SVGSVGElement {
  const glyph = generateGlyphSVG(type);
  const parser = new DOMParser();
  const doc = parser.parseFromString(glyph.svg, 'image/svg+xml');
  const svgElement = doc.documentElement.cloneNode(true) as SVGSVGElement;

  svgElement.setAttribute('width', size.toString());
  svgElement.setAttribute('height', size.toString());
  svgElement.style.pointerEvents = 'none';

  return svgElement;
}

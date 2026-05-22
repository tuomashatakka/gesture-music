/**
 * SVG Generator for hand gesture glyphs
 * Generates SVG representations of detected hand shapes
 */

import type { GlyphType, CircleVariant, GlyphSVG } from './types';

const SVG_SIZE = 100;
const STROKE_WIDTH = 8;
const STROKE_COLOR = '#00FF88';
const FILL_COLOR = '#00FF88';

/**
 * Generate SVG for a circle glyph
 */
function generateCircleSVG(variant?: CircleVariant): GlyphSVG {
  const isFilled = variant === undefined;
  
  if (isFilled) {
    // Filled circle (fist)
    return {
      svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="${FILL_COLOR}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}"/>
</svg>`,
      width: SVG_SIZE,
      height: SVG_SIZE,
      viewBox: '0 0 100 100'
    };
  }
  
  // Open circle with thumb connection indicator
  const thumbIndicator = getThumbIndicator(variant);
  
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-dasharray="251.2"/>
  ${thumbIndicator}
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Get SVG path for thumb connection indicator
 */
function getThumbIndicator(variant?: CircleVariant): string {
  if (!variant || variant === 'thumb_none') return '';
  
  const positions = {
    thumb_index: { x: 70, y: 30 },
    thumb_middle: { x: 70, y: 50 },
    thumb_ring: { x: 70, y: 70 },
    thumb_pinky: { x: 50, y: 85 }
  };
  
  const pos = positions[variant] || positions.thumb_index;
  
  return `<circle cx="${pos.x}" cy="${pos.y}" r="6" fill="${STROKE_COLOR}"/>`;
}

/**
 * Generate SVG for dash glyph (horizontal line)
 */
function generateDashSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="15" y1="50" x2="85" y2="50" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for slash glyph (diagonal line)
 */
function generateSlashSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="15" y1="85" x2="85" y2="15" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for triangle glyph
 */
function generateTriangleSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="50,15 85,85 15,85" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for square glyph
 */
function generateSquareSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="15" y="15" width="70" height="70" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for salmiakki glyph (Nordic candy symbol - saltire/X shape but with specific proportions)
 */
function generateSalmiakkiSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="15" y1="15" x2="85" y2="85" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
  <line x1="85" y1="15" x2="15" y2="85" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for X glyph (cross)
 */
function generateXSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="15" y1="15" x2="85" y2="85" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
  <line x1="85" y1="15" x2="15" y2="85" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for I glyph (single vertical line)
 */
function generateISVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="50" y1="15" x2="50" y2="85" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for V glyph
 */
function generateVSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 15 15 L 50 85 L 85 15" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for heart glyph
 */
function generateHeartSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 50 30 C 30 10, 15 25, 25 45 C 20 60, 40 75, 50 85 C 60 75, 80 60, 75 45 C 85 25, 70 10, 50 30 Z" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for star glyph
 */
function generateStarSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 50 10 L 61 39 L 90 39 L 68 59 L 79 88 L 50 70 L 21 88 L 32 59 L 10 39 L 39 39 Z" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for checkmark glyph
 */
function generateCheckmarkSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 50 L 40 70 L 80 30" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for peace glyph
 */
function generatePeaceSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <line x1="30" y1="20" x2="30" y2="80" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
  <line x1="70" y1="20" x2="70" y2="80" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for unknown glyph (question mark)
 */
function generateUnknownSVG(): GlyphSVG {
  return {
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="none" stroke="#666" stroke-width="${STROKE_WIDTH}" stroke-dasharray="8,4"/>
  <text x="50" y="55" font-size="20" text-anchor="middle" fill="#666" font-family="Arial">?</text>
</svg>`,
    width: SVG_SIZE,
    height: SVG_SIZE,
    viewBox: '0 0 100 100'
  };
}

/**
 * Generate SVG for a given glyph type
 */
export function generateGlyphSVG(type: GlyphType, variant?: CircleVariant): GlyphSVG {
  switch (type) {
    case 'circle':
    case 'filled_circle':
      return generateCircleSVG(variant);
    case 'dash':
      return generateDashSVG();
    case 'slash':
      return generateSlashSVG();
    case 'triangle':
      return generateTriangleSVG();
    case 'square':
      return generateSquareSVG();
    case 'salmiakki':
      return generateSalmiakkiSVG();
    case 'X':
      return generateXSVG();
    case 'I':
      return generateISVG();
    case 'V':
      return generateVSVG();
    case 'heart':
      return generateHeartSVG();
    case 'star':
      return generateStarSVG();
    case 'checkmark':
      return generateCheckmarkSVG();
    case 'peace':
      return generatePeaceSVG();
    case 'unknown':
    default:
      return generateUnknownSVG();
  }
}

/**
 * Get SVG as a data URL for easy embedding
 */
export function getGlyphDataURL(type: GlyphType, variant?: CircleVariant): string {
  const svg = generateGlyphSVG(type, variant);
  return `data:image/svg+xml,${encodeURIComponent(svg.svg)}`;
}

/**
 * Create an SVG element for a glyph
 */
export function createGlyphSVGElement(type: GlyphType, variant?: CircleVariant, size: number = SVG_SIZE): SVGSVGElement {
  const glyph = generateGlyphSVG(type, variant);
  const parser = new DOMParser();
  const doc = parser.parseFromString(glyph.svg, 'image/svg+xml');
  const svgElement = doc.documentElement.cloneNode(true) as SVGSVGElement;
  
  svgElement.setAttribute('width', size.toString());
  svgElement.setAttribute('height', size.toString());
  svgElement.style.pointerEvents = 'none';
  
  return svgElement;
}

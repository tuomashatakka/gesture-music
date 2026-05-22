/**
 * Hand + Face detection with MediaPipe Holistic.
 *
 * Rendering pipeline:
 *   MeshOverlay   – persistent SVG skeleton (interpolated joints)
 *   GlyphOverlay  – persistent div badges (glyph + delta gizmo)
 *   EffectsRenderer – WebGL2 canvas
 *       pass 1: animated film grain + radial vignette
 *       pass 2: tap ripples (additive)
 *       pass 3: held-gesture bloom flares (additive)
 *
 * Gesture state is hardened with GestureDebouncer (rolling-window voting)
 * so brief false-reads never reset the held-delta reference.
 *
 * Tap gesture: fist + index finger rotated toward the camera → fires a
 * ripple effect at the fingertip position.
 */

import { FilesetResolver, HolisticLandmarker, type HolisticLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  detectGesture, runAllChecks, detectExpression,
  GestureDebouncer, TapDetector,
  FingerIndices
} from './gestures';
import type { NormalizedLandmark } from './gestures';
import { MeshOverlay, type ProjectedPoint, type EntitySpec } from './render/meshOverlay';
import { GlyphOverlay } from './render/glyphOverlay';
import { GestureHoldTracker } from './render/gestureHold';
import { EffectsRenderer } from './render/effectsRenderer';

declare global {
  interface Window {
    videoDisplay: {
      width: number; height: number;
      offsetX: number; offsetY: number;
      scaleX: number; scaleY: number;
    };
  }
}

// DOM
const videoElement    = document.getElementById('video')           as HTMLVideoElement;
const statusElement   = document.getElementById('status')          as HTMLElement;
const infoElement     = document.getElementById('info')            as HTMLElement;
const videoContainer  = document.getElementById('video-container') as HTMLElement;

const legacyCanvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (legacyCanvas) legacyCanvas.style.display = 'none';

const MIRROR = true;

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

const glyphContainer = document.createElement('div');
glyphContainer.id = 'glyph-container';
Object.assign(glyphContainer.style, {
  position: 'absolute', top: '0', left: '0',
  width: '100%', height: '100%',
  pointerEvents: 'none', zIndex: '10',
} as CSSStyleDeclaration);
videoContainer.appendChild(glyphContainer);

const meshOverlay    = new MeshOverlay(videoContainer);
const glyphOverlay   = new GlyphOverlay(glyphContainer);
const holdTracker    = new GestureHoldTracker();
const effectsRenderer = new EffectsRenderer(videoContainer);

// Per-hand state (lazy-initialised by hand id)
const debouncers   = new Map<string, GestureDebouncer>();
const tapDetectors = new Map<string, TapDetector>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** '#RRGGBB' or '#RGB' → [r, g, b] normalised 0-1 */
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const n = c.length === 3
    ? parseInt(c.split('').map(x => x + x).join(''), 16)
    : parseInt(c, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------------
// Holistic instance
// ---------------------------------------------------------------------------
let holistic: HolisticLandmarker | null = null;

// ---------------------------------------------------------------------------
// Debug overlay (press D)
// ---------------------------------------------------------------------------
let debugVisible = false;
const debugOverlay = document.createElement('div');
debugOverlay.id = 'debug-overlay';
debugOverlay.style.cssText = `
  position:fixed;bottom:10px;right:10px;
  background:rgba(0,0,0,0.85);color:#fff;
  font-family:monospace;font-size:12px;
  padding:12px;border-radius:8px;z-index:1000;
  max-height:80vh;overflow-y:auto;display:none;
  min-width:200px;box-shadow:0 4px 12px rgba(0,0,0,0.5);
`;
document.body.appendChild(debugOverlay);

const debugButton = document.createElement('button');
debugButton.textContent = 'Debug';
debugButton.style.cssText = `
  position:fixed;top:10px;right:10px;
  padding:8px 12px;background:rgba(60,60,60,0.9);
  color:#fff;border:none;border-radius:4px;
  cursor:pointer;z-index:1000;font-family:sans-serif;font-size:14px;
`;
debugButton.addEventListener('click', toggleDebug);
document.body.appendChild(debugButton);
document.addEventListener('keydown', e => { if (e.key === 'd' || e.key === 'D') toggleDebug(); });

function toggleDebug(): void {
  debugVisible = !debugVisible;
  debugOverlay.style.display = debugVisible ? 'block' : 'none';
  debugButton.textContent = debugVisible ? 'Hide Debug' : 'Show Debug';
}

// ---------------------------------------------------------------------------
// Colours / connections
// ---------------------------------------------------------------------------
const HAND_COLORS = ['#00FF88', '#FF6B6B'];
const FACE_COLOR = '#4FC3F7';
const EXPRESSION_COLOR = '#4FC3F7';

type Connection = { start: number; end: number };
function toTupleArray(cs: readonly Connection[]): [number, number][] {
  return cs.map(c => [c.start, c.end]);
}

const HAND_CONNECTIONS = toTupleArray(HolisticLandmarker.HAND_CONNECTIONS);
const FACE_CONNECTIONS: [number, number][] = [
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_FACE_OVAL),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LIPS),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYE),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYE),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
];

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------
function project(lm: NormalizedLandmark): ProjectedPoint {
  const d  = window.videoDisplay;
  const nx = MIRROR ? 1 - lm.x : lm.x;
  return { x: d.offsetX + nx * d.width, y: d.offsetY + lm.y * d.height };
}
function projectAll(lms: NormalizedLandmark[]): ProjectedPoint[] { return lms.map(project); }
function centreOf(pts: ProjectedPoint[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

// ---------------------------------------------------------------------------
// Debug overlay
// ---------------------------------------------------------------------------
function updateDebugOverlay(landmarks: NormalizedLandmark[] | null): void {
  if (!debugVisible) return;
  if (!landmarks) { debugOverlay.innerHTML = '<div>No hand detected</div>'; return; }
  const checks  = runAllChecks(landmarks);
  const gesture = detectGesture(landmarks, { label: 'Right', score: 1, index: 0 }, MIRROR);
  const subTxt  = gesture.subLabel ? ` [${gesture.subLabel}]` : '';
  let html = `<div style="margin-bottom:8px;font-weight:bold;color:#4fc3f7;">Detected: ${gesture.type}${subTxt}</div>`;
  html += `<div style="margin-bottom:8px;font-size:11px;color:#aaa;">Confidence: ${(gesture.confidence * 100).toFixed(0)}%</div>`;
  html += '<div style="margin-bottom:4px;font-size:11px;color:#aaa;">Checks:</div>';
  for (const check of checks) {
    const col = check.passed ? '#4caf50' : '#f44336';
    html += `<div style="padding:2px 0;display:flex;justify-content:space-between;">
      <span>${check.name}</span><span style="color:${col}">${check.passed ? '✓' : '✗'}</span>
    </div>`;
  }
  debugOverlay.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Per-frame processing
// ---------------------------------------------------------------------------
function processResults(result: HolisticLandmarkerResult): void {
  const videoAR        = videoElement.videoWidth / videoElement.videoHeight;
  const cW             = videoElement.clientWidth;
  const cH             = videoElement.clientHeight;
  let dW: number, dH: number, oX = 0, oY = 0;
  if (cW / cH > videoAR) {
    dH = cH; dW = cH * videoAR; oX = (cW - dW) / 2;
  } else {
    dW = cW; dH = cW / videoAR; oY = (cH - dH) / 2;
  }
  window.videoDisplay = { width: dW, height: dH, offsetX: oX, offsetY: oY, scaleX: dW / videoElement.videoWidth, scaleY: dH / videoElement.videoHeight };

  meshOverlay.setViewport(cW, cH);
  meshOverlay.markAllAbsent();
  glyphOverlay.markAllAbsent();

  // ── Face ─────────────────────────────────────────────────────────────────
  if (result.faceLandmarks?.length > 0) {
    const face = result.faceLandmarks[0];
    const faceSpec: EntitySpec = {
      id: 'face', connections: FACE_CONNECTIONS,
      color: FACE_COLOR, lineWidth: 1.5, drawPoints: false,
    };
    meshOverlay.update(faceSpec, projectAll(face));

    const expr     = detectExpression(face);
    const forehead = project(face[10] ?? face[0]);
    glyphOverlay.update({
      id: 'face-expr', x: forehead.x, y: forehead.y - 90,
      symbol: expr.type, label: expr.type.toUpperCase(),
      color: EXPRESSION_COLOR, delta: null, decorations: false,
    });
  }

  // ── Hands ─────────────────────────────────────────────────────────────────
  const hands: { id: string; label: 'Left' | 'Right'; landmarks: NormalizedLandmark[]; color: string }[] = [];
  if (result.leftHandLandmarks?.[0])  hands.push({ id: 'hand-Left',  label: 'Left',  landmarks: result.leftHandLandmarks[0],  color: HAND_COLORS[1] });
  if (result.rightHandLandmarks?.[0]) hands.push({ id: 'hand-Right', label: 'Right', landmarks: result.rightHandLandmarks[0], color: HAND_COLORS[0] });

  // Track which hand ids are active this frame so we can clean up stale flares.
  const activeHandIds = new Set<string>();

  for (const hand of hands) {
    activeHandIds.add(hand.id);

    // Lazy-init per-hand helpers
    if (!debouncers.has(hand.id))   debouncers.set(hand.id,   new GestureDebouncer());
    if (!tapDetectors.has(hand.id)) tapDetectors.set(hand.id, new TapDetector());
    const debouncer  = debouncers.get(hand.id)!;
    const tapDet     = tapDetectors.get(hand.id)!;

    // Raw detection → stable primary type via rolling-window vote
    const rawGlyph    = detectGesture(hand.landmarks, { label: hand.label, score: 0.9, index: 0 }, MIRROR);
    const stableType  = debouncer.update(rawGlyph.type);
    const stableGlyph = { ...rawGlyph, type: stableType };

    // Hold tracker uses the STABLE type so sub-gesture noise / brief flickers
    // never reset the delta reference.
    const delta = holdTracker.update(hand.id, stableType, hand.landmarks, MIRROR);

    // ── Tap detection ───────────────────────────────────────────────────────
    const tapped = tapDet.update(hand.landmarks, stableType);
    if (tapped) {
      const tipPx = project(hand.landmarks[FingerIndices.index.tip]);
      effectsRenderer.spawnRipple(tipPx.x, tipPx.y, hexToRgb(hand.color));
    }

    // ── Bloom flare (held gesture with non-zero deltas) ─────────────────────
    if (delta && stableType !== 'unknown') {
      const c = centreOf(projectAll(hand.landmarks));
      effectsRenderer.updateFlare(
        hand.id, c.x, c.y, hexToRgb(hand.color),
        delta.dx, delta.dy, delta.dz, delta.dAngle
      );
    } else {
      effectsRenderer.removeFlare(hand.id);
    }

    // ── Mesh ────────────────────────────────────────────────────────────────
    const projected = projectAll(hand.landmarks);
    meshOverlay.update({
      id: hand.id, connections: HAND_CONNECTIONS,
      color: hand.color, lineWidth: 2, pointRadius: 3, drawPoints: true,
    }, projected);

    // ── Glyph badge ──────────────────────────────────────────────────────────
    const c    = centreOf(projected);
    let minY   = Infinity;
    for (const p of projected) minY = Math.min(minY, p.y);

    const mainLabel = stableType === 'unknown'
      ? `UNKNOWN - ${hand.label.toUpperCase()}`
      : `${stableType.toUpperCase()} - ${hand.label.toUpperCase()}`;

    glyphOverlay.update({
      id: hand.id, x: c.x, y: minY - 70,
      symbol: stableType, label: mainLabel,
      subLabel: stableGlyph.subLabel,
      color: hand.color, delta,
    });
  }

  // Remove flares for hands that left frame
  for (const [id] of debouncers) {
    if (!activeHandIds.has(id)) effectsRenderer.removeFlare(id);
  }

  // Status + debug
  if (hands.length > 0) {
    statusElement.textContent = `Detected ${hands.length} hand(s)`;
    updateDebugOverlay(hands[0].landmarks);
  } else {
    statusElement.textContent = 'No hands detected. Show your hands to the camera.';
    updateDebugOverlay(null);
  }

  meshOverlay.render();
  glyphOverlay.render();
  effectsRenderer.render();
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
function processFrame(): void {
  if (!holistic || videoElement.readyState !== 4) {
    requestAnimationFrame(processFrame);
    return;
  }
  try {
    processResults(holistic.detectForVideo(videoElement, performance.now()));
  } catch (err) {
    console.error('Error processing frame:', err);
  }
  requestAnimationFrame(processFrame);
}

// ---------------------------------------------------------------------------
// Camera + init
// ---------------------------------------------------------------------------
async function initializeCamera(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    videoElement.srcObject = stream;
    statusElement.textContent = 'Camera ready. Loading detection models...';
    await new Promise(resolve => { videoElement.onloadedmetadata = resolve; });
    return true;
  } catch (err) {
    console.error('Error accessing camera:', err);
    statusElement.textContent = 'Error: Could not access camera. Please check permissions.';
    return false;
  }
}

async function init(): Promise<void> {
  const cameraReady = await initializeCamera();
  if (!cameraReady) return;

  try {
    statusElement.textContent = 'Loading detection models...';
    const wasmFileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    );
    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task';

    try {
      holistic = await HolisticLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
      });
    } catch {
      statusElement.textContent = 'GPU not available, falling back to CPU...';
      holistic = await HolisticLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
      });
    }

    statusElement.textContent = 'Detection ready! Show your hands and face.';
    infoElement.textContent   = 'Gestures: palm · fist · circle · V · dash | Tap: fist + index toward camera';
    processFrame();
  } catch (err) {
    console.error('Error initializing:', err);
    statusElement.textContent = 'Error: Could not load detection models.';
  }
}

async function cleanup(): Promise<void> {
  if (holistic) await holistic.close();
  if (videoElement.srcObject)
    (videoElement.srcObject as MediaStream).getTracks().forEach(t => t.stop());
}

window.addEventListener('beforeunload', () => cleanup().catch(console.error));
init().catch(console.error);

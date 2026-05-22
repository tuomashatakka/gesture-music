/**
 * Hand + Face detection with MediaPipe Holistic. (Body/pose tracking removed.)
 *
 * Rendering architecture:
 *   - The skeleton mesh lives on a PERSISTENT SVG overlay (MeshOverlay), not a
 *     redrawn canvas. Joints interpolate toward their targets each frame and the
 *     whole hand/face group is positioned with translate3d.
 *   - Glyph badges are PERSISTENT divs (GlyphOverlay) positioned with translate3d.
 *     Hands get a green gesture glyph; the face gets a BLUE expression glyph.
 *   - When a hand/face leaves frame it keeps its last pose and fades to a
 *     translucent floor instead of vanishing.
 *   - The front camera is mirrored, so landmark x is flipped to match what the
 *     user sees (fixes the previously back-to-front mesh).
 *   - While a gesture is held we show its delta position (3-axis gizmo arrows)
 *     and delta rotation (a circular progress ring around the glyph). The held
 *     reference persists across sub-gesture changes and brief dropouts.
 */

import { FilesetResolver, HolisticLandmarker, type HolisticLandmarkerResult } from '@mediapipe/tasks-vision';
import { detectGesture, runAllChecks, detectExpression } from './gestures';
import type { NormalizedLandmark } from './gestures';
import { MeshOverlay, type ProjectedPoint, type EntitySpec } from './render/meshOverlay';
import { GlyphOverlay } from './render/glyphOverlay';
import { GestureHoldTracker } from './render/gestureHold';

declare global {
  interface Window {
    videoDisplay: {
      width: number;
      height: number;
      offsetX: number;
      offsetY: number;
      scaleX: number;
      scaleY: number;
    };
  }
}

// DOM Elements
const videoElement = document.getElementById('video') as HTMLVideoElement;
const statusElement = document.getElementById('status') as HTMLElement;
const infoElement = document.getElementById('info') as HTMLElement;
const videoContainer = document.getElementById('video-container') as HTMLElement;

// The legacy <canvas> is no longer used for the mesh; hide it if present.
const legacyCanvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (legacyCanvas) legacyCanvas.style.display = 'none';

// Front camera => mirrored preview => flip landmark x to match.
const MIRROR = true;

// Persistent glyph container (positioned children move via translate3d).
const glyphContainer = document.createElement('div');
glyphContainer.id = 'glyph-container';
Object.assign(glyphContainer.style, {
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: '10'
} as CSSStyleDeclaration);
videoContainer.appendChild(glyphContainer);

// Persistent overlays.
const meshOverlay = new MeshOverlay(videoContainer);
const glyphOverlay = new GlyphOverlay(glyphContainer);
const holdTracker = new GestureHoldTracker();

// Holistic landmarker instance
let holistic: HolisticLandmarker | null = null;

// ---------------------------------------------------------------------------
// Debug overlay (press D)
// ---------------------------------------------------------------------------
let debugVisible = false;
const debugOverlay = document.createElement('div');
debugOverlay.id = 'debug-overlay';
debugOverlay.style.cssText = `
  position: fixed; bottom: 10px; right: 10px;
  background: rgba(0,0,0,0.85); color: #fff;
  font-family: monospace; font-size: 12px;
  padding: 12px; border-radius: 8px; z-index: 1000;
  max-height: 80vh; overflow-y: auto; display: none;
  min-width: 200px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
`;
document.body.appendChild(debugOverlay);

const debugButton = document.createElement('button');
debugButton.id = 'debug-toggle';
debugButton.textContent = 'Debug';
debugButton.style.cssText = `
  position: fixed; top: 10px; right: 10px;
  padding: 8px 12px; background: rgba(60,60,60,0.9);
  color: #fff; border: none; border-radius: 4px;
  cursor: pointer; z-index: 1000; font-family: sans-serif; font-size: 14px;
`;
debugButton.addEventListener('click', toggleDebug);
document.body.appendChild(debugButton);

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug();
});

function toggleDebug(): void {
  debugVisible = !debugVisible;
  debugOverlay.style.display = debugVisible ? 'block' : 'none';
  debugButton.textContent = debugVisible ? 'Hide Debug' : 'Show Debug';
}

// ---------------------------------------------------------------------------
// Colours / connection specs
// ---------------------------------------------------------------------------
const HAND_COLORS = ['#00FF88', '#FF6B6B'];
const FACE_COLOR = '#4FC3F7';
const EXPRESSION_COLOR = '#4FC3F7';

type Connection = { start: number; end: number };
function toTupleArray(connections: readonly Connection[]): [number, number][] {
  return connections.map(c => [c.start, c.end]);
}

const HAND_CONNECTIONS = toTupleArray(HolisticLandmarker.HAND_CONNECTIONS);
const FACE_CONNECTIONS: [number, number][] = [
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_FACE_OVAL),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LIPS),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYE),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYE),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW)
];

// ---------------------------------------------------------------------------
// Projection: normalized landmark -> on-screen pixel (with mirroring)
// ---------------------------------------------------------------------------
function project(lm: NormalizedLandmark): ProjectedPoint {
  const d = window.videoDisplay;
  const nx = MIRROR ? 1 - lm.x : lm.x;
  return {
    x: d.offsetX + nx * d.width,
    y: d.offsetY + lm.y * d.height
  };
}

function projectAll(landmarks: NormalizedLandmark[]): ProjectedPoint[] {
  return landmarks.map(project);
}

function centreOf(points: ProjectedPoint[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

// ---------------------------------------------------------------------------
// Debug overlay update
// ---------------------------------------------------------------------------
function updateDebugOverlay(landmarks: NormalizedLandmark[] | null): void {
  if (!debugVisible) return;
  if (!landmarks) {
    debugOverlay.innerHTML = '<div>No hand detected</div>';
    return;
  }
  const checks = runAllChecks(landmarks);
  const gesture = detectGesture(landmarks, { label: 'Right', score: 1, index: 0 }, MIRROR);
  const subTxt = gesture.subLabel ? ` [${gesture.subLabel}]` : '';
  let html = `<div style="margin-bottom:8px;font-weight:bold;color:#4fc3f7;">Detected: ${gesture.type}${subTxt}</div>`;
  html += `<div style="margin-bottom:8px;font-size:11px;color:#aaa;">Confidence: ${(gesture.confidence * 100).toFixed(0)}%</div>`;
  html += '<div style="margin-bottom:4px;font-size:11px;color:#aaa;">Checks:</div>';
  for (const check of checks) {
    const color = check.passed ? '#4caf50' : '#f44336';
    html += `<div style="padding:2px 0;display:flex;justify-content:space-between;">
      <span>${check.name}</span><span style="color:${color}">${check.passed ? '\u2713' : '\u2717'}</span>
    </div>`;
  }
  debugOverlay.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Per-frame processing
// ---------------------------------------------------------------------------
function processResults(result: HolisticLandmarkerResult): void {
  const videoAspectRatio = videoElement.videoWidth / videoElement.videoHeight;
  const containerWidth = videoElement.clientWidth;
  const containerHeight = videoElement.clientHeight;

  let displayWidth, displayHeight, offsetX = 0, offsetY = 0;
  if (containerWidth / containerHeight > videoAspectRatio) {
    displayHeight = containerHeight;
    displayWidth = containerHeight * videoAspectRatio;
    offsetX = (containerWidth - displayWidth) / 2;
  } else {
    displayWidth = containerWidth;
    displayHeight = containerWidth / videoAspectRatio;
    offsetY = (containerHeight - displayHeight) / 2;
  }

  window.videoDisplay = {
    width: displayWidth,
    height: displayHeight,
    offsetX,
    offsetY,
    scaleX: displayWidth / videoElement.videoWidth,
    scaleY: displayHeight / videoElement.videoHeight
  };

  meshOverlay.setViewport(containerWidth, containerHeight);

  // Everything fades unless re-asserted as present this frame.
  meshOverlay.markAllAbsent();
  glyphOverlay.markAllAbsent();

  // 1. Face mesh (lines only) + a BLUE expression glyph above the forehead.
  if (result.faceLandmarks && result.faceLandmarks.length > 0) {
    const face = result.faceLandmarks[0];
    const faceSpec: EntitySpec = {
      id: 'face',
      connections: FACE_CONNECTIONS,
      color: FACE_COLOR,
      lineWidth: 1.5,
      drawPoints: false
    };
    const projectedFace = projectAll(face);
    meshOverlay.update(faceSpec, projectedFace);

    // Expression glyph (blue) positioned above the top of the head.
    const expr = detectExpression(face);
    const forehead = project(face[10] ?? face[0]);
    glyphOverlay.update({
      id: 'face-expr',
      x: forehead.x,
      y: forehead.y - 90,
      symbol: expr.type,
      label: `${expr.type.toUpperCase()}`,
      color: EXPRESSION_COLOR,
      delta: null,
      decorations: false
    });
  }

  // 2. Hands (left + right, stable ids keyed by handedness).
  const hands: { id: string; label: 'Left' | 'Right'; landmarks: NormalizedLandmark[]; color: string }[] = [];
  if (result.leftHandLandmarks?.[0]) {
    hands.push({ id: 'hand-Left', label: 'Left', landmarks: result.leftHandLandmarks[0], color: HAND_COLORS[1] });
  }
  if (result.rightHandLandmarks?.[0]) {
    hands.push({ id: 'hand-Right', label: 'Right', landmarks: result.rightHandLandmarks[0], color: HAND_COLORS[0] });
  }

  for (const hand of hands) {
    const projected = projectAll(hand.landmarks);

    // Mesh.
    meshOverlay.update({
      id: hand.id,
      connections: HAND_CONNECTIONS,
      color: hand.color,
      lineWidth: 2,
      pointRadius: 3,
      drawPoints: true
    }, projected);

    // Gesture (+ sub-gesture) and the held-delta relative to the gesture start.
    const glyph = detectGesture(hand.landmarks, { label: hand.label, score: 0.9, index: 0 }, MIRROR);
    const delta = holdTracker.update(hand.id, glyph.type, hand.landmarks, MIRROR);

    // Badge floats just above the hand.
    const c = centreOf(projected);
    let minY = Infinity;
    for (const p of projected) minY = Math.min(minY, p.y);
    const badgeY = minY - 70;

    const mainLabel = glyph.type === 'unknown'
      ? `UNKNOWN - ${hand.label.toUpperCase()}`
      : `${glyph.type.toUpperCase()} - ${hand.label.toUpperCase()}`;

    glyphOverlay.update({
      id: hand.id,
      x: c.x,
      y: badgeY,
      symbol: glyph.type,
      label: mainLabel,
      subLabel: glyph.subLabel,
      color: hand.color,
      delta
    });
  }

  // NOTE: we intentionally do NOT release hold references for hands that left
  // frame, so a held gesture resumes its delta origin when the hand returns.

  // Status + debug.
  if (hands.length > 0) {
    statusElement.textContent = `Detected ${hands.length} hand(s)`;
    updateDebugOverlay(hands[0].landmarks);
  } else {
    statusElement.textContent = 'No hands detected. Show your hands to the camera.';
    updateDebugOverlay(null);
  }

  // Commit interpolation to the DOM.
  meshOverlay.render();
  glyphOverlay.render();
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
    const result = holistic.detectForVideo(videoElement, performance.now());
    processResults(result);
  } catch (error) {
    console.error('Error processing frame:', error);
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
      audio: false
    });
    videoElement.srcObject = stream;
    statusElement.textContent = 'Camera ready. Loading detection models...';
    await new Promise(resolve => { videoElement.onloadedmetadata = resolve; });
    return true;
  } catch (error) {
    console.error('Error accessing camera:', error);
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
    infoElement.textContent = 'Hand + Face Detection | Gestures: palm, fist, circle (OK), V, dash';
    processFrame();
  } catch (error) {
    console.error('Error initializing detection:', error);
    statusElement.textContent = 'Error: Could not load detection models. Make sure your browser supports WebAssembly.';
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup(): Promise<void> {
  if (holistic) await holistic.close();
  if (videoElement.srcObject) {
    (videoElement.srcObject as MediaStream).getTracks().forEach(track => track.stop());
  }
}

window.addEventListener('beforeunload', () => cleanup().catch(console.error));

init().catch(console.error);

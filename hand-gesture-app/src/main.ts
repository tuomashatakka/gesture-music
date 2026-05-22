/**
 * Hand, Face, and Pose Detection with MediaPipe Tasks Vision
 * Detects hand gestures, face landmarks, and pose from camera input,
 * draws skeleton wireframe overlays, and displays recognized glyph symbols next to each hand.
 */

import { FilesetResolver, HolisticLandmarker, type HolisticLandmarkerResult } from '@mediapipe/tasks-vision';
import { detectGesture, detectGestures, generateGlyphSVG, runAllChecks } from './gestures';
import type { GlyphType, CircleVariant, DetectedGlyph, NormalizedLandmark, CheckResult, Handedness } from './gestures';

// Extend Window interface for video display properties
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
const canvasElement = document.getElementById('canvas') as HTMLCanvasElement;
const statusElement = document.getElementById('status') as HTMLElement;
const infoElement = document.getElementById('info') as HTMLElement;
const videoContainer = document.getElementById('video-container') as HTMLElement;

// Glyph container
const glyphContainer = document.createElement('div');
glyphContainer.id = 'glyph-container';
glyphContainer.style.position = 'absolute';
glyphContainer.style.top = '0';
glyphContainer.style.left = '0';
glyphContainer.style.width = '100%';
glyphContainer.style.height = '100%';
glyphContainer.style.pointerEvents = 'none';
glyphContainer.style.zIndex = '10';
videoContainer.appendChild(glyphContainer);

// Debug overlay toggle key (press D)
document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    toggleDebug();
  }
});

const canvasCtx = canvasElement.getContext('2d')!;

// Holistic landmarker instance
let holistic: HolisticLandmarker | null = null;

// Debug overlay
let debugVisible = false;
const debugOverlay = document.createElement('div');
debugOverlay.id = 'debug-overlay';
debugOverlay.style.cssText = `
  position: fixed;
  bottom: 10px;
  right: 10px;
  background: rgba(0,0,0,0.85);
  color: #fff;
  font-family: monospace;
  font-size: 12px;
  padding: 12px;
  border-radius: 8px;
  z-index: 1000;
  max-height: 80vh;
  overflow-y: auto;
  display: none;
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
`;
document.body.appendChild(debugOverlay);

// Debug toggle button
const debugButton = document.createElement('button');
debugButton.id = 'debug-toggle';
debugButton.textContent = 'Debug';
debugButton.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  padding: 8px 12px;
  background: rgba(60,60,60,0.9);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  z-index: 1000;
  font-family: sans-serif;
  font-size: 14px;
`;
debugButton.addEventListener('click', toggleDebug);
document.body.appendChild(debugButton);

function toggleDebug(): void {
  debugVisible = !debugVisible;
  debugOverlay.style.display = debugVisible ? 'block' : 'none';
  debugButton.textContent = debugVisible ? 'Hide Debug' : 'Show Debug';
}

// Glyph elements tracking
const glyphElements: { element: HTMLElement; handIndex: number }[] = [];

// Color constants
const HAND_COLORS = ['#00FF88', '#FF6B6B', '#4ECDC4', '#FFE66D'];
const POINT_COLOR = '#FFFFFF';
const POINT_RADIUS = 3;
const LINE_WIDTH = 2;

const FACE_COLOR = '#4FC3F7';
const POSE_COLOR = '#FFB74D';

const GLYPH_SIZE = 80;
const GLYPH_OFFSET_X = 100;
const GLYPH_OFFSET_Y = -50;

// Connection conversion helper: MediaPipe connections are objects { start, end }
type Connection = { start: number; end: number };
function toTupleArray(connections: readonly Connection[]): [number, number][] {
  return connections.map(c => [c.start, c.end]);
}

// Pre-converted connection arrays (as [number, number][])
const HAND_CONNECTIONS = toTupleArray(HolisticLandmarker.HAND_CONNECTIONS);
const POSE_CONNECTIONS = toTupleArray(HolisticLandmarker.POSE_CONNECTIONS);
const FACE_OVAL_CONNECTIONS = toTupleArray(HolisticLandmarker.FACE_LANDMARKS_FACE_OVAL);
const FACE_LIPS_CONNECTIONS = toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LIPS);
const FACE_LEFT_EYE_CONNECTIONS = toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYE);
const FACE_RIGHT_EYE_CONNECTIONS = toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYE);
const FACE_LEFT_EYEBROW_CONNECTIONS = toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYEBROW);
const FACE_RIGHT_EYEBROW_CONNECTIONS = toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);

// Drawing helpers
function drawConnections(
  landmarks: NormalizedLandmark[],
  connections: [number, number][],
  color: string
): void {
  const display = window.videoDisplay!;
  if (!landmarks || landmarks.length === 0 || !display) return;

  connections.forEach(([start, end]) => {
    const startLm = landmarks[start];
    const endLm = landmarks[end];
    if (startLm && endLm) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(
        display.offsetX + startLm.x * display.width,
        display.offsetY + startLm.y * display.height
      );
      canvasCtx.lineTo(
        display.offsetX + endLm.x * display.width,
        display.offsetY + endLm.y * display.height
      );
      canvasCtx.strokeStyle = color;
      canvasCtx.lineWidth = LINE_WIDTH;
      canvasCtx.stroke();
    }
  });
}

function drawPoints(landmarks: NormalizedLandmark[], color: string, radius: number = POINT_RADIUS): void {
  const display = window.videoDisplay!;
  if (!landmarks || !display) return;

  landmarks.forEach(lm => {
    canvasCtx.beginPath();
    canvasCtx.arc(
      display.offsetX + lm.x * display.width,
      display.offsetY + lm.y * display.height,
      radius,
      0,
      2 * Math.PI
    );
    canvasCtx.fillStyle = color;
    canvasCtx.fill();
  });
}

function drawSkeleton(
  landmarks: NormalizedLandmark[],
  connections: [number, number][],
  color: string
): void {
  drawConnections(landmarks, connections, color);
  drawPoints(landmarks, POINT_COLOR, POINT_RADIUS);
}

function getHandCenter(landmarks: NormalizedLandmark[]): { x: number; y: number } {
  const palmLandmarks = landmarks.slice(0, 9);
  let sumX = 0, sumY = 0;
  palmLandmarks.forEach(l => {
    sumX += l.x;
    sumY += l.y;
  });
  return { x: sumX / palmLandmarks.length, y: sumY / palmLandmarks.length };
}

function createGlyphElement(glyph: DetectedGlyph, handIndex: number, canvasWidth: number, canvasHeight: number): HTMLElement {
  const center = getHandCenter(glyph.landmarks);
  const isRightHand = glyph.hand === 'right';
  const xPos = center.x * canvasWidth + (isRightHand ? -GLYPH_OFFSET_X : GLYPH_OFFSET_X);
  const yPos = center.y * canvasHeight + GLYPH_OFFSET_Y;

   const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = `${xPos}px`;
  container.style.top = `${yPos}px`;
  container.style.transform = 'translate(-50%, -50%)';
  container.style.zIndex = '10';
  container.style.pointerEvents = 'none';
  container.style.transition = 'all 20ms ease-out';
  container.dataset.handIndex = handIndex.toString();
  container.dataset.hand = glyph.hand;

  const svg = generateGlyphSVG(glyph.type, glyph.variant as CircleVariant);
  container.innerHTML = svg.svg;

  const svgElement = container.querySelector('svg');
  if (svgElement) {
    svgElement.style.width = `${GLYPH_SIZE}px`;
    svgElement.style.height = `${GLYPH_SIZE}px`;
    svgElement.style.filter = 'drop-shadow(0 0 8px rgba(0, 255, 136, 0.7))';
  }

  const label = document.createElement('div');
  label.textContent = getGlyphLabel(glyph);
  label.style.position = 'absolute';
  label.style.top = `${GLYPH_SIZE + 10}px`;
  label.style.left = '50%';
  label.style.transform = 'translateX(-50%)';
  label.style.color = '#00FF88';
  label.style.fontSize = '14px';
  label.style.fontWeight = 'bold';
  label.style.textShadow = '0 0 4px rgba(0, 255, 136, 0.7)';
  label.style.whiteSpace = 'nowrap';
  container.appendChild(label);

  return container;
}

function getGlyphLabel(glyph: DetectedGlyph): string {
  let label = glyph.type.replace('_', ' ').toUpperCase();
  if (glyph.type === 'circle' && glyph.variant) {
    label += ` (${glyph.variant.replace('_', ' ').toUpperCase()})`;
  }
  label += ` - ${glyph.hand.toUpperCase()}`;
  return label;
}

// Update glyph displays for currently detected gestures
function updateGlyphDisplays(
  handLandmarks: NormalizedLandmark[][],
  handedness: { index: number; score: number; label: 'Right' | 'Left' }[],
  canvasWidth: number,
  canvasHeight: number
): void {
  // Clear previous glyph elements
  glyphElements.forEach(({ element }) => {
    if (element.parentNode) element.parentNode.removeChild(element);
  });
  glyphElements.length = 0;

  if (handLandmarks.length === 0) return;

  // Detect gestures for all hands
  const gestures = detectGestures(handLandmarks, handedness);

  // Create glyph elements for each detected gesture
  gestures.forEach((gesture, idx) => {
    const el = createGlyphElement(gesture, idx, canvasWidth, canvasHeight);
    glyphContainer.appendChild(el);
    glyphElements.push({ element: el, handIndex: idx });
  });
}

// Update debug overlay with gesture check results
function updateDebugOverlay(landmarks: NormalizedLandmark[] | null): void {
  if (!debugVisible) return;

  if (!landmarks) {
    debugOverlay.innerHTML = '<div>No hand detected</div>';
    return;
  }

  const checks = runAllChecks(landmarks);
  const gesture = detectGesture(landmarks, { label: 'Right', score: 1, index: 0 }); // handedness not critical for debug

  let html = `<div style="margin-bottom:8px;font-weight:bold;color:#4fc3f7;">Detected: ${gesture.type}${gesture.variant ? ` + ${gesture.variant}` : ''}</div>`;
  html += `<div style="margin-bottom:8px;font-size:11px;color:#aaa;">Confidence: ${(gesture.confidence * 100).toFixed(0)}%</div>`;
  html += '<div style="margin-bottom:4px;font-size:11px;color:#aaa;">Checks:</div>';

  for (const check of checks) {
    const color = check.passed ? '#4caf50' : '#f44336';
    html += `<div style="padding:2px 0;display:flex;justify-content:space-between;">
      <span>${check.name}</span>
      <span style="color:${color}">${check.passed ? '✓' : '✗'}</span>
    </div>`;
  }

  debugOverlay.innerHTML = html;
}

// Process holistic detection results
function processResults(result: HolisticLandmarkerResult): void {
  // Compute video display dimensions with object-fit: contain
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

  // Resize canvas to match container
  canvasElement.width = containerWidth;
  canvasElement.height = containerHeight;
  canvasElement.style.width = `${containerWidth}px`;
  canvasElement.style.height = `${containerHeight}px`;

  // Store scaling factors for landmark drawing
  window.videoDisplay = {
    width: displayWidth,
    height: displayHeight,
    offsetX,
    offsetY,
    scaleX: displayWidth / videoElement.videoWidth,
    scaleY: displayHeight / videoElement.videoHeight
  };

  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // 1. Draw face (key contours)
  if (result.faceLandmarks && result.faceLandmarks.length > 0) {
    for (const face of result.faceLandmarks) {
      drawConnections(face, FACE_OVAL_CONNECTIONS, FACE_COLOR);
      drawConnections(face, FACE_LIPS_CONNECTIONS, FACE_COLOR);
      drawConnections(face, FACE_LEFT_EYE_CONNECTIONS, FACE_COLOR);
      drawConnections(face, FACE_RIGHT_EYE_CONNECTIONS, FACE_COLOR);
      drawConnections(face, FACE_LEFT_EYEBROW_CONNECTIONS, FACE_COLOR);
      drawConnections(face, FACE_RIGHT_EYEBROW_CONNECTIONS, FACE_COLOR);
    }
  }

  // 2. Draw pose skeleton
  if (result.poseLandmarks && result.poseLandmarks.length > 0) {
    for (const pose of result.poseLandmarks) {
      drawSkeleton(pose, POSE_CONNECTIONS, POSE_COLOR);
    }
  }

  // 3. Draw hands (combine left and right)
  const allHandLandmarks: NormalizedLandmark[][] = [];
  const allHandedness: { index: number; score: number; label: 'Right' | 'Left' }[] = [];

  if (result.leftHandLandmarks) {
    result.leftHandLandmarks.forEach(landmarks => {
      allHandLandmarks.push(landmarks);
      allHandedness.push({
        index: allHandLandmarks.length - 1,
        score: 0.9,
        label: 'Left'
      });
    });
  }

  if (result.rightHandLandmarks) {
    result.rightHandLandmarks.forEach(landmarks => {
      allHandLandmarks.push(landmarks);
      allHandedness.push({
        index: allHandLandmarks.length - 1,
        score: 0.9,
        label: 'Right'
      });
    });
  }

  // Draw each hand with a distinct color
  allHandLandmarks.forEach((landmarks, idx) => {
    const color = HAND_COLORS[idx % HAND_COLORS.length];
    drawSkeleton(landmarks, HAND_CONNECTIONS, color);
  });

  // Update status and glyph displays
  if (allHandLandmarks.length > 0) {
    statusElement.textContent = `Detected ${allHandLandmarks.length} hand(s)`;
    updateGlyphDisplays(
      allHandLandmarks,
      allHandedness,
      window.videoDisplay.width,
      window.videoDisplay.height
    );
    updateDebugOverlay(allHandLandmarks[0]);
  } else {
    statusElement.textContent = 'No hands detected. Show your hands to the camera.';
    // Clear glyphs
    glyphElements.forEach(({ element }) => {
      if (element.parentNode) element.parentNode.removeChild(element);
    });
    glyphElements.length = 0;
    updateDebugOverlay(null);
  }
}

// Frame processing loop
function processFrame(): void {
  if (!holistic || videoElement.readyState !== 4) {
    requestAnimationFrame(processFrame);
    return;
  }

  try {
    const timestamp = performance.now();
    const result = holistic.detectForVideo(videoElement, timestamp);
    processResults(result);
  } catch (error) {
    console.error('Error processing frame:', error);
  }

  requestAnimationFrame(processFrame);
}

// Initialize camera
async function initializeCamera(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
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

// Main initialization
async function init(): Promise<void> {
  // Initialize camera first
  const cameraReady = await initializeCamera();
  if (!cameraReady) return;

  // Initialize holistic landmarker
  try {
    statusElement.textContent = 'Loading detection models...';

    const wasmFileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    );

    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task';

    // Try GPU delegate first, fall back to CPU for mobile compatibility
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

    statusElement.textContent = 'Detection ready! Show your hands, face, and pose.';
    infoElement.textContent = 'Hand/Face/Pose Detection with MediaPipe Tasks Vision | Glyph Recognition Active';
    processFrame();
  } catch (error) {
    console.error('Error initializing detection:', error);
    statusElement.textContent = 'Error: Could not load detection models. Make sure your browser supports WebAssembly.';
    return;
  }
}

// Cleanup
async function cleanup(): Promise<void> {
  if (holistic) {
    await holistic.close();
  }
  if (videoElement.srcObject) {
    const stream = videoElement.srcObject as MediaStream;
    stream.getTracks().forEach(track => track.stop());
  }
}

window.addEventListener('beforeunload', () => cleanup().catch(console.error));
window.addEventListener('resize', () => {
  glyphContainer.style.width = `${window.innerWidth}px`;
  glyphContainer.style.height = `${window.innerHeight}px`;
});
// Set initial glyph container size
glyphContainer.style.width = `${window.innerWidth}px`;
glyphContainer.style.height = `${window.innerHeight}px`;

// Start the application
init().catch(console.error);

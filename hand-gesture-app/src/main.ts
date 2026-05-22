/**
 * Hand Gesture Detection with MediaPipe Hands and Glyph Recognition
 * Detects hand gestures from camera input, draws skeleton wireframe overlay,
 * and displays recognized glyph symbols next to each hand.
 * 
 * Note: MediaPipe Hands is loaded via CDN script tag in index.html
 * The Hands class and HAND_CONNECTIONS are available as globals
 */

// Import gesture detection module
import { 
  detectGestures, 
  generateGlyphSVG 
} from './gestures';

import type { 
  GlyphType,
  CircleVariant,
  DetectedGlyph 
} from './gestures';

// Declare the global Hands class and HAND_CONNECTIONS from MediaPipe
interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface Handedness {
  index: number;
  score: number;
  label: 'Right' | 'Left';
}

interface Results {
  multiHandLandmarks: NormalizedLandmark[][];
  multiHandWorldLandmarks: any[][];
  multiHandedness: Handedness[];
  image: HTMLCanvasElement | HTMLImageElement | ImageBitmap;
}

interface HandsInterface {
  close(): Promise<void>;
  onResults(listener: (results: Results) => void): void;
  initialize(): Promise<void>;
  reset(): void;
  send(inputs: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
  setOptions(options: {
    maxNumHands?: number;
    modelComplexity?: 0 | 1;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
    selfieMode?: boolean;
  }): void;
}

// Extend Window interface to include MediaPipe Hands
declare global {
  interface Window {
    Hands: new (config?: { locateFile?: (path: string, prefix?: string) => string }) => HandsInterface;
    HAND_CONNECTIONS: [number, number][];
    VERSION: string;
  }
}

// DOM Elements
const videoElement = document.getElementById('video') as HTMLVideoElement;
const canvasElement = document.getElementById('canvas') as HTMLCanvasElement;
const statusElement = document.getElementById('status') as HTMLElement;
const infoElement = document.getElementById('info') as HTMLElement;

// Create a container for glyph overlays
const glyphContainer = document.createElement('div');
glyphContainer.id = 'glyph-container';
glyphContainer.style.position = 'absolute';
glyphContainer.style.top = '0';
glyphContainer.style.left = '0';
glyphContainer.style.width = '100%';
glyphContainer.style.height = '100%';
glyphContainer.style.pointerEvents = 'none';
glyphContainer.style.zIndex = '10';

// Add glyph container to video container
const videoContainer = document.getElementById('video-container');
videoContainer?.appendChild(glyphContainer);

// Canvas context
const canvasCtx = canvasElement.getContext('2d')!;

// Hand detection instance
let hands: HandsInterface | null = null;

// Store glyph elements for cleanup
const glyphElements: { element: HTMLElement; handIndex: number }[] = [];

// Default hand connections (fallback in case global not loaded)
const DEFAULT_HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

// Colors for different hands
const HAND_COLORS = ['#00FF88', '#FF6B6B', '#4ECDC4', '#FFE66D'];
const POINT_COLOR = '#FFFFFF';
const POINT_RADIUS = 3;
const LINE_WIDTH = 2;

// Glyph display settings
const GLYPH_SIZE = 80;
const GLYPH_OFFSET_X = 100; // Distance from hand to glyph
const GLYPH_OFFSET_Y = -50; // Vertical offset from hand center

/**
 * Wait for MediaPipe Hands library to be loaded
 */
function waitForHands(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.Hands && window.HAND_CONNECTIONS) {
      resolve();
      return;
    }

    // Maximum wait time: 30 seconds
    const startTime = Date.now();
    const maxWait = 30000;

    const check = () => {
      if (window.Hands && window.HAND_CONNECTIONS) {
        resolve();
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > maxWait) {
        reject(new Error('MediaPipe Hands library failed to load within 30 seconds'));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

/**
 * Initialize the camera stream
 */
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
    statusElement.textContent = 'Camera ready. Loading hand detection...';
    
    // Wait for video to start playing
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = resolve;
    });
    
    return true;
  } catch (error) {
    console.error('Error accessing camera:', error);
    statusElement.textContent = 'Error: Could not access camera. Please check permissions.';
    return false;
  }
}

/**
 * Draw a single hand's landmarks and connections
 */
function drawHand(landmarks: NormalizedLandmark[], color: string, connections: [number, number][]): void {
  if (!landmarks || landmarks.length === 0) return;

  // Draw connections
  connections.forEach(([start, end]) => {
    const startLandmark = landmarks[start];
    const endLandmark = landmarks[end];
    
    if (startLandmark && endLandmark) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(startLandmark.x * canvasElement.width, startLandmark.y * canvasElement.height);
      canvasCtx.lineTo(endLandmark.x * canvasElement.width, endLandmark.y * canvasElement.height);
      canvasCtx.strokeStyle = color;
      canvasCtx.lineWidth = LINE_WIDTH;
      canvasCtx.stroke();
    }
  });

  // Draw landmarks (points)
  landmarks.forEach((landmark) => {
    canvasCtx.beginPath();
    canvasCtx.arc(
      landmark.x * canvasElement.width,
      landmark.y * canvasElement.height,
      POINT_RADIUS,
      0,
      2 * Math.PI
    );
    canvasCtx.fillStyle = POINT_COLOR;
    canvasCtx.fill();
  });
}

/**
 * Calculate the center position of a hand from its landmarks
 */
function getHandCenter(landmarks: NormalizedLandmark[]): { x: number; y: number } {
  // Use palm landmarks for center calculation
  const palmLandmarks = landmarks.slice(0, 9); // Wrist + thumb base + finger bases
  let sumX = 0, sumY = 0;
  
  palmLandmarks.forEach(l => {
    sumX += l.x;
    sumY += l.y;
  });
  
  return {
    x: sumX / palmLandmarks.length,
    y: sumY / palmLandmarks.length
  };
}

/**
 * Create and position a glyph SVG element
 */
function createGlyphElement(glyph: DetectedGlyph, handIndex: number, canvasWidth: number, canvasHeight: number): HTMLElement {
  const center = getHandCenter(glyph.landmarks);
  
  // Calculate glyph position (right of the hand for left hand, left for right hand)
  const isRightHand = glyph.hand === 'right';
  const xPos = (center.x * canvasWidth) + (isRightHand ? -GLYPH_OFFSET_X : GLYPH_OFFSET_X);
  const yPos = (center.y * canvasHeight) + GLYPH_OFFSET_Y;
  
  // Create container div
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = `${xPos}px`;
  container.style.top = `${yPos}px`;
  container.style.transform = 'translate(-50%, -50%)';
  container.style.zIndex = '10';
  container.style.pointerEvents = 'none';
  container.dataset.handIndex = handIndex.toString();
  container.dataset.hand = glyph.hand;
  
  // Create SVG element
  const svg = generateGlyphSVG(glyph.type, glyph.variant as CircleVariant);
  container.innerHTML = svg.svg;
  
  // Style the SVG
  const svgElement = container.querySelector('svg');
  if (svgElement) {
    svgElement.style.width = `${GLYPH_SIZE}px`;
    svgElement.style.height = `${GLYPH_SIZE}px`;
    svgElement.style.filter = 'drop-shadow(0 0 8px rgba(0, 255, 136, 0.7))';
  }
  
  // Add glyph name label
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

/**
 * Get display label for a glyph
 */
function getGlyphLabel(glyph: DetectedGlyph): string {
  let label = glyph.type.replace('_', ' ').toUpperCase();
  
  // Add variant info for circle
  if (glyph.type === 'circle' && glyph.variant) {
    label += ` (${glyph.variant.replace('_', ' ').toUpperCase()})`;
  }
  
  // Add hand info
  label += ` - ${glyph.hand.toUpperCase()}`;
  
  return label;
}

/**
 * Update or create glyph display for detected gestures
 */
function updateGlyphDisplays(
  results: Results,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Clear previous glyph elements
  glyphElements.forEach(({ element }) => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });
  glyphElements.length = 0;

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    return;
  }

  const connections = window.HAND_CONNECTIONS || DEFAULT_HAND_CONNECTIONS;

  // Detect gestures for all hands
  const gestures = detectGestures(
    results.multiHandLandmarks,
    results.multiHandedness
  );

  // Create glyph elements for each detected gesture
  gestures.forEach((gesture, handIndex) => {
    const element = createGlyphElement(
      gesture,
      handIndex,
      canvasWidth,
      canvasHeight
    );
    glyphContainer.appendChild(element);
    glyphElements.push({ element, handIndex });
  });
}

/**
 * Handle hand detection results
 */
function onResults(results: Results): void {
  // Resize canvas to match video
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;

  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const connections = window.HAND_CONNECTIONS || DEFAULT_HAND_CONNECTIONS;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    statusElement.textContent = `Detected ${results.multiHandLandmarks.length} hand(s)`;
    
    // Draw each detected hand
    results.multiHandLandmarks.forEach((landmarks, handIndex) => {
      const color = HAND_COLORS[handIndex % HAND_COLORS.length];
      drawHand(landmarks, color, connections);
    });
    
    // Update glyph displays
    updateGlyphDisplays(results, canvasElement.width, canvasElement.height);
  } else {
    statusElement.textContent = 'No hands detected. Show your hands to the camera.';
    
    // Clear glyph displays
    glyphElements.forEach(({ element }) => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    glyphElements.length = 0;
  }
}

/**
 * Process video frame and detect hands
 */
async function processFrame(): Promise<void> {
  if (!hands || videoElement.readyState !== 4) {
    requestAnimationFrame(processFrame);
    return;
  }

  try {
    await hands.send({ image: videoElement });
  } catch (error) {
    console.error('Error processing frame:', error);
  }

  requestAnimationFrame(processFrame);
}

/**
 * Initialize the application
 */
async function init(): Promise<void> {
  // Wait for MediaPipe Hands to load
  try {
    statusElement.textContent = 'Waiting for MediaPipe Hands library to load...';
    await waitForHands();
    statusElement.textContent = 'Library loaded. Initializing camera...';
  } catch (error) {
    console.error('Error:', error);
    statusElement.textContent = 'Error: MediaPipe Hands library failed to load';
    return;
  }

  // Check if Hands is available
  if (typeof window.Hands !== 'function') {
    statusElement.textContent = 'Error: MediaPipe Hands library not loaded';
    console.error('MediaPipe Hands library not loaded. Check CDN script in index.html');
    return;
  }

  // Initialize camera
  const cameraReady = await initializeCamera();
  if (!cameraReady) {
    return;
  }

  // Initialize hands detection
  try {
    statusElement.textContent = 'Initializing hand detection model...';
    
    hands = new window.Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
      }
    });
    
    // Set options
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: true
    });
    
    // Register results listener
    hands.onResults(onResults);
    
    // Initialize the hands detector
    await hands.initialize();
    
    statusElement.textContent = 'Hand detection ready! Show your hands to the camera.';
    infoElement.textContent = 'Hand Gesture Detection with MediaPipe Hands | Glyph Recognition Active';
  } catch (error) {
    console.error('Error initializing hands:', error);
    statusElement.textContent = 'Error loading hand detection model. Check console.';
    return;
  }

  // Start processing frames
  processFrame();
}

/**
 * Clean up resources
 */
async function cleanup(): Promise<void> {
  if (hands) {
    await hands.close();
  }
  if (videoElement.srcObject) {
    const stream = videoElement.srcObject as MediaStream;
    stream.getTracks().forEach(track => track.stop());
  }
}

// Handle window unload
window.addEventListener('beforeunload', () => {
  cleanup().catch(console.error);
});

// Handle window resize
window.addEventListener('resize', () => {
  // Update glyph container size
  glyphContainer.style.width = `${window.innerWidth}px`;
  glyphContainer.style.height = `${window.innerHeight}px`;
});

// Initialize glyph container size
glyphContainer.style.width = `${window.innerWidth}px`;
glyphContainer.style.height = `${window.innerHeight}px`;

// Start the application
init().catch(console.error);

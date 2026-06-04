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

import { FilesetResolver, HolisticLandmarker } from '@mediapipe/tasks-vision'
import type { HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  detectGesture, runAllChecks, detectExpression,
  GestureDebouncer, TapDetector,
  FingerIndices
} from './gestures'
import type { NormalizedLandmark, GlyphType } from './gestures'
import { MeshOverlay } from './render/meshOverlay'
import type { ProjectedPoint, EntitySpec } from './render/meshOverlay'
import { GlyphOverlay } from './render/glyphOverlay'
import { GestureHoldTracker } from './render/gestureHold'
import { EffectsRenderer } from './render/effectsRenderer'
import { GridOverlay } from './render/gridOverlay'
import { SmoothedTransform, ZERO_TRANSFORM } from './render/smoothing'
import type { TransformChannels } from './render/smoothing'
import { LockController } from './state/lockController'
import { MidiRouter } from './midi/midiRouter'
import { MappingEngine } from './midi/mappingEngine'
import { loadMapping, saveMapping, resetMapping } from './midi/mapping'
import type { MappingConfig } from './midi/mapping'
import { Drawer } from './ui/drawer'


declare global {
  interface Window {
    videoDisplay: {
      width:   number;
      height:  number;
      offsetX: number;
      offsetY: number;
      scaleX:  number;
      scaleY:  number;
    };
  }
}

// DOM
const videoElement   = document.getElementById('video') as HTMLVideoElement
const statusElement  = document.getElementById('status') as HTMLElement
const infoElement    = document.getElementById('info') as HTMLElement
const videoContainer = document.getElementById('video-container') as HTMLElement

const legacyCanvas = document.getElementById('canvas') as HTMLCanvasElement | null
if (legacyCanvas)
  legacyCanvas.style.display = 'none'

const MIRROR = true

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

const glyphContainer = document.createElement('div')
glyphContainer.id    = 'glyph-container'
Object.assign(glyphContainer.style, {
  position:      'absolute',
  top:           '0',
  left:          '0',
  width:         '100%',
  height:        '100%',
  pointerEvents: 'none',
  zIndex:        '10',
} as CSSStyleDeclaration)
videoContainer.appendChild(glyphContainer)

const meshOverlay     = new MeshOverlay(videoContainer)
const glyphOverlay    = new GlyphOverlay(glyphContainer)
const holdTracker     = new GestureHoldTracker()
const effectsRenderer = new EffectsRenderer(videoContainer)
const gridOverlay     = new GridOverlay(videoContainer)

// Per-hand state (lazy-initialised by hand id)
const debouncers   = new Map<string, GestureDebouncer>()
const tapDetectors = new Map<string, TapDetector>()

// ---------------------------------------------------------------------------
// Performance / control hand split, lock, smoothing & MIDI
// ---------------------------------------------------------------------------
const PERF_ID    = 'hand-perf'
const CTRL_ID    = 'hand-ctrl'
const PERF_COLOR = '#00FF88'
const CTRL_COLOR = '#7a7aa0'
const LOCK_COLOR = '#448AFF'

const controlDebouncer = new GestureDebouncer()
const lockController   = new LockController()
const perfSmoother     = new SmoothedTransform()

let swapHands                = false
let lockedGesture: GlyphType = 'unknown'
let lastFrameMs              = performance.now()

const midiRouter = new MidiRouter()
let mappingConfig: MappingConfig = loadMapping()
const mappingEngine = new MappingEngine(midiRouter, mappingConfig)

const drawer = new Drawer({
  router:  midiRouter,
  mapping: {
    getMapping: () => mappingConfig,
    onChange:   c => {
      mappingConfig = c; saveMapping(c); mappingEngine.setConfig(c)
    },
    onReset: () => {
      mappingConfig = resetMapping(); mappingEngine.setConfig(mappingConfig); return mappingConfig
    },
  },
  getSwapHands: () => swapHands,
  setSwapHands: v => {
    swapHands = v
  },
  onPanic: () => mappingEngine.panic(),
})
midiRouter.onLog(e => drawer.push(e))
midiRouter.enable().then(ok => drawer.setEnabled(ok))
  .catch(() => drawer.setEnabled(false))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** '#RRGGBB' or '#RGB' → [r, g, b] normalised 0-1 */
function hexToRgb (hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  const n = c.length === 3
    ? parseInt(c.split('').map(x => x + x)
      .join(''), 16)
    : parseInt(c, 16)
  return [ (n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255 ]
}

// ---------------------------------------------------------------------------
// Holistic instance
// ---------------------------------------------------------------------------
let holistic: HolisticLandmarker | null = null

// ---------------------------------------------------------------------------
// Debug overlay (press D)
// ---------------------------------------------------------------------------
let debugVisible = false
const debugOverlay         = document.createElement('div')
debugOverlay.id            = 'debug-overlay'
debugOverlay.style.cssText = `
  position:fixed;bottom:10px;right:10px;
  background:rgba(0,0,0,0.85);color:#fff;
  font-family:monospace;font-size:12px;
  padding:12px;border-radius:8px;z-index:1000;
  max-height:80vh;overflow-y:auto;display:none;
  min-width:200px;box-shadow:0 4px 12px rgba(0,0,0,0.5);
`
document.body.appendChild(debugOverlay)

const debugButton         = document.createElement('button')
debugButton.textContent   = 'Debug'
debugButton.style.cssText = `
  position:fixed;top:10px;right:10px;
  padding:8px 12px;background:rgba(60,60,60,0.9);
  color:#fff;border:none;border-radius:4px;
  cursor:pointer;z-index:1000;font-family:sans-serif;font-size:14px;
`
debugButton.addEventListener('click', toggleDebug)
document.body.appendChild(debugButton)
document.addEventListener('keydown', e => {
  if (e.key === 'd' || e.key === 'D')
    toggleDebug()
})

function toggleDebug (): void {
  debugVisible = !debugVisible
  debugOverlay.style.display = debugVisible ? 'block' : 'none'
  debugButton.textContent    = debugVisible ? 'Hide Debug' : 'Show Debug'
}

// ---------------------------------------------------------------------------
// Colours / connections
// ---------------------------------------------------------------------------
const FACE_COLOR       = '#4FC3F7'
const EXPRESSION_COLOR = '#4FC3F7'

type Connection = { start: number; end: number }
function toTupleArray (cs: readonly Connection[]): [number, number][] {
  return cs.map(c => [ c.start, c.end ])
}

const HAND_CONNECTIONS                     = toTupleArray(HolisticLandmarker.HAND_CONNECTIONS)
const FACE_CONNECTIONS: [number, number][] = [
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_FACE_OVAL),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LIPS),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYE),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYE),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
  ...toTupleArray(HolisticLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
]

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------
function project (lm: NormalizedLandmark): ProjectedPoint {
  const d  = window.videoDisplay
  const nx = MIRROR ? 1 - lm.x : lm.x
  return { x: d.offsetX + nx * d.width, y: d.offsetY + lm.y * d.height }
}
function projectAll (lms: NormalizedLandmark[]): ProjectedPoint[] {
  return lms.map(project)
}
type CentreOfReturnType = { x: number; y: number }

function centreOf (pts: ProjectedPoint[]): CentreOfReturnType {
  let x = 0,
    y   = 0
  for (const p of pts) {
    x += p.x; y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

// ---------------------------------------------------------------------------
// Debug overlay
// ---------------------------------------------------------------------------
function updateDebugOverlay (landmarks: NormalizedLandmark[] | null): void {
  if (!debugVisible)
    return
  if (!landmarks) {
    debugOverlay.innerHTML = '<div>No hand detected</div>'; return
  }

  const checks  = runAllChecks(landmarks)
  const gesture = detectGesture(landmarks, { label: 'Right', score: 1, index: 0 }, MIRROR)
  const subTxt  = gesture.subLabel ? ` [${gesture.subLabel}]` : ''
  let html = `<div style="margin-bottom:8px;font-weight:bold;color:#4fc3f7;">Detected: ${gesture.type}${subTxt}</div>`
  html += `<div style="margin-bottom:8px;font-size:11px;color:#aaa;">Confidence: ${(gesture.confidence * 100).toFixed(0)}%</div>`
  html += '<div style="margin-bottom:4px;font-size:11px;color:#aaa;">Checks:</div>'
  for (const check of checks) {
    const col = check.passed ? '#4caf50' : '#f44336'
    html += `<div style="padding:2px 0;display:flex;justify-content:space-between;">
      <span>${check.name}</span><span style="color:${col}">${check.passed ? '✓' : '✗'}</span>
    </div>`
  }
  debugOverlay.innerHTML = html
}

// ---------------------------------------------------------------------------
// Per-frame processing
// ---------------------------------------------------------------------------
function processResults (result: HolisticLandmarkerResult): void {
  const videoAR = videoElement.videoWidth / videoElement.videoHeight
  const cW      = videoElement.clientWidth
  const cH      = videoElement.clientHeight
  let dW: number,
    dH: number,
    oX = 0,
    oY = 0
  if (cW / cH > videoAR) {
    dH = cH; dW = cH * videoAR; oX = (cW - dW) / 2
  }
  else {
    dW = cW; dH = cW / videoAR; oY = (cH - dH) / 2
  }
  window.videoDisplay = { width: dW, height: dH, offsetX: oX, offsetY: oY, scaleX: dW / videoElement.videoWidth, scaleY: dH / videoElement.videoHeight }

  meshOverlay.setViewport(cW, cH)
  meshOverlay.markAllAbsent()
  glyphOverlay.markAllAbsent()

  // ── Face ─────────────────────────────────────────────────────────────────
  if (result.faceLandmarks?.length > 0) {
    const face                 = result.faceLandmarks[0]
    const faceSpec: EntitySpec = {
      id:          'face',
      connections: FACE_CONNECTIONS,
      color:       FACE_COLOR,
      lineWidth:   1.5,
      drawPoints:  false,
    }
    meshOverlay.update(faceSpec, projectAll(face))

    const expr     = detectExpression(face)
    const forehead = project(face[10] ?? face[0])
    glyphOverlay.update({
      id:          'face-expr',
      x:           forehead.x,
      y:           forehead.y - 90,
      symbol:      expr.type,
      label:       expr.type.toUpperCase(),
      color:       EXPRESSION_COLOR,
      delta:       null,
      decorations: false,
    })
  }

  // ── Hands: right = performance, left = control (lock) ──────────────────────
  const nowMs = performance.now()
  const dt    = Math.min(0.1, Math.max(0.0001, (nowMs - lastFrameMs) / 1000))
  lastFrameMs = nowMs

  const leftLm  = result.leftHandLandmarks?.[0] ?? null
  const rightLm = result.rightHandLandmarks?.[0] ?? null
  const perfLm  = swapHands ? leftLm : rightLm
  const ctrlLm  = swapHands ? rightLm : leftLm

  // ── Control hand → lock state ──────────────────────────────────────────────
  let controlGesture: GlyphType | null = null
  if (ctrlLm) {
    const ctrlProjected = projectAll(ctrlLm)
    meshOverlay.update({
      id:          CTRL_ID,
      connections: HAND_CONNECTIONS,
      color:       CTRL_COLOR,
      lineWidth:   1.5,
      pointRadius: 2,
      drawPoints:  true,
    }, ctrlProjected)

    const rawCtrl = detectGesture(ctrlLm, { label: swapHands ? 'Right' : 'Left', score: 0.9, index: 0 }, MIRROR)
    controlGesture = controlDebouncer.update(rawCtrl.type)

    const cc = centreOf(ctrlProjected)
    let cMinY = Infinity
    for (const p of ctrlProjected)
      cMinY = Math.min(cMinY, p.y)
    glyphOverlay.update({
      id:          CTRL_ID,
      x:           cc.x,
      y:           cMinY - 50,
      symbol:      controlGesture,
      label:       lockController.isLocked ? 'LOCK' : 'FREE',
      color:       CTRL_COLOR,
      delta:       null,
      decorations: false,
    })
  }
  else
    controlDebouncer.reset()

  const lock = lockController.update(controlGesture)

  // ── Performance hand → gesture + transform + MIDI ──────────────────────────
  if (perfLm) {
    if (!debouncers.has(PERF_ID))
      debouncers.set(PERF_ID, new GestureDebouncer())
    if (!tapDetectors.has(PERF_ID))
      tapDetectors.set(PERF_ID, new TapDetector())

    const debouncer = debouncers.get(PERF_ID)!
    const tapDet    = tapDetectors.get(PERF_ID)!

    const rawGlyph = detectGesture(perfLm, { label: swapHands ? 'Left' : 'Right', score: 0.9, index: 0 }, MIRROR)

    // While LOCKED the gesture identity is frozen; keep feeding the debouncer so
    // it stays warm but force the held gesture so it cannot de-toggle.
    let stableType: GlyphType
    if (lock.locked && lockedGesture !== 'unknown') {
      debouncer.update(rawGlyph.type)
      stableType = lockedGesture
    }
    else {
      stableType = debouncer.update(rawGlyph.type)
      if (stableType !== 'unknown')
        lockedGesture = stableType
    }

    // Hold delta → smoothed transform (single source of truth for grid + MIDI).
    const delta                   = holdTracker.update(PERF_ID, stableType, perfLm, MIRROR)
    const rawT: TransformChannels = delta
      ? { tx: delta.dx, ty: delta.dy, tz: delta.dz, pitch: delta.dPitch, yaw: delta.dYaw, roll: delta.dRoll }
      : ZERO_TRANSFORM
    const t = perfSmoother.update(rawT, dt)

    const projected = projectAll(perfLm)
    const c         = centreOf(projected)

    // Tap → ripple
    if (tapDet.update(perfLm, stableType)) {
      const tipPx = project(perfLm[FingerIndices.index.tip])
      effectsRenderer.spawnRipple(tipPx.x, tipPx.y, hexToRgb(PERF_COLOR))
    }

    // Bloom flare driven by the smoothed transform
    if (delta && stableType !== 'unknown')
      effectsRenderer.updateFlare(PERF_ID, c.x, c.y, hexToRgb(lock.locked ? LOCK_COLOR : PERF_COLOR), t.tx, t.ty, t.tz, t.roll); else
      effectsRenderer.removeFlare(PERF_ID)

    // Mesh (bright; blue while locked)
    meshOverlay.update({
      id:          PERF_ID,
      connections: HAND_CONNECTIONS,
      color:       lock.locked ? LOCK_COLOR : PERF_COLOR,
      lineWidth:   2,
      pointRadius: 3,
      drawPoints:  true,
    }, projected)

    // 3D grid HUD (performance hand only)
    gridOverlay.update({
      cx:     c.x,
      cy:     c.y,
      tx:     t.tx,
      ty:     t.ty,
      tz:     t.tz,
      pitch:  t.pitch,
      yaw:    t.yaw,
      roll:   t.roll,
      color:  PERF_COLOR,
      locked: lock.locked,
    })

    // Glyph badge
    let minY = Infinity
    for (const p of projected)
      minY = Math.min(minY, p.y)

    const tag = lock.locked ? 'LOCK · ' : ''
    glyphOverlay.update({
      id:       PERF_ID,
      x:        c.x,
      y:        minY - 70,
      symbol:   stableType,
      label:    stableType === 'unknown' ? `${tag}UNKNOWN` : `${tag}${stableType.toUpperCase()}`,
      subLabel: rawGlyph.subLabel,
      color:    lock.locked ? LOCK_COLOR : PERF_COLOR,
      delta,
    })

    // MIDI
    const activeGesture: GlyphType | null = stableType === 'unknown' ? null : stableType
    mappingEngine.tick(activeGesture, t, rawGlyph.confidence, nowMs)
  }
  else {
    gridOverlay.markAbsent()
    effectsRenderer.removeFlare(PERF_ID)
    perfSmoother.reset()
    mappingEngine.tick(null, perfSmoother.value, 0, nowMs)
  }

  // Status + debug
  const handCount = (perfLm ? 1 : 0) + (ctrlLm ? 1 : 0)
  if (handCount > 0) {
    statusElement.textContent = `${lock.locked ? 'LOCKED · ' : ''}perf:${perfLm ? 'yes' : '—'}  ctrl:${ctrlLm ? 'yes' : '—'}`
    updateDebugOverlay(perfLm ?? ctrlLm)
  }
  else {
    statusElement.textContent = 'No hands detected. Right hand performs · left fist locks · left palm unlocks.'
    updateDebugOverlay(null)
  }

  meshOverlay.render()
  glyphOverlay.render()
  gridOverlay.render()
  effectsRenderer.render()
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
function processFrame (): void {
  if (!holistic || videoElement.readyState !== 4) {
    requestAnimationFrame(processFrame)
    return
  }
  try {
    processResults(holistic.detectForVideo(videoElement, performance.now()))
  }
  catch (err) {
    console.error('Error processing frame:', err)
  }
  requestAnimationFrame(processFrame)
}

// ---------------------------------------------------------------------------
// Camera + init
// ---------------------------------------------------------------------------
async function initializeCamera (): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }},
      audio: false,
    })
    videoElement.srcObject    = stream
    statusElement.textContent = 'Camera ready. Loading detection models...'
    await new Promise(resolve => {
      videoElement.onloadedmetadata = resolve
    })
    return true
  }
  catch (err) {
    console.error('Error accessing camera:', err)
    statusElement.textContent = 'Error: Could not access camera. Please check permissions.'
    return false
  }
}

async function init (): Promise<void> {
  const cameraReady = await initializeCamera()
  if (!cameraReady)
    return

  try {
    statusElement.textContent = 'Loading detection models...'

    const wasmFileset         = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
    )
    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task'

    try {
      holistic = await HolisticLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
      })
    }
    catch {
      statusElement.textContent = 'GPU not available, falling back to CPU...'
      holistic = await HolisticLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
      })
    }

    statusElement.textContent = 'Detection ready! Show your hands and face.'
    infoElement.textContent   = 'Right hand performs (palm·fist·circle·V·dash) · LEFT FIST locks / LEFT PALM unlocks · press M for MIDI drawer'
    processFrame()
  }
  catch (err) {
    console.error('Error initializing:', err)
    statusElement.textContent = 'Error: Could not load detection models.'
  }
}

async function cleanup (): Promise<void> {
  mappingEngine.panic()
  if (holistic)
    await holistic.close()
  if (videoElement.srcObject)
    (videoElement.srcObject as MediaStream).getTracks().forEach(t => t.stop())
}

window.addEventListener('beforeunload', () => cleanup().catch(console.error))
init().catch(console.error)

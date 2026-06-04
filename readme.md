# Gesture Music

Turn your hands into a MIDI instrument. A webcam tracks both hands with MediaPipe
**Holistic**; your **right** hand performs (its gesture, position and rotation
drive the output) and your **left** hand is a modifier (fist = lock, open palm =
unlock). Gestures map to MIDI notes + continuous controllers and stream to a DAW
— either through a real virtual MIDI port (Electron) or the Web MIDI API (browser).

> Platform note: the true "appears in your DAW" virtual port path targets
> **macOS** (CoreMIDI). The browser path works anywhere Web MIDI does.

---

## Repository layout

```
gesture-music/
├── hand-gesture-app/      ← THE app: camera + gestures + 3D HUD + MIDI  (start here)
└── hand-midi-controller/  ← separate standalone MIDI test/dashboard app
```

Everything below refers to **`hand-gesture-app`** unless stated otherwise.

---

## Requirements

- **Node** ≥ 20 (developed on 26)
- **pnpm** ≥ 10 (`npm i -g pnpm`)
- A **webcam** + camera permission
- For the virtual MIDI device: **macOS** + the app run under **Electron**

---

## Quick start

### Option A — Browser (fastest)

```bash
cd hand-gesture-app
pnpm install
pnpm dev
```

Open the URL it prints (`http://localhost:3333/gesture-music/`) and allow the camera.

To reach a DAW from the browser you need a loopback MIDI port, because the Web MIDI
API can only *send to* existing ports — it can't create one:

1. Open **Audio MIDI Setup** → **Window ▸ Show MIDI Studio** → double-click **IAC Driver**
   → tick **Device is online** (add a bus if there are none).
2. In the app, press **`m`** to open the MIDI drawer → **Debug** tab → pick the **IAC bus** as the output.
3. In your DAW, select that same **IAC bus** as a MIDI **input**.

### Option B — Electron (real virtual device — recommended)

```bash
cd hand-gesture-app
pnpm install
pnpm electron:dev
```

This launches an Electron window and opens a CoreMIDI virtual port literally named
**"Gesture Music"**. In your DAW, just select **Gesture Music** as a MIDI **input** —
no IAC setup required. (Optionally mirror to a hardware port from the Debug tab.)

---

## How to play

| Hand | Role |
|------|------|
| **Right** | Performs. Its gesture picks the note; its movement & rotation modulate. |
| **Left — fist** | **Lock** — freezes the current gesture so it won't de-toggle; your right hand's position/rotation keep being followed. |
| **Left — open palm** | **Unlock** — gesture detection resumes. |

Performance gestures: **palm · fist · circle · V · dash**.
Tap (fist + index toward camera) fires a ripple effect.

Use the **`swap hands`** toggle in the drawer if your camera/setup makes left perform more natural.

### On-screen HUD around the right hand
- A pseudo-3D **grid** that pans/zooms with your X/Y/Z movement (the transposition differential).
- Three **gyroscope rings** — pitch (red), yaw (green), roll (blue) — that tilt/spin with hand rotation.
- A live numeric readout of all six differentials.

All HUD + MIDI values are **smoothed** (One-Euro filter + slew clamp + deadzone), so a
momentary mis-read never makes a value spike.

### Keyboard
- **`m`** — toggle the MIDI drawer
- **`d`** — toggle the gesture debug overlay

---

## MIDI mapping

Open the drawer (**`m`**) → **Mapping** tab. Per gesture you set a **base note**,
**channel**, and any number of **modulation routes**. Each route binds a **source**
to a **target** with input/output ranges:

- **Sources:** `Move X / Y / Z`, `Pitch`, `Yaw`, `Roll`, `Confidence`
- **Targets:** `Transpose` (semitones), `Velocity`, `CC #n`, `Pitch-bend`

`Transpose` and `Velocity` are sampled at **note-on**; `CC` and `Pitch-bend` stream
**continuously** while the gesture is held. Mappings auto-save to `localStorage`
(use **Reset to defaults** to start over).

The **Debug** tab shows every outgoing MIDI message live and lets you pick the output port.

---

## Scripts

Run inside `hand-gesture-app/`:

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Vite dev server (browser, Web MIDI) |
| `pnpm electron:dev` | Vite + Electron with the **Gesture Music** virtual port |
| `pnpm build` | Type-check + production build to `dist/` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm electron` | Run Electron against an existing `dist/` build |
| `pnpm rebuild` | Rebuild the native MIDI addon against Electron (fallback only) |

Lint (from the repo root): `pnpm lint`.

---

## Troubleshooting

- **`pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`** — pnpm 11 gates native build
  scripts. This repo already allowlists them in `hand-gesture-app/pnpm-workspace.yaml`
  (`allowBuilds`). If you hit it anyway, run `pnpm approve-builds` once.
- **No "Gesture Music" port in the DAW** — make sure you launched via `pnpm electron:dev`
  (the browser path can't create a port — use an IAC bus instead). Re-scan inputs in the DAW.
- **Native module won't load in Electron** — `@julusian/midi` ships N-API prebuilds and
  normally needs nothing, but as a fallback: `pnpm rebuild`.
- **Camera black / not allowed** — grant camera permission to the browser (or the Electron
  app under System Settings ▸ Privacy & Security ▸ Camera) and reload.
- **Notes feel jumpy or laggy** — tune `DEFAULT_TRANSLATION_CFG` / `DEFAULT_ROTATION_CFG`
  in `src/render/smoothing.ts` (lower `minCutoff`/higher `maxStep` = smoother; higher
  `beta` = snappier).

---

## Tech notes

- MediaPipe **HolisticLandmarker** (`@mediapipe/tasks-vision`), Vite + TypeScript.
- Rendering: layered SVG overlays (skeleton, glyph badges, 3D grid) + a WebGL2 effects pass.
- MIDI backend is chosen at runtime: **Electron virtual port** (`@julusian/midi`, via the
  `window.gestureMidi` preload bridge) when present, otherwise **Web MIDI**.
- The Electron shell is plain CommonJS (`electron/*.cjs`) so the native addon loads cleanly
  under the project's ESM (`"type": "module"`) setup.

> Production Electron packaging is not set up yet; `pnpm electron:dev` is the supported
> way to run the virtual device. (Packaging would need the Vite `base` set to `'./'`.)

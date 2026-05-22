/**
 * WebGL2 effects canvas.
 *
 * Rendering order each frame:
 *   1. Noise + vignette  (normal alpha blend)  – sits above the video
 *   2. Tap ripples        (additive blend)       – glowing expanding circles
 *   3. Held-gesture flares (additive blend)      – directional bloom streaks
 *
 * All passes share one fullscreen-quad VAO and the same vertex shader.
 * Attribute location 0 is pinned with layout(location=0) so a single VAO
 * works across all programs.
 */

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Pass 1 ─ animated grain + radial vignette
const NOISE_FRAG = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // Grain: block at half-res, tick at ~24 fps to look filmic
  float grain = hash(floor(gl_FragCoord.xy * 0.65) + floor(u_time * 24.0));

  // Radial vignette
  vec2 d    = uv - 0.5;
  float vgn = smoothstep(0.28, 0.92, length(d) * 1.85);

  float noiseA = grain * 0.10;
  float vgnA   = vgn * 0.60;

  // Combine: grain brightens slightly, vignette darkens
  fragColor = vec4(
    vec3(grain * 0.08),
    noiseA * 0.18 + vgnA * 0.82
  );
}
`;

// Pass 2 ─ tap ripple
const RIPPLE_FRAG = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform vec2  u_center;  // px, y from top
uniform float u_t;       // 0 → 1 lifetime progress
uniform vec3  u_color;
out vec4 fragColor;

void main() {
  // WebGL y=0 is bottom; screen y=0 is top
  vec2 pos = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 d   = pos - u_center;
  d.x     *= u_res.y / u_res.x;          // aspect-correct
  float dist = length(d) / u_res.y;

  float r    = u_t * 0.36;
  float ease = 1.0 - u_t * u_t;

  // Filled disc: fades out fast
  float fill  = smoothstep(r * 0.55, 0.0, dist) * max(0.0, 1.0 - u_t * 2.8) * 0.55;

  // Primary expanding ring
  float rw   = 0.003 + u_t * 0.009;
  float ring = smoothstep(rw, 0.0, abs(dist - r)) * ease * 1.3;

  // Soft bloom halo around the ring
  float sigma = 0.013;
  float bloom = exp(-0.5 * pow((dist - r) / sigma, 2.0)) * ease * 0.85;

  // Secondary smaller ripple chasing the first
  float r2    = u_t * 0.16;
  float ring2 = smoothstep(0.002, 0.0, abs(dist - r2)) * max(0.0, 1.0 - u_t * 3.5) * 0.45;

  float a = fill + ring + bloom + ring2;
  fragColor = vec4(u_color * a, a);
}
`;

// Pass 3 ─ held-gesture bloom flare
const FLARE_FRAG = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform vec2  u_center;
uniform float u_intensity;
uniform vec3  u_color;
uniform float u_angle;    // motion direction, radians
uniform float u_size;     // normalised radius (fraction of height)
uniform float u_time;
out vec4 fragColor;

void main() {
  vec2 pos = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 d   = (pos - u_center) / u_res.y;
  float dist = length(d);

  float sz = max(u_size, 0.012);

  // Soft radial glow core
  float core   = exp(-dist * 7.0 / sz) * u_intensity;

  // Broader corona
  float corona = exp(-dist * 3.0 / sz) * u_intensity * 0.35;

  // Directional streak along motion angle
  vec2  dir    = vec2(cos(u_angle), sin(u_angle));
  float along  = dist > 0.0015 ? dot(normalize(d), dir) : 0.0;
  float streak = pow(max(0.0, along), 9.0) * exp(-dist * 4.5 / sz) * u_intensity * 1.1;

  // Counter-streak (softer)
  float cstreak = pow(max(0.0, -along), 18.0) * exp(-dist * 7.0 / sz) * u_intensity * 0.25;

  // Pulsing airy rings
  float pulse  = sin(u_time * 5.0) * 0.5 + 0.5;
  float rings  = (sin(dist / sz * 28.0 - u_time * 4.0) * 0.5 + 0.5)
               * exp(-dist * 11.0 / sz) * u_intensity * 0.22 * pulse;

  float a = clamp(core + corona + streak + cstreak + rings, 0.0, 1.0);
  fragColor = vec4(u_color * a, a);
}
`;

// ---------------------------------------------------------------------------
// GL helpers
// ---------------------------------------------------------------------------

function makeShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile error');
  return s;
}

function makeProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, makeShader(gl, gl.VERTEX_SHADER,   vertSrc));
  gl.attachShader(p, makeShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'program link error');
  return p;
}

// Cache uniform locations for a program
function uniLocs(gl: WebGL2RenderingContext, prog: WebGLProgram, names: string[]): Record<string, WebGLUniformLocation | null> {
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ripple {
  x: number; y: number;
  color: [number, number, number];
  startTime: number;
  duration: number;
}

interface Flare {
  x: number; y: number;
  color: [number, number, number];
  intensity: number;
  angle: number;
  size: number;
}

const MAX_RIPPLES = 8;

// ---------------------------------------------------------------------------
// EffectsRenderer
// ---------------------------------------------------------------------------

export class EffectsRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;

  private noiseProg:  WebGLProgram;
  private rippleProg: WebGLProgram;
  private flareProg:  WebGLProgram;

  private noiseUni:  Record<string, WebGLUniformLocation | null>;
  private rippleUni: Record<string, WebGLUniformLocation | null>;
  private flareUni:  Record<string, WebGLUniformLocation | null>;

  private ripples: Ripple[] = [];
  private flares  = new Map<string, Flare>();
  private t0 = performance.now();

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position:      'absolute',
      top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none',
      zIndex:        '20',
    });
    container.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);

    this.noiseProg  = makeProgram(gl, VERT, NOISE_FRAG);
    this.rippleProg = makeProgram(gl, VERT, RIPPLE_FRAG);
    this.flareProg  = makeProgram(gl, VERT, FLARE_FRAG);

    this.noiseUni  = uniLocs(gl, this.noiseProg,  ['u_res', 'u_time']);
    this.rippleUni = uniLocs(gl, this.rippleProg, ['u_res', 'u_center', 'u_t', 'u_color']);
    this.flareUni  = uniLocs(gl, this.flareProg,  ['u_res', 'u_center', 'u_intensity', 'u_color', 'u_angle', 'u_size', 'u_time']);

    // Fullscreen quad (triangle strip, pinned at attribute location 0)
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  spawnRipple(x: number, y: number, color: [number, number, number], duration = 1500): void {
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x, y, color, startTime: performance.now(), duration });
  }

  updateFlare(
    id: string,
    x: number, y: number,
    color: [number, number, number],
    dx: number, dy: number, dz: number, dAngle: number
  ): void {
    const mag = Math.sqrt(dx * dx + dy * dy) * 7
              + Math.abs(dz) * 4
              + Math.abs(dAngle) / 180 * 0.5;
    const intensity = Math.min(mag * 0.55, 0.95);
    const angle = Math.atan2(dy, dx);
    const size  = 0.022 + intensity * 0.09;
    this.flares.set(id, { x, y, color, intensity: Math.max(intensity, 0.08), angle, size });
  }

  removeFlare(id: string): void { this.flares.delete(id); }

  render(): void {
    const gl  = this.gl;
    const now = performance.now();
    const t   = (now - this.t0) / 1000;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 1 || h < 1) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.vao);

    // ── Pass 1: noise + vignette (normal blending) ────────────────────────
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.noiseProg);
    gl.uniform2f(this.noiseUni['u_res']!,  w, h);
    gl.uniform1f(this.noiseUni['u_time']!, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 2: tap ripples (additive blending) ───────────────────────────
    this.ripples = this.ripples.filter(r => now - r.startTime < r.duration);
    if (this.ripples.length > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.rippleProg);
      gl.uniform2f(this.rippleUni['u_res']!, w, h);
      for (const r of this.ripples) {
        const progress = (now - r.startTime) / r.duration;
        gl.uniform2f(this.rippleUni['u_center']!, r.x, r.y);
        gl.uniform1f(this.rippleUni['u_t']!,      progress);
        gl.uniform3f(this.rippleUni['u_color']!,  r.color[0], r.color[1], r.color[2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    // ── Pass 3: bloom flares (additive blending) ──────────────────────────
    if (this.flares.size > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.flareProg);
      gl.uniform2f(this.flareUni['u_res']!,  w, h);
      gl.uniform1f(this.flareUni['u_time']!, t);
      for (const [, f] of this.flares) {
        gl.uniform2f(this.flareUni['u_center']!,    f.x, f.y);
        gl.uniform1f(this.flareUni['u_intensity']!, f.intensity);
        gl.uniform3f(this.flareUni['u_color']!,     f.color[0], f.color[1], f.color[2]);
        gl.uniform1f(this.flareUni['u_angle']!,     f.angle);
        gl.uniform1f(this.flareUni['u_size']!,      f.size);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    gl.bindVertexArray(null);
  }
}

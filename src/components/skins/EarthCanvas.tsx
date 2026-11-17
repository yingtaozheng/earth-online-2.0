// A rotating Earth drawn by one WebGL fragment shader: no 3D library, one
// 186 KB texture (public/earth.jpg, NASA Blue Marble). The planet is a shaded
// disc, so "moving the camera" just means changing where the disc sits and how
// big it is, which is what the start and goodbye screens animate.

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { prefersReducedMotion } from './shared';

/** Planet centre and radius. One unit is the shorter side of the screen; (0, 0) is the middle, y points up. */
export interface EarthView {
  x: number;
  y: number;
  r: number;
}
/** A view may depend on the screen's aspect ratio (width / height). */
export type EarthViewSpec = EarthView | ((aspect: number) => EarthView);
export type Easing = (t: number) => number;

export interface EarthHandle {
  animateTo: (view: EarthViewSpec, ms: number, easing?: Easing) => void;
}

export const easeInOut: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeIn: Easing = (t) => t * t * t;
export const easeOut: Easing = (t) => 1 - Math.pow(1 - t, 3);

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uView;      // planet centre (x, y) and radius
uniform mat3 uRot;       // screen-facing normal -> planet coordinates
uniform sampler2D uTex;  // equirectangular day map
uniform float uHasTex;   // 0 until the texture has loaded: draw made-up continents meanwhile

const vec3 LIGHT = vec3(-0.42, 0.72, 0.55);

float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    amp *= 0.5;
  }
  return sum;
}

vec3 stars(vec2 p) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 34.0 : 80.0;
    vec2 g = p * scale + float(layer) * 17.3;
    vec2 cell = floor(g);
    float h = hash2(cell);
    if (h > 0.9) {
      vec2 offset = vec2(hash2(cell + 3.1), hash2(cell + 7.7)) - 0.5;
      float d = length(fract(g) - 0.5 - offset * 0.6);
      float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + h * 3.0) + h * 40.0);
      float size = layer == 0 ? 0.075 : 0.11;
      col += vec3(0.8, 0.88, 1.0) * smoothstep(size, 0.0, d) * twinkle * (h - 0.9) * 10.0;
    }
  }
  return col;
}

void main() {
  float unit = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / unit;
  vec3 light = normalize(LIGHT);

  // Space: almost black, a little bluer towards the planet.
  vec2 d = (p - uView.xy) / uView.z;
  float dist = length(d);
  vec3 col = vec3(0.006, 0.01, 0.022) + vec3(0.01, 0.02, 0.05) * exp(-max(dist - 1.0, 0.0) * 1.2);
  col += stars(p);

  // Atmosphere seen against space: a thin glow hugging the sunlit limb.
  // (Also computed just inside the edge, so the anti-aliased rim blends into glow, not black.)
  float above = max(dist - 1.0, 0.0);
  float limbLit = smoothstep(-0.45, 0.5, dot(d / max(dist, 0.0001), light.xy));
  float halo = exp(-above / 0.018) * 0.9 + exp(-above / 0.07) * 0.25;
  col += vec3(0.32, 0.6, 1.0) * halo * limbLit * step(0.9, dist);

  if (dist < 1.0) {
    vec3 n = vec3(d, sqrt(1.0 - dist * dist));
    vec3 q = uRot * n;
    float lon = atan(q.x, q.z);
    float lat = asin(clamp(q.y, -1.0, 1.0));

    vec3 surface;
    float land;
    if (uHasTex > 0.5) {
      surface = texture2D(uTex, vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927)).rgb;
      land = smoothstep(-0.02, 0.06, max(surface.r, surface.g) - surface.b);
      surface = pow(surface, vec3(0.9)) * 1.15;
    } else {
      float h = fbm(q * 2.1 + 3.0);
      land = smoothstep(0.5, 0.53, h);
      vec3 ocean = mix(vec3(0.02, 0.07, 0.22), vec3(0.04, 0.2, 0.42), smoothstep(0.35, 0.5, h));
      vec3 ground = mix(vec3(0.12, 0.3, 0.1), vec3(0.42, 0.36, 0.2), smoothstep(0.55, 0.7, h));
      surface = mix(ocean, ground, land);
      surface = mix(surface, vec3(0.9), smoothstep(0.82, 0.9, abs(q.y) + (h - 0.5) * 0.2));
    }

    float sun = dot(n, light);
    float day = smoothstep(-0.18, 0.4, sun);

    // Clouds drift a little faster than the ground turns.
    float drift = uTime * 0.006;
    vec3 cq = vec3(q.x * cos(drift) - q.z * sin(drift), q.y, q.x * sin(drift) + q.z * cos(drift));
    float cloud = smoothstep(0.46, 0.7, fbm(cq * 3.2 + fbm(cq * 1.6 + 5.0) * 1.6));

    vec3 lit = surface * (0.025 + day * 1.05);
    // Sun glint on water.
    float glint = pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
    lit += vec3(1.0, 0.95, 0.85) * glint * (1.0 - land) * 0.45 * day;
    lit = mix(lit, vec3(0.04 + day * 0.98), cloud * 0.7);

    // City lights on the night side, on land only.
    float city = step(0.74, noise(q * 70.0)) * smoothstep(0.45, 0.75, noise(q * 9.0));
    lit += vec3(1.0, 0.78, 0.45) * city * land * (1.0 - day) * (1.0 - cloud) * 0.7;

    // Atmosphere seen from above: blue haze that thickens towards the edge.
    float rim = pow(1.0 - n.z, 3.0);
    lit += vec3(0.25, 0.52, 1.0) * rim * (0.1 + day * 0.95);
    lit += vec3(0.1, 0.22, 0.45) * 0.12 * day;

    float edge = 2.0 / (uView.z * unit);
    col = mix(col, lit, smoothstep(1.0, 1.0 - edge, dist));
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** q = Ry(spin) * Rx(pitch) * n, as a column-major array for uniformMatrix3fv. */
function rotation(spin: number, pitch: number): Float32Array {
  const [cs, ss, cp, sp] = [Math.cos(spin), Math.sin(spin), Math.cos(pitch), Math.sin(pitch)];
  // Row-major:  [ cs, ss*sp, ss*cp ]
  //             [ 0,  cp,    -sp   ]
  //             [ -ss, cs*sp, cs*cp ]
  return new Float32Array([cs, 0, -ss, ss * sp, cp, cs * sp, ss * cp, -sp, cs * cp]);
}

/** Longitude facing the camera at the start (East Asia, tuned for the limb view) and how fast the planet turns. */
const START_SPIN = 2.48;
const SPIN_PER_SECOND = 0.012;
const PITCH = 0.2;
const MAX_PIXEL_RATIO = 1.5;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

const resolve = (spec: EarthViewSpec, aspect: number) => (typeof spec === 'function' ? spec(aspect) : spec);

/**
 * The radius is blended on a log scale (steady zoom speed) and the centre moves
 * in proportion to the radius. That is exactly a zoom about one fixed point on
 * the screen, so it reads as flying towards or away from a spot on the planet
 * and the planet never swings out of view on the way.
 */
export function blend(a: EarthView, b: EarthView, t: number): EarthView {
  const r = Math.exp(Math.log(a.r) + (Math.log(b.r) - Math.log(a.r)) * t);
  const w = Math.abs(b.r - a.r) < 1e-9 ? t : (r - a.r) / (b.r - a.r);
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, r };
}

export function EarthCanvas({ initial, ref }: { initial: EarthViewSpec; ref?: Ref<EarthHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  // Camera state lives in a ref: it changes every frame and must not re-render React.
  const camera = useRef({ from: null as EarthView | null, to: initial, start: 0, ms: 0, easing: easeInOut, current: null as EarthView | null });

  useImperativeHandle(ref, () => ({
    animateTo(view, ms, easing = easeInOut) {
      const c = camera.current;
      // Before the first frame there is no current view yet: start from the one the canvas was given.
      c.from = c.current ?? resolve(c.to, window.innerWidth / Math.max(1, window.innerHeight));
      c.to = view;
      c.start = performance.now();
      c.ms = prefersReducedMotion() ? 0 : ms;
      c.easing = easing;
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl && vs && fs ? gl.createProgram() : null;
    if (!gl || !vs || !fs || !program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    // Two triangles covering the screen.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const [uRes, uTime, uView, uRot, uHasTex] = ['uRes', 'uTime', 'uView', 'uRot', 'uHasTex'].map(uniform);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([10, 40, 90]));
    gl.uniform1f(uHasTex, 0);
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      // No mipmaps: the longitude seam would show as a line. Linear filtering is enough at these sizes.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1f(uHasTex, 1);
    };
    image.src = './earth.jpg';

    const still = prefersReducedMotion();
    const began = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      const c = camera.current;
      const target = resolve(c.to, width / height);
      const t = c.from && c.ms > 0 ? Math.min(1, (now - c.start) / c.ms) : 1;
      c.current = t < 1 && c.from ? blend(c.from, target, c.easing(t)) : target;

      const seconds = still ? 0 : (now - began) / 1000;
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, seconds);
      gl.uniform3f(uView, c.current.x, c.current.y, c.current.r);
      gl.uniformMatrix3fv(uRot, false, rotation(START_SPIN - seconds * SPIN_PER_SECOND, PITCH));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      image.onload = null;
    };
  }, []);

  // Without WebGL the skin still works: a painted planet stands in for the rendered one.
  if (failed) return <div className="orbit-earth orbit-earth-flat" aria-hidden />;
  return <canvas ref={canvasRef} className="orbit-earth" aria-hidden />;
}

// Noise & fBm — value noise vs gradient noise, fractal Brownian motion, domain warping.
// Everything is computed per pixel from a hash function: no textures at all.
import GUI from "three/addons/libs/lil-gui.module.min.js";

const canvas = PG.canvas;
const gl = canvas.getContext("webgl2");
if (!gl) {
  PG.status("WebGL2 is not available in this browser · 当前浏览器不支持 WebGL2");
  throw new Error("WebGL2 unavailable");
}

const vertexSrc = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSrc = /* glsl */ `#version 300 es
precision highp float;
uniform vec2  uResolution;
uniform float uTime;
uniform int   uNoise;        // 0 = value, 1 = gradient
uniform int   uOctaves;
uniform float uLacunarity;   // frequency multiplier per octave
uniform float uGain;         // amplitude multiplier per octave
uniform float uWarp;         // domain-warp strength
uniform int   uLook;         // 0 clouds, 1 marble, 2 raw
uniform float uScale;
out vec4 outColor;

// A cheap 2D → 2D pseudo-random hash in [-1, 1].
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// Value noise: random VALUES at grid corners, blended smoothly.
float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);                 // smooth Hermite fade
  float a = hash2(i).x, b = hash2(i + vec2(1, 0)).x;
  float c = hash2(i + vec2(0, 1)).x, d = hash2(i + vec2(1, 1)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Gradient (Perlin-style) noise: random GRADIENTS at corners → fewer grid artifacts.
float gradientNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic fade
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1, 0)), f - vec2(1, 0));
  float c = dot(hash2(i + vec2(0, 1)), f - vec2(0, 1));
  float d = dot(hash2(i + vec2(1, 1)), f - vec2(1, 1));
  return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float noise(vec2 p) { return uNoise == 0 ? valueNoise(p) : gradientNoise(p); }

// fBm: sum octaves of noise, each at higher frequency and lower amplitude.
const mat2 R = mat2(0.8, 0.6, -0.6, 0.8);          // rotate each octave to hide grid alignment
float fbm(vec2 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 10; i++) {
    if (i >= uOctaves) break;
    sum += amp * noise(p);
    p = R * p * uLacunarity;
    amp *= uGain;
  }
  return sum;
}

void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y * uScale;
  float t = uTime * 0.12;

  // Domain warping: offset the input of fbm by another fbm (Inigo Quilez, "warp").
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + t), fbm(p + uWarp * q + vec2(8.3, 2.8)));
  float n = fbm(p + uWarp * r);

  vec3 col;
  if (uLook == 0) {
    // Clouds: map density to a dusk sky.
    float dens = smoothstep(-0.2, 0.7, n);
    vec3 sky = mix(vec3(0.05, 0.06, 0.16), vec3(0.32, 0.22, 0.48), gl_FragCoord.y / uResolution.y);
    vec3 cloud = mix(vec3(0.95, 0.62, 0.55), vec3(1.0, 0.95, 0.9), clamp(length(q), 0.0, 1.0));
    col = mix(sky, cloud, dens);
  } else if (uLook == 1) {
    // Marble: noise perturbs the phase of a sine stripe pattern.
    float v = 0.5 + 0.5 * sin((p.x + p.y) * 3.0 + n * 9.0);
    v = pow(v, 0.35);
    col = mix(vec3(0.12, 0.1, 0.16), vec3(0.94, 0.91, 0.86), v);
    col = mix(col, vec3(0.86, 0.66, 0.24), smoothstep(0.92, 1.0, v) * 0.6); // gold veins
  } else {
    col = vec3(0.5 + 0.5 * n);   // raw value, grayscale
  }
  outColor = vec4(col, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("shader compile error:\n" + gl.getShaderInfoLog(s));
  return s;
}
const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error("program link error:\n" + gl.getProgramInfoLog(program));
const names = ["uResolution", "uTime", "uNoise", "uOctaves", "uLacunarity", "uGain", "uWarp", "uLook", "uScale"];
const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
const vao = gl.createVertexArray();

const params = { look: "clouds", noise: "gradient", octaves: 5, lacunarity: 2.0, gain: 0.5, warp: 1.8, scale: 1.1, speed: 1, resolution: 0.75 };
const gui = new GUI({ title: "Parameters" });
gui.add(params, "look", ["clouds", "marble", "raw"]);
gui.add(params, "noise", ["value", "gradient"]);
gui.add(params, "octaves", 1, 10, 1);
gui.add(params, "lacunarity", 1.2, 3.5, 0.01);
gui.add(params, "gain", 0.2, 0.8, 0.01);
gui.add(params, "warp", 0, 8, 0.01).name("domain warp");
gui.add(params, "scale", 0.5, 5, 0.01);
gui.add(params, "speed", 0, 4, 0.01);
gui.add(params, "resolution", 0.25, 1, 0.05).name("render scale").onChange(resize);

// This shader calls fbm 5× per pixel; rendering at a lower resolution keeps it smooth.
function resize() {
  const s = Math.min(devicePixelRatio, 2) * params.resolution;
  canvas.width = Math.round(canvas.clientWidth * s);
  canvas.height = Math.round(canvas.clientHeight * s);
}
new ResizeObserver(resize).observe(canvas);
resize();

let t = 0, last = 0;
function frame(now) {
  t += ((now - last) / 1000) * params.speed; last = now;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.uniform2f(loc.uResolution, canvas.width, canvas.height);
  gl.uniform1f(loc.uTime, t);
  gl.uniform1i(loc.uNoise, params.noise === "value" ? 0 : 1);
  gl.uniform1i(loc.uOctaves, params.octaves);
  gl.uniform1f(loc.uLacunarity, params.lacunarity);
  gl.uniform1f(loc.uGain, params.gain);
  gl.uniform1f(loc.uWarp, params.warp);
  gl.uniform1i(loc.uLook, ["clouds", "marble", "raw"].indexOf(params.look));
  gl.uniform1f(loc.uScale, params.scale);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

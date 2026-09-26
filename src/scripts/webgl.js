/* =============================================================================
   Nicola Cafe — WebGL layers
   • initHeroScene : procedural 3D hero (torus + espresso sphere + orbit ring)
                     with spring-damped cursor leaning + scroll transformation
   • initShaderLayer: full-screen thin-film interference / opalescence shader
                      reacting to pointer velocity + scroll
============================================================================= */
import { state, clamp, damp, reduced, onReady } from './state.js';

/* ----------------------------- tiny mat4 lib ----------------------------- */
const I4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
const tx = (x, y, z) => { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; };
const sc = (x, y, z) => { const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; };
function rotX(a) { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
function rotY(a) { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
function perspective(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
  return m;
}
function normalMat3(m) {
  const o = new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
  for (let i = 0; i < 3; i++) {
    const x = o[i * 3], y = o[i * 3 + 1], z = o[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    o[i * 3] = x / l; o[i * 3 + 1] = y / l; o[i * 3 + 2] = z / l;
  }
  return o;
}

/* ------------------------------ gl helpers ------------------------------ */
function sh(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}
function prog(gl, vs, fs) {
  const v = sh(gl, gl.VERTEX_SHADER, vs);
  const f = sh(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
  return p;
}
function buf(gl, data, target = gl.ARRAY_BUFFER) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return b;
}

/* ------------------------------ geometry -------------------------------- */
function torus(R, r, seg, ring) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= ring; j++) {
      const v = (j / ring) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
      pos.push((R + r * cv) * cu, (R + r * cv) * su, r * sv);
      nor.push(cv * cu, cv * su, sv);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j, b = a + ring + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}
function ellipsoid(rx, ry, rz, w, h) {
  const pos = [], nor = [], idx = [];
  for (let y = 0; y <= h; y++) {
    const phi = (y / h) * Math.PI;
    for (let x = 0; x <= w; x++) {
      const th = (x / w) * Math.PI * 2;
      const sx = Math.sin(phi) * Math.cos(th), sy = Math.cos(phi), sz = Math.sin(phi) * Math.sin(th);
      pos.push(rx * sx, ry * sy, rz * sz);
      let nx = sx / rx, ny = sy / ry, nz = sz / rz;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = y * (w + 1) + x, b = a + w + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}
function mesh(gl, g) {
  return {
    pos: buf(gl, g.pos),
    nor: buf(gl, g.nor),
    idx: buf(gl, g.idx, gl.ELEMENT_ARRAY_BUFFER),
    count: g.idx.length,
  };
}

/* ------------------------------- shaders -------------------------------- */
const MESH_VS = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uProj, uView, uModel; uniform mat3 uNMat; uniform float uTime;
varying vec3 vN; varying vec3 vPos;
void main(){
  vec3 p = aPos + aNor * (sin(uTime*1.4 + aPos.y*5.0 + aPos.x*3.0) * 0.012);
  vec4 wp = uView * uModel * vec4(p,1.0);
  vPos = wp.xyz; vN = uNMat * aNor;
  gl_Position = uProj * wp;
}`;

const MESH_FS = `
precision mediump float;
varying vec3 vN; varying vec3 vPos;
uniform vec3 uColor; uniform float uIrid; uniform float uTime; uniform float uOpacity;
vec3 irid(float t){ return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0,0.33,0.67) + t)); }
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(-vPos);
  vec3 L = normalize(vec3(0.45, 0.75, 0.6));
  vec3 L2 = normalize(vec3(-0.7, -0.3, 0.4));
  float diff = max(dot(N,L), 0.0) * 0.85 + max(dot(N,L2), 0.0) * 0.32;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N,H), 0.0), 56.0);
  float fres = pow(1.0 - max(dot(N,V), 0.0), 3.0);
  vec3 col = uColor * (0.10 + 0.95 * diff);
  col += vec3(1.0, 0.96, 0.9) * spec * 0.85;
  col += irid(fres * 1.5 + uTime * 0.05) * uIrid * fres;
  gl_FragColor = vec4(col, uOpacity);
}`;

const PTS_VS = `
attribute vec3 aPos; attribute float aSize;
uniform mat4 uProj, uView, uModel; uniform float uDpr;
varying float vFade;
void main(){
  vec4 wp = uView * uModel * vec4(aPos,1.0);
  gl_Position = uProj * wp;
  gl_PointSize = aSize * uDpr * (2.4 / max(0.6, -wp.z));
  vFade = clamp(1.6 + wp.z * 0.4, 0.15, 1.0);
}`;

const PTS_FS = `
precision mediump float;
varying float vFade;
uniform vec3 uColor; uniform float uOpacity;
void main(){
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.06, d);
  gl_FragColor = vec4(uColor, a * vFade * uOpacity);
}`;

const QUAD_VS = `
attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const QUAD_FS = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform vec2 uPointer; uniform float uVel; uniform float uScroll;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
}
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s += a*noise(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  float t = uTime * 0.07 + uScroll * 0.0018;
  vec2 q = vec2(fbm(p*1.6 + t), fbm(p*1.6 + vec2(3.1,1.7) - t));
  vec2 r = vec2(fbm(p*2.1 + q*1.7 + uPointer*0.4 + t*0.5),
                fbm(p*2.1 + q*1.7 + vec2(8.3,2.8) - t*0.45));
  float f = fbm(p*1.7 + r*2.1);
  float phase = f*3.6 + uVel*1.8 + t*0.4;
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0,0.31,0.6) + phase));
  irid = pow(irid, vec3(1.35));
  vec3 col = vec3(0.027,0.027,0.027);
  col += irid * 0.6 * smoothstep(0.12, 0.95, f);
  col += vec3(0.88,0.63,0.29) * pow(max(0.0, 1.0 - length(p - uPointer*0.55) * 1.15), 3.0) * (0.14 + uVel*0.22);
  col *= 1.0 - 0.55 * length(p * vec2(0.55,0.85));
  gl_FragColor = vec4(col, 1.0);
}`;

/* =========================================================================
   HERO 3D SCENE
========================================================================= */
export function initHeroScene(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'high-performance',
  });
  if (!gl) { canvas.style.display = 'none'; return; }

  const meshP = prog(gl, MESH_VS, MESH_FS);
  const ptsP = prog(gl, PTS_VS, PTS_FS);
  if (!meshP || !ptsP) { canvas.style.display = 'none'; return; }

  const aPosM = gl.getAttribLocation(meshP, 'aPos');
  const aNorM = gl.getAttribLocation(meshP, 'aNor');
  const u = (p, n) => gl.getUniformLocation(p, n);
  const MU = {
    proj: u(meshP, 'uProj'), view: u(meshP, 'uView'), model: u(meshP, 'uModel'),
    nmat: u(meshP, 'uNMat'), time: u(meshP, 'uTime'), color: u(meshP, 'uColor'),
    irid: u(meshP, 'uIrid'), opacity: u(meshP, 'uOpacity'),
  };
  const PU = {
    proj: u(ptsP, 'uProj'), view: u(ptsP, 'uView'), model: u(ptsP, 'uModel'),
    dpr: u(ptsP, 'uDpr'), color: u(ptsP, 'uColor'), opacity: u(ptsP, 'uOpacity'),
  };
  const aPosP = gl.getAttribLocation(ptsP, 'aPos');
  const aSizeP = gl.getAttribLocation(ptsP, 'aSize');

  // objects
  const ringOuter = mesh(gl, torus(1.42, 0.035, 96, 16));
  const ringMain = mesh(gl, torus(1.0, 0.14, 128, 24));
  const bean = mesh(gl, ellipsoid(0.6, 0.6, 0.6, 48, 32));
  const ringSmall = mesh(gl, torus(0.52, 0.06, 72, 16));

  // particles (steam / beans)
  const N = window.innerWidth < 768 ? 240 : 440;
  const P = new Float32Array(N * 3);
  const S = new Float32Array(N);
  const V = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    P[i * 3] = (Math.random() - 0.5) * 4.4;
    P[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
    P[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    S[i] = 3 + Math.random() * 7;
    V[i * 3] = (Math.random() - 0.5) * 0.05;
    V[i * 3 + 1] = 0.02 + Math.random() * 0.06;
    V[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    seed[i] = Math.random() * 6.28;
  }
  const pPos = buf(gl, P);
  const pSize = buf(gl, S);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let W = 0, H = 0, dpr = 1, aspect = 1, halfH = 1, halfW = 1;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    aspect = W / H;
    halfH = Math.tan((42 * Math.PI) / 180 / 2) * 4.2;
    halfW = halfH * aspect;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const CAM = 4.2;
  const view = tx(0, 0, -CAM);

  // spring state for cursor leaning
  let leanX = 0, leanY = 0, velLeanX = 0, velLeanY = 0;
  let off = 0;

  const drawMesh = (m, color, iridAmt, model) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.enableVertexAttribArray(aPosM);
    gl.vertexAttribPointer(aPosM, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nor);
    gl.enableVertexAttribArray(aNorM);
    gl.vertexAttribPointer(aNorM, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(MU.model, false, model);
    gl.uniformMatrix3fv(MU.nmat, false, normalMat3(model));
    gl.uniform3fv(MU.color, color);
    gl.uniform1f(MU.irid, iridAmt);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
  };

  const render = () => {
    const section = canvas.parentElement;
    const rect = section ? section.getBoundingClientRect() : { height: window.innerHeight };
    const p = clamp(-rect.top / Math.max(rect.height, 1), 0, 1);
    off = p;

    // scroll-driven rotation / scale / depth
    const baseScale = Math.min(1, Math.max(0.45, halfW / 1.55)) * (1 - 0.42 * p);
    const z = -2.4 * p;

    // spring-damped cursor lean (critically-ish damped)
    const targetY = reduced ? 0 : state.pointer.x * 0.55;
    const targetX = reduced ? 0 : -state.pointer.y * 0.38;
    const K = 42, D = 9.5;
    velLeanX += ((targetX - leanX) * K - velLeanX * D) * state.dt;
    velLeanY += ((targetY - leanY) * K - velLeanY * D) * state.dt;
    leanX += velLeanX * state.dt;
    leanY += velLeanY * state.dt;

    const t = state.t;
    let root = tx(0, 0, z);
    root = mul(root, sc(baseScale, baseScale, baseScale));
    root = mul(root, rotY(leanY + p * 0.9 + t * 0.12));
    root = mul(root, rotX(leanX + p * 0.35));
    root = mul(root, rotZ(p * 0.55));

    const proj = perspective((42 * Math.PI) / 180, aspect, 0.1, 60);
    const alpha = 1 - 0.9 * p;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- meshes
    gl.useProgram(meshP);
    gl.uniformMatrix4fv(MU.proj, false, proj);
    gl.uniformMatrix4fv(MU.view, false, view);
    gl.uniform1f(MU.time, t);
    gl.uniform1f(MU.opacity, alpha);

    drawMesh(ringOuter, [0.88, 0.64, 0.29], 0.5, mul(root, rotZ(t * 0.35)));
    drawMesh(ringMain, [0.17, 0.11, 0.075], 0.9, mul(root, rotX(1.15 + Math.sin(t * 0.4) * 0.12)));
    drawMesh(bean, [0.2, 0.12, 0.08], 1.0, mul(mul(root, tx(0, 0, 0)), rotY(t * 0.5)));
    drawMesh(
      ringSmall,
      [0.94, 0.93, 0.9],
      0.65,
      mul(mul(root, tx(0.05, -0.02, 0.55)), mul(rotZ(-t * 0.6), rotX(0.7))),
    );

    // ---- particles (cursor repulsion + frustum wrap)
    if (!reduced) {
      const mx = state.pointer.x * halfW;
      const my = state.pointer.y * halfH;
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        const dx = P[ix] - mx;
        const dy = P[ix + 1] - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1.9 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 1.38) * 1.6;
          V[ix] += (dx / d) * f * state.dt;
          V[ix + 1] += (dy / d) * f * state.dt;
        }
        V[ix] *= 0.96; V[ix + 2] *= 0.96;
        V[ix + 1] = V[ix + 1] * 0.96 + 0.0006;
        P[ix] += V[ix] + Math.sin(t * 0.6 + seed[i]) * 0.0016;
        P[ix + 1] += V[ix + 1];
        P[ix + 2] += V[ix + 2];

        const bx = halfW * 1.5, by = halfH * 1.5, bz = 1.5;
        if (P[ix + 1] > by) { P[ix + 1] = -by; P[ix] = (Math.random() - 0.5) * bx * 2; }
        if (P[ix] > bx) P[ix] = -bx;
        if (P[ix] < -bx) P[ix] = bx;
        if (P[ix + 2] > bz) V[ix + 2] -= 0.002;
        if (P[ix + 2] < -bz) V[ix + 2] += 0.002;
      }
    }

    gl.useProgram(ptsP);
    gl.uniformMatrix4fv(PU.proj, false, proj);
    gl.uniformMatrix4fv(PU.view, false, view);
    gl.uniformMatrix4fv(PU.model, false, root);
    gl.uniform1f(PU.dpr, dpr);
    gl.uniform3fv(PU.color, [0.95, 0.84, 0.64]);
    gl.uniform1f(PU.opacity, 0.55 * alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, pPos);
    gl.enableVertexAttribArray(aPosP);
    gl.vertexAttribPointer(aPosP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, pSize);
    gl.enableVertexAttribArray(aSizeP);
    gl.vertexAttribPointer(aSizeP, 1, gl.FLOAT, false, 0, 0);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.depthMask(true);
  };

  state.onFrame(render);
  onReady(render);
  render();
}

/* =========================================================================
   FULL-SCREEN OPALESCENCE / THIN-FILM SHADER
========================================================================= */
export function initShaderLayer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) { canvas.style.display = 'none'; return; }

  const p = prog(gl, QUAD_VS, QUAD_FS);
  if (!p) { canvas.style.display = 'none'; return; }

  const quad = buf(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
  const aPos = gl.getAttribLocation(p, 'aPos');
  const U = {
    res: gl.getUniformLocation(p, 'uRes'),
    time: gl.getUniformLocation(p, 'uTime'),
    pointer: gl.getUniformLocation(p, 'uPointer'),
    vel: gl.getUniformLocation(p, 'uVel'),
    scroll: gl.getUniformLocation(p, 'uScroll'),
  };

  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  let vis = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => (vis = e[0].isIntersecting), { threshold: 0 }).observe(canvas);
  }

  const render = () => {
    if (!vis) return;
    const rect = canvas.getBoundingClientRect();
    const scrollRel = state.scroll - (rect.top + window.scrollY);
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.time, state.t);
    gl.uniform2f(U.pointer, state.pointer.x, state.pointer.y);
    gl.uniform1f(U.vel, state.vel);
    gl.uniform1f(U.scroll, scrollRel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  state.onFrame(render);
  onReady(render);
  render();
}
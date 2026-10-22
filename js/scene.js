// VizClix 3D world: contour terrain, wireframe property, camera rig driven by one timeline value T.
// T 0–1 hero · 1–2 intro · 2–3 the flight · 3–4 the camera settles into a studio view. From there
// the drone is placed by the page itself (s.dock): it parks beside each heading and call to action
// and lands at the enquiry form.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const INK = 0x0a0b0d;
const BONE = 0xede8df;
const EMBER = 0xff6b35;
// Dusk: the sky the flight happens under. The horizon is also the fog, so the ground fades into
// light rather than into black.
const SKY_TOP = 0x0b111b;
const HORIZON = 0x34465f;
const GLOW = 0xd8774c;
// A shoot day, for the page after the flight: [hour, sky overhead, sky at the foot, warm glow].
// The page runs before dawn → sunrise → (daylight sections) → golden hour → dusk at the form.
// The foot colours (plus glow) are capped so the smallest copy, #7C93AD mono, clears 4.5:1.
const DAY = [
  [4.5, 0x0a1019, 0x18202d, 0.015],
  [5.6, 0x0e1828, 0x1b2334, 0.02],
  [6.6, 0x121a2a, 0x231a1d, 0.036],
  [16.9, 0x121826, 0x231b18, 0.036],
  [18.4, 0x0f1523, 0x21192a, 0.034],
  [19.6, 0x0b111b, 0x1a2330, 0.02],
];

// ---- camera / drone keyframes (catmull-rom through these) ----
// cam, look, pos, rot (pitch,yaw,roll), then fov, scale, throttle, gimbal pitch
// The last two flight frames aim right of the drone, so it hovers left of the film's framed shot.
const K = [
  { T: 0.0, cam: [0.0, 0.4, 7.4],  look: [-1.7, -0.1, 0],  pos: [0, 0, 0], rot: [0.10, -0.55, 0.05],   fov: 30, sc: 0.88, thr: 0.75, gim: -0.2 },
  { T: 0.5, cam: [0.6, 0.9, 7.0],  look: [-1.4, -0.2, 0],  pos: [0, 0, 0], rot: [0.08, -0.95, 0.0],    fov: 30, sc: 0.9, thr: 0.75, gim: -0.2 },
  { T: 1.0, cam: [0.0, 0.7, 9.2],  look: [-2.7, -1.1, 0],  pos: [0, 0, 0], rot: [0.05, -1.45, 0.0],    fov: 30, sc: 0.72, thr: 0.7,  gim: -0.1 },
  { T: 1.5, cam: [0.0, 1.0, 9.0],  look: [-2.4, -1.2, -1], pos: [0, 0, 0], rot: [0.10, -2.3, 0.0],     fov: 30, sc: 0.78, thr: 0.85, gim: -0.25 },
  { T: 2.0, cam: [0.0, 1.8, 7.0],  look: [0.0, -0.9, -4],  pos: [0, 0, 0], rot: [0.16, -3.1416, 0.0],   fov: 34, sc: 1.0,  thr: 1.0,  gim: -0.35 },
  { T: 2.4, cam: [3.6, 0.7, 6.0],  look: [0.0, -1.6, -3],  pos: [0, 0, 0], rot: [0.12, -3.1416, -0.08], fov: 34, sc: 1.0,  thr: 1.0,  gim: -0.5 },
  { T: 2.75, cam: [-5.4, 0.3, 8.2], look: [1.9, -2.3, -0.1], pos: [0, 0, 0], rot: [0.08, -2.7832, 0.05],  fov: 35, sc: 1.0,  thr: 0.8,  gim: -0.95 },
  { T: 3.0, cam: [-6.4, 0.7, 8.6], look: [1.9, -2.1, 1.45], pos: [0, 0, 0], rot: [0.03, -2.6332, 0.0],    fov: 36, sc: 1.0,  thr: 0.6,  gim: -1.15 },
  // --- the escort: camera holds a studio view, the drone takes a station per section ---
  // Yaw is deliberate and continuous from key to key (no 2PI jumps, or the drone spins the long way): the drone faces what it is looking at. Front is +Z, so y=0 faces the
  // reader, y=PI faces away, y=PI/2 points screen-right, y=3PI/2 points screen-left.
  { T: 3.4, cam: [-2.6, 0.5, 9.6], look: [0, -0.7, 0], pos: [1.4, 0.6, 0],  rot: [0.05, -2.3332, 0.02],  fov: 35, sc: 0.78, thr: 0.8,  gim: -0.7 },
  { T: 4.0, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.7, 2.45, 0],   rot: [0.09, -1.7832, -0.04], fov: 35, sc: 0.50, thr: 0.7,  gim: -0.65 }, // studio view: the page takes over the drone
];
// Half the drone's span in world units at scale 1, rotor tip to rotor tip. Used to keep a
// station inside the frame by the drone's own width rather than by its centre point.
const DRONE_HALF_W = 1.35;
const N = 16;
const FLAT = K.map((k) => [...k.cam, ...k.look, ...k.pos, ...k.rot, k.fov, k.sc, k.thr, k.gim]);

const lerp = (a, b, t) => a + (b - a) * t;
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const out = new Float32Array(N);
function sample(T) {
  const last = K.length - 1;
  let i = 0;
  while (i < last - 1 && T > K[i + 1].T) i++;
  const a = K[i].T, b = K[i + 1].T;
  const t = Math.min(1, Math.max(0, (T - a) / (b - a)));
  const p0 = FLAT[Math.max(0, i - 1)], p1 = FLAT[i], p2 = FLAT[i + 1], p3 = FLAT[Math.min(last, i + 2)];
  for (let j = 0; j < N; j++) out[j] = cr(p0[j], p1[j], p2[j], p3[j], t);
  return out;
}

// ---- terrain shader ----
const TERRAIN_VS = /* glsl */ `
uniform float uScroll; uniform vec2 uPin;
varying float vH; varying vec2 vTp; varying float vDist;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.02+7.1;a*=.5;}return v;}
void main(){
  vec3 p = position;
  vec2 tp = vec2(p.x, p.z - uScroll);
  float h = fbm(tp * 0.034);
  float d = length(tp - uPin);
  // the district is level ground; the hills rise beyond it, the way Yeoor rises behind Thane
  h *= smoothstep(78.0, 125.0, d);
  p.y += h * 9.0;
  vH = h; vTp = tp;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vDist = distance(cameraPosition, w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// Every hand-written shader ends in colorspace_fragment. Colour uniforms arrive in linear space,
// and without the conversion back to sRGB every mid-tone renders far darker than authored.
const TERRAIN_FS = /* glsl */ `
uniform vec3 uInk; uniform vec3 uBone; uniform vec3 uEmber; uniform vec3 uAlt; uniform vec3 uFog;
uniform vec2 uPin; uniform float uTime; uniform float uFade;
varying float vH; varying vec2 vTp; varying float vDist;
float lineAA(float v, float w){ float f = abs(fract(v - .5) - .5) / max(fwidth(v), 1e-4); return 1.0 - clamp(f / w, 0.0, 1.0); }
void main(){
  float fogF = smoothstep(10.0, 110.0, vDist);
  float lv = vH * 15.0;
  float relief = smoothstep(0.0015, 0.02, fwidth(lv)); // no contour lines on the flat plateau
  float contour = (lineAA(lv, 1.0) * 0.24 + lineAA(lv / 5.0, 1.2) * 0.42) * relief;
  float gx = lineAA(vTp.x / 12.0, 1.0), gz = lineAA(vTp.y / 12.0, 1.0);
  float g2x = lineAA(vTp.x / 3.0, 1.0), g2z = lineAA(vTp.y / 3.0, 1.0);
  float closeness = 1.0 - smoothstep(6.0, 42.0, length(vTp - uPin));
  float grid = max(gx, gz) * 0.2 + max(g2x, g2z) * 0.09 * closeness;
  float r = length(vTp - uPin);
  float rr = abs(fract((r - uTime * 3.2) / 9.0) - .5);
  float ring = (1.0 - smoothstep(0.0, 0.035, rr)) * (1.0 - smoothstep(10.0, 46.0, r));
  float glow = exp(-r * 0.075);
  vec3 col = uInk + vH * 0.05;
  col = mix(col, uBone, contour * (1.0 - fogF));
  col = mix(col, uAlt, grid * (1.0 - fogF));
  col += uEmber * (ring * 0.55 + glow * 0.14) * (1.0 - fogF * .7);
  col = mix(col, uFog, fogF);
  col = mix(uFog, col, uFade); // dissolves into the sky once the flight is over
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// The sky: dusk for the flight, warmest along the horizon ahead where the property stands. Once
// the camera settles (uStudio) it calms into a soft gradient that lifts toward the foot of the
// screen, so the page sits on atmosphere instead of flat black. uLit carries it to daylight.
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uTop; uniform vec3 uGlow; uniform vec3 uDay; uniform vec3 uFog;
uniform vec3 uSTop; uniform vec3 uSLow; uniform float uSGlow; uniform float uSun;
uniform float uStudio; uniform float uLit;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float ahead = max(0.0, -d.z);
  // at and below the horizon the sky IS the fog, so the far edge of the ground never shows
  vec3 sky = mix(uFog, uTop, smoothstep(0.0, 0.28, h));
  sky += uGlow * 0.4 * uSun * smoothstep(-0.01, 0.015, h) * exp(-max(h, 0.0) * 16.0) * (0.3 + 0.7 * ahead * ahead);
  // studio: the hour of the shoot day sets the gradient (uSTop overhead, uSLow at the foot)
  vec3 studio = mix(uSTop, uSLow, smoothstep(0.3, -0.36, h)) + uGlow * uSGlow * smoothstep(0.0, -0.36, h);
  vec3 col = mix(mix(sky, studio, uStudio), uDay, uLit);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createWorld({ canvas, drone, quality }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.aa, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  const FOG_C = new THREE.Color(HORIZON).lerp(new THREE.Color(GLOW), 0.07);
  const fogC = FOG_C.clone();
  scene.fog = new THREE.Fog(fogC, 16, 110);
  scene.fog.color = fogC;          // share the object: the daylight crossfade must reach it

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.9;

  // light: warm rim from behind, cool fill from the front-left, and the dusk sky over all of it
  const rim = new THREE.DirectionalLight(0xffb48a, 2.4); rim.position.set(5, 3, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9db7d6, 0.9); fill.position.set(-5, 2, 5); scene.add(fill);
  const top = new THREE.DirectionalLight(0xffffff, 1.0); top.position.set(0, 8, 2); scene.add(top);
  const skyFill = new THREE.HemisphereLight(0x9fb4d4, 0x3a2a22, 0.8); scene.add(skyFill);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(SKY_TOP) }, uGlow: { value: new THREE.Color(GLOW) },
      uDay: { value: new THREE.Color(BONE) }, uFog: { value: fogC },
      uSTop: { value: new THREE.Color() }, uSLow: { value: new THREE.Color() }, uSGlow: { value: 0 }, uSun: { value: 1 },
      uStudio: { value: 0 }, uLit: { value: 0 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat);
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // landing pad: appears only where the drone sets down, beside the enquiry form
  const pad = new THREE.Group(); pad.visible = false; scene.add(pad);
  const padMat = new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const padRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 0.95, 64), padMat);
  padRing.rotation.x = -Math.PI / 2; pad.add(padRing);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.012), padMat);
    tick.rotation.x = -Math.PI / 2; tick.rotation.z = i * Math.PI / 2;
    tick.position.set(Math.cos(i * Math.PI / 2) * 1.12, 0, Math.sin(i * Math.PI / 2) * 1.12);
    pad.add(tick);
  }

  // The fallback world: terrain, the Thane district, roads, traffic, the property massing, the
  // scanner and dust. The After Effects film normally plays behind sections 1-5, so this is built
  // only if the film cannot load (s.film false); on a phone it costs seconds of start-up.
  let L = null;
  function buildLand() {
    // terrain
    const seg = quality.seg;
    const tgeo = new THREE.PlaneGeometry(420, 420, seg, seg); tgeo.rotateX(-Math.PI / 2);
    const pinT = new THREE.Vector2(0, -90);
    const tmat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
      uniforms: {
        uScroll: { value: 0 }, uPin: { value: pinT }, uTime: { value: 0 }, uFade: { value: 1 },
        uInk: { value: new THREE.Color(0x141a23) }, uBone: { value: new THREE.Color(BONE) },
        uEmber: { value: new THREE.Color(EMBER) }, uAlt: { value: new THREE.Color(0x7c93ad) }, uFog: { value: fogC },
      },
    });
    const terrain = new THREE.Mesh(tgeo, tmat); terrain.position.y = -6; terrain.frustumCulled = false; scene.add(terrain);

    // wireframe property at the pin
    const pin = new THREE.Group(); scene.add(pin);
    const fillMat = new THREE.MeshBasicMaterial({ transparent: true, color: 0x151a21, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const edgeMat = new THREE.LineBasicMaterial({ color: BONE, transparent: true, opacity: 0.6 });
    const edgeHot = new THREE.LineBasicMaterial({ color: EMBER });
    // The property is the case study's: a two-tower launch on a podium, with a clubhouse in front.
    // The same building is followed from this flight to the case study and the before/after.
    const boxes = [
      [1.4, 4.6, 1.4, -1.1, 0.2, true], [1.4, 4.0, 1.4, 1.2, -0.5],
      [4.6, 0.55, 2.8, 0.05, -0.15], [1.3, 0.35, 1.1, -0.4, 2.2],
    ];
    for (const [w, h, d, x, z, hot] of boxes) {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, fillMat); m.position.set(x, h / 2, z);
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), hot ? edgeHot : edgeMat); l.position.copy(m.position);
      pin.add(m, l);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 46, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 23; pin.add(beam);
    const baseRing = new THREE.Mesh(new THREE.RingGeometry(3.9, 3.94, 96),
      new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.01; pin.add(baseRing);

    // Box shader for the property massing (instanced: one draw call)
    const CITY_VS = `
      attribute float aSeed;
      varying vec3 vPos; varying vec3 vScale; varying float vSeed; varying vec3 vN; varying float vDist;
      void main(){
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vPos = position; vSeed = aSeed; vN = normal;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vDist = distance(cameraPosition, wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`;
    const CITY_FS = `
      uniform vec3 uInk; uniform vec3 uWin; uniform vec3 uCool; uniform vec3 uFog; uniform vec3 uFrom; uniform float uFade; uniform float uLit; uniform float uNear;
      varying vec3 vPos; varying vec3 vScale; varying float vSeed; varying vec3 vN; varying float vDist;
      float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
      void main(){
        vec3 an = abs(normalize(vN));
        vec2 uv;
        if (an.y > 0.5) uv = vPos.xz * vScale.xz;
        else if (an.x > 0.5) uv = vec2(vPos.z * vScale.z, vPos.y * vScale.y);
        else uv = vec2(vPos.x * vScale.x, vPos.y * vScale.y);
        // facade tone: darker at the base, slightly cooler up high
        float up = clamp(vPos.y + 0.5, 0.0, 1.0);
        vec3 col = mix(uInk * 0.72, uCool, up * 0.3);
        // faces turned toward the warm horizon catch it; the rest fall off, so towers read as solids
        col *= 0.62 + 0.55 * max(dot(normalize(vN), normalize(vec3(-0.45, 0.35, 0.82))), 0.0);
        if (an.y < 0.5) {
          // small windows, mostly dark; a few warm. Whole towers vary in how lived-in they look.
          vec2 grid = vec2(0.17, 0.26);
          vec2 cell = floor(uv / grid);
          float r = hash(cell + vSeed * 37.0);
          vec2 f = fract(uv / grid);
          float inWin = step(0.22, f.x) * step(f.x, 0.72) * step(0.26, f.y) * step(f.y, 0.78);
          float occupancy = 0.18 + 0.34 * hash(vec2(vSeed, 3.7));
          float lit = step(1.0 - occupancy, r) * uLit;
          col += uWin * inWin * lit * (0.4 + 0.4 * hash(cell + 7.1));
        }
        // buildings that would sweep through the lens are dropped, and the ones just beyond
        // fade up out of the dark, so the approach never turns into a canyon of flat tiles
        if (vDist < uNear) discard;
        col *= mix(0.3, 1.0, smoothstep(uNear, uNear + 23.0, vDist));
        float fog = smoothstep(30.0, 190.0, vDist);
        col = mix(col, uFog, fog * 0.7);
        gl_FragColor = vec4(mix(uFrom, col, uFade), 1.0);   // fades in from its own ground colour
        #include <colorspace_fragment>
      }`;
    // The district: real Thane West, from OpenStreetMap (assets/city/thane-district.json, built by
    // tools/district.py). Footprints, roads and lakes are mapped; heights are mapped where OSM has
    // them and estimated from footprint size where it does not. One unit is 8 m. The buildings use
    // the same window shader as the property: the vertex shader hands it world-scale wall coords.
    const DISTRICT_VS = `
      attribute float aSeed; attribute float aH;
      varying vec3 vPos; varying vec3 vScale; varying float vSeed; varying vec3 vN; varying float vDist;
      void main(){
        vScale = vec3(1.0, aH, 1.0);
        vPos = vec3(position.x, position.y / aH - 0.5, position.z); vSeed = aSeed; vN = normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDist = distance(cameraPosition, wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`;
    const cityMat = new THREE.ShaderMaterial({
      vertexShader: DISTRICT_VS, fragmentShader: CITY_FS, side: THREE.DoubleSide,
      uniforms: {
        uInk: { value: new THREE.Color(0x0d1119) }, uWin: { value: new THREE.Color(0xffc79a) },
        uCool: { value: new THREE.Color(0x27303f) }, uFog: { value: fogC }, uFrom: { value: fogC }, uFade: { value: 1 }, uLit: { value: 1 }, uNear: { value: 19 },
      },
    });
    const city = new THREE.Mesh(new THREE.BufferGeometry(), cityMat);
    city.frustumCulled = false; city.visible = false; pin.add(city);
    const roadMat = new THREE.MeshBasicMaterial({ color: 0x5a4636, transparent: true, opacity: 0.34, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x2c4260, transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
    // traffic: headlights and tail-lights moving along the trunk roads
    const carMat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const cars = new THREE.Points(new THREE.BufferGeometry(), carMat);
    cars.frustumCulled = false; pin.add(cars);
    let lanes = [], carT = null;
    fetch('assets/city/thane-district.json').then((r) => { if (!r.ok) throw new Error('district ' + r.status); return r.json(); }).then(({ b, r: roads, w: lakes }) => {
      const dist = (q) => Math.hypot(q[2], q[3]);
      b = b.sort((p, q) => dist(p) - dist(q)).slice(0, quality.city);
      const P = [], Nr = [], S = [], H = [];
      const v = (x, y, z, nx, ny, nz, s, h) => { P.push(x, y, z); Nr.push(nx, ny, nz); S.push(s); H.push(h); };
      for (const [h, s, ...xz] of b) {
        const pts = [];
        for (let i = 0; i < xz.length; i += 2) pts.push(new THREE.Vector2(xz[i], xz[i + 1]));
        if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();       // one winding, so wall normals face out
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], c = pts[(i + 1) % pts.length];
          const len = Math.hypot(c.x - a.x, c.y - a.y) || 1, nx = (c.y - a.y) / len, nz = -(c.x - a.x) / len;
          v(a.x, 0, a.y, nx, 0, nz, s, h); v(c.x, 0, c.y, nx, 0, nz, s, h); v(c.x, h, c.y, nx, 0, nz, s, h);
          v(a.x, 0, a.y, nx, 0, nz, s, h); v(c.x, h, c.y, nx, 0, nz, s, h); v(a.x, h, a.y, nx, 0, nz, s, h);
        }
        for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) for (const k of t) v(pts[k].x, h, pts[k].y, 0, 1, 0, s, h);
      }
      const g = city.geometry;
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Nr, 3));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(S, 1));
      g.setAttribute('aH', new THREE.Float32BufferAttribute(H, 1));
      // roads as flat ribbons laid on the ground
      const R = [];
      for (const [w, ...xz] of roads) {
        for (let i = 0; i + 3 < xz.length; i += 2) {
          const ax = xz[i], az = xz[i + 1], cx = xz[i + 2], cz = xz[i + 3];
          const len = Math.hypot(cx - ax, cz - az) || 1, ox = (-(cz - az) / len) * w / 2, oz = ((cx - ax) / len) * w / 2;
          R.push(ax + ox, 0.02, az + oz, cx + ox, 0.02, cz + oz, cx - ox, 0.02, cz - oz, ax + ox, 0.02, az + oz, cx - ox, 0.02, cz - oz, ax - ox, 0.02, az - oz);
        }
        if (w >= 1.6) lanes.push(xz);
      }
      const roadMesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(R, 3)), roadMat);
      const W = [];
      for (const xz of lakes) {
        const pts = [];
        for (let i = 0; i < xz.length; i += 2) pts.push(new THREE.Vector2(xz[i], xz[i + 1]));
        for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) for (const k of t) W.push(pts[k].x, 0.01, pts[k].y);
      }
      const waterMesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(W, 3)), waterMat);
      roadMesh.frustumCulled = waterMesh.frustumCulled = false;
      pin.add(roadMesh, waterMesh);
      // one car per few units of trunk road, half each way; warm white ahead, red behind
      if (!lanes.length) return;
      const n = Math.min(quality.city, 260);
      carT = Array.from({ length: n }, (_, i) => [i % lanes.length, Math.random(), Math.random() < 0.5 ? 1 : -1]);
      const col = new Float32Array(n * 3);
      carT.forEach(([, , dir], i) => col.set(dir > 0 ? [1, 0.86, 0.66] : [1, 0.25, 0.15], i * 3));
      cars.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      cars.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }).catch((e) => console.warn('District unavailable; the flight reads without it.', e));
    function moveCars(dt) {
      if (!carT) return;
      const p = cars.geometry.attributes.position;
      carT.forEach((c, i) => {
        const xz = lanes[c[0]], segs = xz.length / 2 - 1;
        c[1] = (c[1] + c[2] * dt * 0.012 + 1) % 1;
        const f = c[1] * segs, k = Math.min(segs - 1, Math.floor(f)), u = f - k;
        p.setXYZ(i, lerp(xz[k * 2], xz[k * 2 + 2], u), 0.12, lerp(xz[k * 2 + 1], xz[k * 2 + 3], u));
      });
      p.needsUpdate = true;
    }

    // The payoff: the surveyed massing becomes a finished, lit building. Built in the same world
    // as everything else rather than a photograph dropped into it, so nothing collides.
    // uNear sits behind the camera: the district's near-distance dimming exists to hide towers
    // sweeping past the lens, and the property is the one building meant to be lit when close.
    const heroMat = new THREE.ShaderMaterial({
      vertexShader: CITY_VS, fragmentShader: CITY_FS,
      uniforms: {
        uInk: { value: new THREE.Color(0x151b24) }, uWin: { value: new THREE.Color(0xffd0a4) },
        uCool: { value: new THREE.Color(0x36425a) }, uFog: { value: fogC }, uFrom: { value: new THREE.Color(0x151a21) }, uFade: { value: 0 }, uLit: { value: 1 }, uNear: { value: -40 },
      },
    });
    const heroMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), heroMat, boxes.length);
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
      const seeds = new Float32Array(boxes.length);
      boxes.forEach(([w, h, d, x, z], i) => {
        pv.set(x, h / 2, z); sv.set(w, h, d);
        heroMesh.setMatrixAt(i, m.compose(pv, q, sv));
        seeds[i] = i * 13.7 + 2.3;
      });
      heroMesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      heroMesh.instanceMatrix.needsUpdate = true;
    }
    heroMesh.frustumCulled = false;
    heroMesh.visible = false;
    pin.add(heroMesh);

    // scanner under the drone
    const scan = new THREE.Group(); scan.position.y = -5.97; scene.add(scan);
    const sMat = new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [a, b] of [[1.28, 1.3], [2.0, 2.015]]) {
      const r = new THREE.Mesh(new THREE.RingGeometry(a, b, 96), sMat); r.rotation.x = -Math.PI / 2; scan.add(r);
    }
    for (const [w, h] of [[2.6, 0.012], [0.012, 2.6]]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sMat); c.rotation.x = -Math.PI / 2; scan.add(c);
    }

    // drifting dust for depth
    const dustN = quality.dust;
    const dpos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) { dpos[i * 3] = (Math.random() - .5) * 46; dpos[i * 3 + 1] = -5 + Math.random() * 12; dpos[i * 3 + 2] = -62 + Math.random() * 70; }
    const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: BONE, size: 0.045, transparent: true, opacity: 0.35, sizeAttenuation: true, depthWrite: false }));
    dust.frustumCulled = false; scene.add(dust);

    function tick(s, T, esc, f, g, v) {
      const scrollZ = T < 2 ? T * 6 : 12 + f * 78;
      tmat.uniforms.uScroll.value = scrollZ;
      tmat.uniforms.uTime.value = s.time;
      tmat.uniforms.uFade.value = 1 - esc;
      terrain.visible = esc < 1;
      pin.position.set(0, -6, pinT.y + scrollZ);
      const reveal = clamp01((T - 2.5) / 0.45) * (1 - esc);   // survey -> finished image
      pin.visible = esc < 1;
      heroMesh.visible = reveal > 0.01;
      heroMat.uniforms.uFade.value = reveal * (1 - esc);
      // the district rises into view as the property nears, instead of crowding the opening
      cityMat.uniforms.uFade.value = (1 - esc) * clamp01((T - 1.65) / 0.7);
      city.visible = cityMat.uniforms.uFade.value > 0.01;
      cityMat.uniforms.uLit.value = 1 - (s.light || 0) * 0.85;
      // the survey scaffolding steps back once the finished frame has arrived
      fillMat.opacity = 1 - reveal;
      edgeMat.opacity = 0.6 * (1 - esc) * (1 - reveal);
      edgeHot.opacity = (1 - esc) * (1 - reveal * 0.75);
      beam.material.opacity = 0.55 * (1 - esc) * (1 - reveal);
      baseRing.material.opacity = 0.8 * (1 - esc);
      // the dust field wraps every 70 units: it fades out and back in across the wrap
      const ph = (scrollZ % 70) / 70;
      dust.position.z = scrollZ % 70;
      dust.material.opacity = 0.35 * (1 - esc) * Math.min(1, ph * 12, (1 - ph) * 12);
      dust.visible = esc < 1;
      moveCars(s.dt);
      // ground scanner: only over the property, during the flight
      const scanOn = (1 - esc) * clamp01((T - 1.4) / 0.6);
      scan.visible = scanOn > 0.01;
      if (scan.visible) {
        scan.position.set(g.position.x, -5.97, g.position.z);
        scan.scale.setScalar(v[13] * (1 + Math.sin(s.time * 1.6) * 0.03));
        sMat.opacity = (0.45 + 0.2 * Math.sin(s.time * 2.0)) * scanOn;
      }
    }
    function hide() { terrain.visible = pin.visible = dust.visible = scan.visible = false; }
    return { tick, hide };
  }

  drone.group.rotation.order = 'YXZ';
  scene.add(drone.group);

  const look = new THREE.Vector3();
  let aspect = 1;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect; camera.updateProjectionMatrix();
  }
  resize();

  // Fog banks over the night scene: a full-screen layer of drifting noise that parts around the
  // drone. Thick when the page opens and the drone flies out of it, thin in the hero, rolling in
  // over the district at night and clearing as the drone arrives over the property. It is a
  // density, never a blur: inside the clearing the scene is rendered exactly as it is.
  const FOG_FS = `
    uniform float uTime; uniform float uAmt; uniform float uHoleR; uniform float uAspect;
    uniform vec2 uHole; uniform vec2 uDrift; uniform vec3 uCol;
    varying vec2 vUv;
    float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+3.7;a*=.5;}return v;}
    void main(){
      vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
      vec2 q = p * 2.4 + uDrift;
      float n = fbm(q + vec2(uTime * 0.035, uTime * 0.008));
      float m = fbm(q * 1.6 + n * 1.4 - vec2(uTime * 0.05, 0.0));
      float bank = smoothstep(0.32, 0.78, m);
      float low = smoothstep(0.45, -0.4, p.y);              // heavier near the ground
      float hole = smoothstep(uHoleR * 0.45, uHoleR, length((vUv - uHole) * vec2(uAspect, 1.0)));
      float a = uAmt * mix(0.3, 1.0, bank) * mix(0.6, 1.0, low) * hole;
      gl_FragColor = vec4(uCol, clamp(a, 0.0, 0.94));
      #include <colorspace_fragment>
    }`;
  const fogMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FOG_FS, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uAmt: { value: 1 }, uHoleR: { value: 0 }, uAspect: { value: 1 },
      uHole: { value: new THREE.Vector2(0.5, 0.5) }, uDrift: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color() },
    },
  });
  const fogQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fogMat);
  fogQuad.frustumCulled = false; fogQuad.renderOrder = 20; scene.add(fogQuad);
  const camDir = new THREE.Vector3(), droneNdc = new THREE.Vector3();

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const BONE_C = new THREE.Color(BONE);
  const DAY_C = DAY.map(([h, a, b, g]) => [h, new THREE.Color(a), new THREE.Color(b), g]);
  function dayLight(hour) {
    let i = 0;
    while (i < DAY_C.length - 2 && hour > DAY_C[i + 1][0]) i++;
    const [h0, a0, b0, g0] = DAY_C[i], [h1, a1, b1, g1] = DAY_C[i + 1];
    const t = clamp01((hour - h0) / (h1 - h0));
    const u = skyMat.uniforms;
    u.uSTop.value.copy(a0).lerp(a1, t); u.uSLow.value.copy(b0).lerp(b1, t); u.uSGlow.value = lerp(g0, g1, t);
    return lerp(g0, g1, t);
  }
  const wrapPI = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // a screen pixel → the point under it on the z = 0 plane the escort flies in
  const ray = new THREE.Vector3(), hit = new THREE.Vector3();
  function toPlane(x, y) {
    ray.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    if (ray.z > -0.2) return;          // nearly parallel to the plane (ultra-wide, mid hand-over): keep the last hit
    hit.copy(camera.position).addScaledVector(ray, -camera.position.z / ray.z);
  }

  // s: { T, time, dt, light, dock }  — light 0..1 crossfades the world to the daylight section;
  // dock is the escort pose from the page: screen x/y and width in px, plus attitude and landing
  function update(s) {
    const T = Math.min(4, Math.max(0, s.T));
    const intro = s.intro == null ? 1 : s.intro;
    const ein = 1 - Math.pow(1 - intro, 3);   // the opening: the drone flies out of the fog
    const v = sample(T);
    const f = clamp01(T - 2);                 // the flight, 0 → 1
    const esc = clamp01((T - 3) / 0.35);      // hand-over from flight to escort
    const d = s.dock;
    const land = d ? d.land : 0;              // descent onto the pad
    const portrait = aspect < 0.9;
    // with the After Effects film behind it (s.film) the drone is all the canvas draws
    const film = !!s.film;
    if (!film && !L) L = buildLand();

    // daylight section: the sky, the fog and the exposure all cross over
    const lit = s.light || 0;
    skyMat.uniforms.uStudio.value = esc;
    skyMat.uniforms.uLit.value = lit;
    dayLight(s.hour == null ? 19.6 : s.hour);
    // dusk at the hero deepens into night over the flight; the district's windows carry it
    skyMat.uniforms.uSun.value = lerp(1, 0.5, clamp01((T - 0.8) / 1.8));
    fogC.copy(FOG_C).lerp(BONE_C, lit);
    renderer.toneMappingExposure = lerp(1.15, 0.82, lit);
    scene.environmentIntensity = lerp(0.9, 1.15, lit);
    rim.intensity = lerp(2.4, 1.5, lit);
    fill.intensity = lerp(0.9, 1.6, lit);
    skyFill.intensity = lerp(0.8, 0.5, lit);

    // camera
    camera.position.set(v[0], v[1], v[2]);
    const dropY = -1.25 * (1 - esc);
    if (portrait) look.set(lerp(v[3], v[6], 0.9 * (1 - esc)), lerp(v[4], v[7], 0.3) + dropY, lerp(v[5], v[8], 0.95 * (1 - esc)));
    else look.set(v[3], v[4], v[5]);
    camera.fov = v[12] * (portrait ? lerp(1.7, 1.15, esc) : 1);
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);

    // drone: the flight's keyframed pose hands over to the page's dock, plus idle life
    const g = drone.group;
    const t = s.time;
    const bob = lerp(0.06, 0.02, land);
    const speed = T > 2 && T < 3.2 ? 1 - f * 0.4 : 0.15;
    let px = v[6], py = v[7], pz = v[8], sc = v[13];
    let rx = v[9], ry = v[10], rz = v[11], thr = v[14], gim = v[15];
    if (d && esc > 0) {
      toPlane(d.x, d.y);
      const perPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z) / innerHeight;
      px = lerp(px, hit.x, esc); py = lerp(py, hit.y, esc); pz = lerp(pz, 0, esc);
      sc = lerp(sc, (d.w * perPx) / (2 * DRONE_HALF_W), esc);
      rx = lerp(rx, d.pitch, esc); ry += wrapPI(d.yaw - ry) * esc; rz = lerp(rz, d.roll, esc);
      thr = lerp(thr, d.thr, esc); gim = lerp(gim, d.gim, esc);
    }
    // the hero lets the visitor turn the drone by hand (s.spin); it fades out as the flight starts
    const hand = 1 - clamp01(T / 0.5);
    if (s.spin) { ry += s.spin.yaw * hand; rx += s.spin.pitch * hand; }
    pz -= 16 * (1 - ein); py += 1.4 * (1 - ein); ry += 1.1 * (1 - ein); rx += 0.22 * (1 - ein);
    g.position.set(px, py + Math.sin(t * 1.3) * bob, pz);
    g.rotation.set(rx + Math.sin(t * 0.7) * 0.015 + speed * 0.05, ry, rz + Math.sin(t * 0.9) * 0.025 * (1 - land));
    g.scale.setScalar(sc);
    drone.gimbal.rotation.x = gim + Math.sin(t * 0.6) * 0.03;
    drone.update(s.dt, thr);
    drone.setLedPulse(t);

    // fog: the opening clears around the arriving drone; at night a bank rolls over the district
    // and lifts as the property is revealed; none once the flight is over
    const bank = film ? 0 : clamp01((T - 1.5) / 0.6) * (1 - clamp01((T - 2.45) / 0.4));   // the film has its own
    const amt = (lerp(1, 0.12, ein) * (1 - clamp01((T - 0.6) / 0.6)) + bank * 0.55) * (1 - esc);
    fogQuad.visible = !s.front && amt > 0.005;
    if (fogQuad.visible) {
      const fu = fogMat.uniforms;
      droneNdc.copy(g.position).project(camera);
      fu.uHole.value.set((droneNdc.x + 1) / 2, (droneNdc.y + 1) / 2);
      fu.uHoleR.value = lerp(0.0, 0.42, ein) * (1 - bank) + 0.3 * bank;
      fu.uAmt.value = amt; fu.uTime.value = t; fu.uAspect.value = aspect;
      camera.getWorldDirection(camDir);
      fu.uDrift.value.set(Math.atan2(camDir.x, -camDir.z) * 0.9, T * 0.35);
      fu.uCol.value.copy(fogC).lerp(BONE_C, 0.12);
    }
    // once the drone flies in front of the page the canvas is a clear layer and the sky is CSS
    sky.visible = !s.front && !film;
    if (s.front || film) renderer.setClearColor(0x000000, 0); else renderer.setClearColor(INK, 1);

    if (L) film ? L.hide() : L.tick(s, T, esc, f, g, v);

    // landing pad under the touchdown point
    pad.visible = land > 0.01;
    if (pad.visible) {
      pad.position.set(g.position.x, py - 0.42 * sc - 0.02, pz);
      pad.scale.setScalar(sc * lerp(1.6, 1, land));
      padMat.opacity = land * (lit > 0.5 ? 0.9 : 0.75) * (0.75 + 0.25 * Math.sin(t * 2.4));
    }

    renderer.render(scene, camera);
  }

  // the studio sky as CSS colour stops (top, middle, foot), matching the shader's gradient, for
  // the sky layer that sits behind the page once the canvas has moved in front of it
  const stop = new THREE.Color(), glowC = new THREE.Color(GLOW), add = new THREE.Color();
  function skyStops(lit) {
    const u = skyMat.uniforms;
    return [[0, 0], [0.43, 0], [0.97, 0.926]].map(([t, g]) =>
      '#' + stop.copy(u.uSTop.value).lerp(u.uSLow.value, t).add(add.copy(glowC).multiplyScalar(u.uSGlow.value * g)).lerp(BONE_C, lit).getHexString());
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.documentElement.classList.add('no-gl'); });

  return { update, resize, skyStops, renderer, camera, scene, info: () => renderer.info.render };
}

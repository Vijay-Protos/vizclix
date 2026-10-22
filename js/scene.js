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

// ---- camera / drone keyframes (catmull-rom through these) ----
// cam, look, pos, rot (pitch,yaw,roll), then fov, scale, throttle, gimbal pitch
const K = [
  { T: 0.0, cam: [0.0, 0.4, 7.4],  look: [-1.7, -0.1, 0],  pos: [0, 0, 0], rot: [0.10, -0.55, 0.05],   fov: 30, sc: 0.88, thr: 0.75, gim: -0.2 },
  { T: 0.5, cam: [0.6, 0.9, 7.0],  look: [-1.4, -0.2, 0],  pos: [0, 0, 0], rot: [0.08, -0.95, 0.0],    fov: 30, sc: 0.9, thr: 0.75, gim: -0.2 },
  { T: 1.0, cam: [0.0, 0.7, 9.2],  look: [-2.7, -1.1, 0],  pos: [0, 0, 0], rot: [0.05, -1.45, 0.0],    fov: 30, sc: 0.72, thr: 0.7,  gim: -0.1 },
  { T: 1.5, cam: [0.0, 1.0, 9.0],  look: [-2.4, -1.2, -1], pos: [0, 0, 0], rot: [0.10, -2.3, 0.0],     fov: 30, sc: 0.78, thr: 0.85, gim: -0.25 },
  { T: 2.0, cam: [0.0, 1.8, 7.0],  look: [0.0, -0.9, -4],  pos: [0, 0, 0], rot: [0.16, 3.1416, 0.0],   fov: 34, sc: 1.0,  thr: 1.0,  gim: -0.35 },
  { T: 2.4, cam: [3.6, 0.7, 6.0],  look: [0.0, -1.6, -3],  pos: [0, 0, 0], rot: [0.12, 3.1416, -0.08], fov: 34, sc: 1.0,  thr: 1.0,  gim: -0.5 },
  { T: 2.75, cam: [-5.4, 0.3, 8.2], look: [0.0, -2.3, -1.2], pos: [0, 0, 0], rot: [0.08, 3.5, 0.05],  fov: 35, sc: 1.0,  thr: 0.8,  gim: -0.95 },
  { T: 3.0, cam: [-6.4, 0.7, 8.6], look: [0.0, -2.1, 0],  pos: [0, 0, 0], rot: [0.03, 3.65, 0.0],    fov: 36, sc: 1.0,  thr: 0.6,  gim: -1.15 },
  // --- the escort: camera holds a studio view, the drone takes a station per section ---
  // Yaw is deliberate: the drone faces what it is looking at. Front is +Z, so y=0 faces the
  // reader, y=PI faces away, y=PI/2 points screen-right, y=3PI/2 points screen-left.
  { T: 3.4, cam: [-2.6, 0.5, 9.6], look: [0, -0.7, 0], pos: [1.4, 0.6, 0],  rot: [0.05, 3.95, 0.02],  fov: 35, sc: 0.78, thr: 0.8,  gim: -0.7 },
  { T: 4.0, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.7, 2.45, 0],   rot: [0.09, 4.50, -0.04], fov: 35, sc: 0.50, thr: 0.7,  gim: -0.65 }, // studio view: the page takes over the drone
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
  h *= smoothstep(12.0, 36.0, d);
  p.y += h * 4.2;
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
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uDay; uniform vec3 uFog;
uniform float uStudio; uniform float uLit;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float ahead = max(0.0, -d.z);
  // at and below the horizon the sky IS the fog, so the far edge of the ground never shows
  vec3 sky = mix(uFog, uTop, smoothstep(0.0, 0.28, h));
  sky += uGlow * 0.4 * smoothstep(-0.01, 0.015, h) * exp(-max(h, 0.0) * 16.0) * (0.3 + 0.7 * ahead * ahead);
  vec3 studio = mix(uTop, uHorizon * 0.5, smoothstep(0.3, -0.36, h)) + uGlow * 0.035 * smoothstep(0.0, -0.36, h);
  vec3 col = mix(mix(sky, studio, uStudio), uDay, uLit);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createWorld({ canvas, drone, quality }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  const FOG_C = new THREE.Color(HORIZON).lerp(new THREE.Color(GLOW), 0.07);
  const fogC = FOG_C.clone();
  scene.fog = new THREE.Fog(fogC, 16, 110);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
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
      uTop: { value: new THREE.Color(SKY_TOP) }, uHorizon: { value: new THREE.Color(HORIZON) },
      uGlow: { value: new THREE.Color(GLOW) }, uDay: { value: new THREE.Color(BONE) },
      uFog: { value: fogC }, uStudio: { value: 0 }, uLit: { value: 0 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat);
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

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
  const boxes = [
    [1.3, 4.4, 1.3, 0, 0, true], [1.0, 2.6, 1.0, -2.0, 0.6], [1.1, 3.3, 1.0, 2.1, -0.4],
    [0.9, 1.8, 0.9, -1.2, -2.0], [1.2, 2.2, 1.0, 1.4, -2.3], [2.6, 0.5, 1.3, 0.2, 2.3],
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

  // Far horizon: real aerial footage sitting behind the generated district, so the approach
  // happens over a living city. Loaded lazily and only where it is worth the bytes; without it
  // the scene still reads, because the district carries the skyline on its own.
  const backMat = new THREE.MeshBasicMaterial({ color: 0x79838f, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(250, 141), backMat);
  backdrop.position.set(0, 26, -74); backdrop.visible = false; backdrop.frustumCulled = false;
  pin.add(backdrop);
  let backReady = false;
  if (quality.video) {
    const vid = document.createElement('video');
    vid.src = 'assets/video/skyline-dusk.mp4';
    vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'auto';
    vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
    vid.addEventListener('canplay', () => {
      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace;
      backMat.map = tex; backMat.needsUpdate = true; backReady = true;
      vid.play().catch(() => { backReady = false; });
    }, { once: true });
    vid.addEventListener('error', () => { backReady = false; });
  }

  // A surrounding district, instanced so the whole city is one draw call. Generated rather than
  // downloaded: a stock low-poly kit would not sit in this light, and this way the massing,
  // density and window warmth are all art-directed.
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
    uniform vec3 uInk; uniform vec3 uWin; uniform vec3 uCool; uniform vec3 uFog; uniform float uFade; uniform float uLit; uniform float uNear;
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
      col = mix(uFog * 0.45, col, smoothstep(uNear, uNear + 23.0, vDist));
      float fog = smoothstep(16.0, 130.0, vDist);
      col = mix(col, uFog, fog * 0.85);
      gl_FragColor = vec4(mix(uFog, col, uFade), 1.0);
      #include <colorspace_fragment>
    }`;
  const cityCount = quality.city;
  const cityMat = new THREE.ShaderMaterial({
    vertexShader: CITY_VS, fragmentShader: CITY_FS,
    uniforms: {
      uInk: { value: new THREE.Color(0x0d1119) }, uWin: { value: new THREE.Color(0xffc79a) },
      uCool: { value: new THREE.Color(0x27303f) }, uFog: { value: fogC }, uFade: { value: 1 }, uLit: { value: 1 }, uNear: { value: 19 },
    },
  });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, cityCount);
  {
    const seeds = new Float32Array(cityCount);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    let n = 0, i = 0, guard = 0;
    const rnd = (() => { let x = 20261018; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    while (n < cityCount && guard++ < cityCount * 40) {
      // a loose street grid, with blocks left out so roads read through it
      const gx = Math.round((rnd() - 0.5) * 22), gz = Math.round((rnd() - 0.5) * 22);
      if (gx % 5 === 0 || gz % 7 === 0) continue;                 // avenues
      const x = gx * 5.2 + (rnd() - 0.5) * 1.8, z = gz * 5.2 + (rnd() - 0.5) * 1.8;
      const d = Math.hypot(x, z);
      if (d < 19 || d > 74) continue;                             // keep the hero property clear
      const near = 1 - Math.min(1, (d - 19) / 56);
      const h = 3 + rnd() * rnd() * 34 * (0.45 + near * 0.75);
      const w = 2.2 + rnd() * 3.4, dp = 2.2 + rnd() * 3.4;
      pos.set(x, h / 2, z); scl.set(w, h, dp);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.25);
      city.setMatrixAt(n, m.compose(pos, q, scl));
      seeds[n] = rnd() * 100;
      n++; i++;
    }
    city.count = n;
    city.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    city.instanceMatrix.needsUpdate = true;
  }
  city.frustumCulled = false;
  pin.add(city);

  // The payoff: the surveyed massing becomes a finished, lit building. Built in the same world
  // as everything else rather than a photograph dropped into it, so nothing collides.
  // uNear sits behind the camera: the district's near-distance dimming exists to hide towers
  // sweeping past the lens, and the property is the one building meant to be lit when close.
  const heroMat = new THREE.ShaderMaterial({
    vertexShader: CITY_VS, fragmentShader: CITY_FS,
    uniforms: {
      uInk: { value: new THREE.Color(0x151b24) }, uWin: { value: new THREE.Color(0xffd0a4) },
      uCool: { value: new THREE.Color(0x36425a) }, uFog: { value: fogC }, uFade: { value: 0 }, uLit: { value: 1 }, uNear: { value: -40 },
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

  // drifting dust for depth
  const dustN = quality.dust;
  const dpos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dpos[i * 3] = (Math.random() - .5) * 46; dpos[i * 3 + 1] = -5 + Math.random() * 12; dpos[i * 3 + 2] = -62 + Math.random() * 70; }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: BONE, size: 0.045, transparent: true, opacity: 0.35, sizeAttenuation: true, depthWrite: false }));
  dust.frustumCulled = false; scene.add(dust);

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

  // a warm pool of light that travels with the drone once it is escorting the page
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: GLOW, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.visible = false; scene.add(halo);

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const BONE_C = new THREE.Color(BONE);
  const wrapPI = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // a screen pixel → the point under it on the z = 0 plane the escort flies in
  const ray = new THREE.Vector3(), hit = new THREE.Vector3();
  function toPlane(x, y) {
    ray.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    hit.copy(camera.position).addScaledVector(ray, -camera.position.z / ray.z);
  }

  // s: { T, time, dt, light, dock }  — light 0..1 crossfades the world to the daylight section;
  // dock is the escort pose from the page: screen x/y and width in px, plus attitude and landing
  function update(s) {
    const T = Math.min(4, Math.max(0, s.T));
    const v = sample(T);
    const f = clamp01(T - 2);                 // the flight, 0 → 1
    const esc = clamp01((T - 3) / 0.35);      // hand-over from flight to escort
    const d = s.dock;
    const land = d ? d.land : 0;              // descent onto the pad
    const portrait = aspect < 0.9;
    const scrollZ = T < 2 ? T * 6 : 12 + f * 78;

    // the landscape dissolves once the flight is over; only the drone carries on
    tmat.uniforms.uScroll.value = scrollZ;
    tmat.uniforms.uTime.value = s.time;
    tmat.uniforms.uFade.value = 1 - esc;
    terrain.visible = esc < 1;
    pin.position.set(0, -6, pinT.y + scrollZ);
    const reveal = clamp01((T - 2.5) / 0.45) * (1 - esc);   // survey → finished image
    pin.visible = esc < 1 && pin.position.z > -120;
    heroMesh.visible = reveal > 0.01;
    heroMat.uniforms.uFade.value = reveal * (1 - esc);
    // the horizon rises as we approach, then gives way to the finished frame
    const horizon = clamp01((T - 1.3) / 0.8) * (1 - reveal) * (1 - esc);
    backdrop.visible = backReady && horizon > 0.01;
    backMat.opacity = horizon * 0.95;
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
    dust.position.z = scrollZ % 70;
    dust.material.opacity = 0.35 * (1 - esc);
    dust.visible = esc < 1;

    // daylight section: the sky, the fog and the exposure all cross over
    const lit = s.light || 0;
    skyMat.uniforms.uStudio.value = esc;
    skyMat.uniforms.uLit.value = lit;
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
    g.position.set(px, py + Math.sin(t * 1.3) * bob, pz);
    g.rotation.set(rx + Math.sin(t * 0.7) * 0.015 + speed * 0.05, ry, rz + Math.sin(t * 0.9) * 0.025 * (1 - land));
    g.scale.setScalar(sc);
    drone.gimbal.rotation.x = gim + Math.sin(t * 0.6) * 0.03;
    drone.update(s.dt, thr);
    drone.setLedPulse(t);

    halo.visible = esc > 0.01 && lit < 0.98;
    if (halo.visible) {
      halo.position.set(px, py, pz - 1.5);
      halo.scale.setScalar(sc * 7.5);
      halo.material.opacity = 0.2 * esc * (1 - lit);
    }

    // ground scanner: only over the property, during the flight
    const scanOn = (1 - esc) * clamp01((T - 1.4) / 0.6);
    scan.visible = scanOn > 0.01;
    if (scan.visible) {
      scan.position.set(g.position.x, -5.97, g.position.z);
      scan.scale.setScalar(v[13] * (1 + Math.sin(t * 1.6) * 0.03));
      sMat.opacity = (0.45 + 0.2 * Math.sin(t * 2.0)) * scanOn;
    }

    // landing pad under the touchdown point
    pad.visible = land > 0.01;
    if (pad.visible) {
      pad.position.set(g.position.x, py - 0.42 * sc - 0.02, pz);
      pad.scale.setScalar(sc * lerp(1.6, 1, land));
      padMat.opacity = land * (lit > 0.5 ? 0.9 : 0.75) * (0.75 + 0.25 * Math.sin(t * 2.4));
    }

    renderer.render(scene, camera);
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.documentElement.classList.add('no-gl'); });

  return { update, resize, renderer, camera, scene, info: () => renderer.info.render };
}

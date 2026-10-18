// VizClix 3D world: contour terrain, wireframe property, camera rig driven by one timeline value T.
// T 0–1 hero · 1–2 intro · 2–3 the flight. From 3 the camera parks in a studio view and the drone
// itself travels: it escorts the reader down the page and lands at the enquiry form (T 9).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const INK = 0x0a0b0d;
const BONE = 0xede8df;
const EMBER = 0xff6b35;

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
  { T: 4.0, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.7, 2.45, 0],   rot: [0.09, 4.50, -0.04], fov: 35, sc: 0.50, thr: 0.7,  gim: -0.65 }, // Work: turned in, looking down over the grid
  { T: 4.5, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.8, 2.35, 0],   rot: [0.06, 4.75, 0.03],  fov: 35, sc: 0.46, thr: 0.65, gim: -0.55 },
  { T: 5.0, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.85, 0.7, 0],   rot: [0.05, 4.95, 0.04],  fov: 35, sc: 0.44, thr: 0.7,  gim: -0.4 },  // Services: nose to the list, descending it
  { T: 5.6, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.7, -2.25, .4], rot: [0.08, 5.40, -0.03], fov: 35, sc: 0.50, thr: 0.75, gim: -0.3 },
  { T: 6.0, cam: [0, .3, 10], look: [0, .2, 0], pos: [5.4, -1.3, 1.0], rot: [0.16, 6.00, 0.04], fov: 35, sc: 0.50, thr: 0.8,  gim: -0.25 }, // Perspective: a glimpse at the edge
  { T: 6.6, cam: [0, 0, 10], look: [0, 0, 0], pos: [1.7, -2.0, 0.8], rot: [0.17, 6.85, -0.02], fov: 35, sc: 0.88, thr: 0.75, gim: -0.3 },  // daylight reveal, turned to face the reader
  { T: 7.0, cam: [0, 0, 10], look: [0, 0, 0], pos: [-4.7, -2.5, 0],  rot: [0.04, 7.854, 0.06], fov: 35, sc: 0.42, thr: 0.9,  gim: -0.2 },  // Process: nose screen-right, a playhead
  { T: 7.4, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.6, -2.5, 0],   rot: [0.04, 7.854, -0.06], fov: 35, sc: 0.42, thr: 0.9, gim: -0.2 },  // ...holding that heading as it crosses
  { T: 7.8, cam: [0, 0, 10], look: [0, 0, 0], pos: [6.0, 1.2, -0.5],  rot: [0.05, 8.60, 0.03],  fov: 35, sc: 0.32, thr: 0.7,  gim: -0.3 },  // Partner: stands off at the margin
  { T: 8.2, cam: [0, 0, 10], look: [0, 0, 0], pos: [6.0, -1.4, -1],  rot: [0.04, 9.00, -0.05], fov: 35, sc: 0.30, thr: 0.6,  gim: -0.2 },  // Proof: quiet
  { T: 8.6, cam: [0, 0, 10], look: [0, 0, 0], pos: [4.8, 2.45, -2.2], rot: [0.03, 9.30, 0.02], fov: 35, sc: 0.32, thr: 0.5,  gim: -0.25 }, // FAQ: withdrawn
  { T: 9.0, cam: [0, 0, 10], look: [0, 0, 0], pos: [-4.6, -0.9, 0],  rot: [0.05, 10.4, 0.0],   fov: 35, sc: 0.44, thr: 0.6,  gim: -0.4 },  // Contact: returns, turning to face the reader
  { T: 9.4, cam: [0, -.4, 10], look: [0, -.5, 0], pos: [-4.1, -1.9, .4],  rot: [0.0, 11.6, 0.0], fov: 35, sc: 0.6, thr: 0.22, gim: -0.1 }, // touchdown
  { T: 9.7, cam: [0, -.4, 10], look: [0, -.5, 0], pos: [-4.1, -2.12, .4], rot: [0.0, 12.0, 0.0], fov: 35, sc: 0.6, thr: 0.0,  gim: 0.0 },  // landed, facing you
];
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
const TERRAIN_FS = /* glsl */ `
uniform vec3 uInk; uniform vec3 uBone; uniform vec3 uEmber; uniform vec3 uAlt;
uniform vec2 uPin; uniform float uTime; uniform float uFade;
varying float vH; varying vec2 vTp; varying float vDist;
float lineAA(float v, float w){ float f = abs(fract(v - .5) - .5) / max(fwidth(v), 1e-4); return 1.0 - clamp(f / w, 0.0, 1.0); }
void main(){
  float fogF = smoothstep(14.0, 96.0, vDist);
  float lv = vH * 15.0;
  float relief = smoothstep(0.0015, 0.02, fwidth(lv)); // no contour lines on the flat plateau
  float contour = (lineAA(lv, 1.0) * 0.20 + lineAA(lv / 5.0, 1.2) * 0.34) * relief;
  float gx = lineAA(vTp.x / 12.0, 1.0), gz = lineAA(vTp.y / 12.0, 1.0);
  float g2x = lineAA(vTp.x / 3.0, 1.0), g2z = lineAA(vTp.y / 3.0, 1.0);
  float closeness = 1.0 - smoothstep(6.0, 42.0, length(vTp - uPin));
  float grid = max(gx, gz) * 0.16 + max(g2x, g2z) * 0.07 * closeness;
  float r = length(vTp - uPin);
  float rr = abs(fract((r - uTime * 3.2) / 9.0) - .5);
  float ring = (1.0 - smoothstep(0.0, 0.035, rr)) * (1.0 - smoothstep(10.0, 46.0, r));
  float glow = exp(-r * 0.075);
  vec3 col = uInk + vH * 0.012;
  col = mix(col, uBone, contour * (1.0 - fogF));
  col = mix(col, uAlt, grid * (1.0 - fogF));
  col += uEmber * (ring * 0.55 + glow * 0.10) * (1.0 - fogF * .7);
  col = mix(col, uInk, fogF);
  col = mix(uInk, col, uFade); // dissolves into the ground colour once the flight is over
  gl_FragColor = vec4(col, 1.0);
}`;

export function createWorld({ canvas, drone, quality }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.Fog(INK, 16, 96);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;

  // light: warm rim from behind, cool fill from the front-left
  const rim = new THREE.DirectionalLight(0xffb48a, 2.4); rim.position.set(5, 3, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9db7d6, 0.9); fill.position.set(-5, 2, 5); scene.add(fill);
  const top = new THREE.DirectionalLight(0xffffff, 1.0); top.position.set(0, 8, 2); scene.add(top);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  // terrain
  const seg = quality.seg;
  const tgeo = new THREE.PlaneGeometry(420, 420, seg, seg); tgeo.rotateX(-Math.PI / 2);
  const pinT = new THREE.Vector2(0, -90);
  const tmat = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
    uniforms: {
      uScroll: { value: 0 }, uPin: { value: pinT }, uTime: { value: 0 }, uFade: { value: 1 },
      uInk: { value: new THREE.Color(INK) }, uBone: { value: new THREE.Color(BONE) },
      uEmber: { value: new THREE.Color(EMBER) }, uAlt: { value: new THREE.Color(0x7c93ad) },
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

  // The payoff: the wireframe survey resolves into a real finished image of the property.
  // Soft-edged so it reads as a frame emerging, not a photo pasted on the scene.
  const PLATE_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const PLATE_FS = `
    uniform sampler2D uMap; uniform float uAmt; uniform vec3 uInk; varying vec2 vUv;
    void main(){
      vec2 d = abs(vUv - 0.5) * 2.0;
      float edge = (1.0 - smoothstep(0.55, 1.0, d.x)) * (1.0 - smoothstep(0.6, 1.0, d.y));
      // the image develops from the centre outwards as the drone arrives
      float develop = smoothstep(0.0, 1.0, uAmt * 1.9 - length(vUv - 0.5) * 1.1);
      vec3 c = texture2D(uMap, vUv).rgb;
      float a = edge * develop;
      if (a < 0.004) discard;
      gl_FragColor = vec4(mix(uInk, c, clamp(develop + 0.15, 0.0, 1.0)), a);
    }`;
  const plateMat = new THREE.ShaderMaterial({
    vertexShader: PLATE_VS, fragmentShader: PLATE_FS, transparent: true, depthWrite: false,
    uniforms: { uMap: { value: null }, uAmt: { value: 0 }, uInk: { value: new THREE.Color(INK) } },
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 9.25), plateMat);
  plate.position.set(1.9, 1.5, 1.2); plate.visible = false; pin.add(plate);
  new THREE.TextureLoader().load(
    'assets/work/mahavir-springs-thane.jpg',
    (tex) => { tex.colorSpace = THREE.SRGBColorSpace; plateMat.uniforms.uMap.value = tex; },
    undefined,
    () => { /* no plate if the image cannot load; the wireframe reveal still reads */ },
  );

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

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  // A phone has no empty margin to park in, so the escort becomes three beats: the flight,
  // the daylight reveal and the landing. Between them the drone waits off the edge.
  function phoneBeat(T) {
    if (T < 3.3) return 1;
    const reveal = clamp01((T - 6.3) / 0.3) * (1 - clamp01((T - 6.62) / 0.22));
    return Math.max(reveal, clamp01((T - 8.85) / 0.4));
  }
  const bg = new THREE.Color();
  const INK_C = new THREE.Color(INK), BONE_C = new THREE.Color(BONE);

  // s: { T, time, dt, light }  — light 0..1 crossfades the world to the daylight section
  function update(s) {
    const T = Math.min(9.7, Math.max(0, s.T));
    const v = sample(T);
    const f = clamp01(T - 2);                 // the flight, 0 → 1
    const esc = clamp01((T - 3) / 0.35);      // hand-over from flight to escort
    const land = clamp01((T - 9.05) / 0.45);  // descent onto the pad
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
    plate.visible = reveal > 0.01 && plateMat.uniforms.uMap.value !== null;
    plateMat.uniforms.uAmt.value = reveal;
    fillMat.opacity = 1 - reveal * 0.85;
    edgeMat.opacity = 0.6 * (1 - esc) * (1 - reveal * 0.45);
    edgeHot.opacity = (1 - esc) * (1 - reveal * 0.25);
    beam.material.opacity = 0.55 * (1 - esc) * (1 - reveal);
    baseRing.material.opacity = 0.8 * (1 - esc);
    dust.position.z = scrollZ % 70;
    dust.material.opacity = 0.35 * (1 - esc);
    dust.visible = esc < 1;

    // daylight section: the page ground, the fog and the exposure all cross over
    const lit = s.light || 0;
    bg.copy(INK_C).lerp(BONE_C, lit);
    renderer.setClearColor(bg, 1);
    scene.background = null;
    scene.fog.color.copy(bg);
    renderer.toneMappingExposure = lerp(1.05, 0.82, lit);
    scene.environmentIntensity = lerp(0.75, 1.15, lit);
    rim.intensity = lerp(2.4, 1.5, lit);
    fill.intensity = lerp(0.9, 1.6, lit);

    // camera
    camera.position.set(v[0], v[1], v[2]);
    const dropY = -1.25 * (1 - esc);
    if (portrait) look.set(lerp(v[3], v[6], 0.9 * (1 - esc)), lerp(v[4], v[7], 0.3) + dropY, lerp(v[5], v[8], 0.95 * (1 - esc)));
    else look.set(v[3], v[4], v[5]);
    camera.fov = v[12] * (portrait ? lerp(1.7, 1.15, esc) : 1);
    camera.updateProjectionMatrix();
    camera.lookAt(look);

    // drone: station pose plus idle life. Narrow screens pull the stations inward.
    const g = drone.group;
    const t = s.time;
    const bob = lerp(0.06, 0.02, land);
    const speed = T > 2 && T < 3.2 ? 1 - f * 0.4 : 0.15;
    let px = v[6], py = v[7], pscale = 1;
    if (portrait && esc > 0) {
      const halfW = Math.tan((camera.fov * Math.PI) / 360) * Math.max(1, v[2] - v[8]) * aspect;
      const side = v[6] < 0 ? -1 : 1;
      const beat = phoneBeat(T);
      px = lerp(v[6], lerp(side * halfW * 2.4, side * halfW * 0.58, beat), esc);
      py = lerp(v[7], v[7] * 0.7, esc);
      pscale = lerp(1, 0.74, esc);
    }
    g.position.set(px, py + Math.sin(t * 1.3) * bob, v[8]);
    g.rotation.set(v[9] + Math.sin(t * 0.7) * 0.015 + speed * 0.05, v[10], v[11] + Math.sin(t * 0.9) * 0.025 * (1 - land));
    const sc = v[13] * pscale;
    g.scale.setScalar(sc);
    drone.gimbal.rotation.x = v[15] + Math.sin(t * 0.6) * 0.03;
    drone.update(s.dt, v[14]);
    drone.setLedPulse(t);

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
      pad.position.set(g.position.x, py - 0.42 * sc - 0.02, v[8]);
      pad.scale.setScalar(sc * lerp(1.6, 1, land));
      padMat.opacity = land * (lit > 0.5 ? 0.9 : 0.75) * (0.75 + 0.25 * Math.sin(t * 2.4));
    }

    renderer.render(scene, camera);
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.documentElement.classList.add('no-gl'); });

  return { update, resize, renderer, camera, scene, info: () => renderer.info.render };
}

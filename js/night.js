/* The night city behind sections 1-5, drawn in code in place of the film.

   One shot, cut from the moves the page sells: a slow orbit over the city at the hero, a wide
   establishing pass for "The Setting", low down the boulevard with the blocks sliding past for
   "The Approach" (a parallax push), then rising over the last roofs to reveal the property's two
   towers for "The Frame". The camera is keyed to the same scroll timeline T the drone flies on;
   the drone itself is drawn by scene.js on the canvas in front of this one.

   Blocks are one instanced mesh; windows, street lights and traffic are painted in the shaders.
   It redraws when the shot moves, and a few times a second for the city's own life. */
import * as THREE from 'three';

const INK = 0x0a0b0d, EMBER = 0xff6b35;
const SKY_TOP = 0x05080d, HORIZON = 0x0e1520, GLOW = 0x2a1a17;

// The shot. T: scroll timeline (1.85-3 = the three flight chapters). cam/look in world units.
const SHOT = [
  { T: 0.0,  cam: [-34, 24, 40], look: [-12, 0, -2] },    // hero: high over the city, the property off to the right
  { T: 1.0,  cam: [-22, 17, 34], look: [-8, 1, -6] },     // orbit continues as the intro reads
  { T: 1.85, cam: [16, 15, 30],  look: [0, 1, -12] },     // The Setting: wide, the whole district
  { T: 2.05, cam: [9, 9, 26],    look: [0, 1.5, -14] },   // dropping toward the boulevard
  { T: 2.32, cam: [0.2, 1.9, 22], look: [0.2, 2.2, -12] },// The Approach: low, down the street
  { T: 2.42, cam: [0.2, 1.7, 12], look: [0.2, 2.6, -14] },// the push: blocks slide past
  { T: 2.66, cam: [-6, 4.5, 6],  look: [-3.5, 4.2, -12] }, // The Frame: rising over the last roofs
  { T: 2.76, cam: [-10, 8, 7],   look: [-4.5, 4.6, -12] },
  { T: 3.0,  cam: [-14, 11, 9],  look: [-5.5, 4.4, -12] }, // the towers framed right, copy and drone left
];
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
function shotAt(T, cam, look, portrait) {
  const last = SHOT.length - 1;
  T = Math.min(SHOT[last].T, Math.max(0, T));
  let i = 0;
  while (i < last - 1 && T > SHOT[i + 1].T) i++;
  const t = (T - SHOT[i].T) / (SHOT[i + 1].T - SHOT[i].T);
  const a = SHOT[Math.max(0, i - 1)], b = SHOT[i], c = SHOT[i + 1], d = SHOT[Math.min(last, i + 2)];
  for (let k = 0; k < 3; k++) {
    cam.setComponent(k, cr(a.cam[k], b.cam[k], c.cam[k], d.cam[k], t));
    look.setComponent(k, cr(a.look[k], b.look[k], c.look[k], d.look[k], t));
  }
  // on a tall phone screen the copy fills the lower half: tilt the opening down so the city
  // and the property sit up beside the drone instead of behind the headline
  if (portrait) look.y -= 9 * (1 - Math.min(1, Math.max(0, (T - 0.8) / 1.0)));
  // and at the reveal, swing toward the towers so both stand inside the narrow frame
  if (portrait) look.x += 3.2 * Math.min(1, Math.max(0, (T - 2.5) / 0.4));
}

const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

// shared GLSL: night haze toward the horizon, so the far city sinks into the dark, not into mist
const HAZE = /* glsl */`
  uniform vec3 uHaze; uniform float uFade;
  vec3 haze(vec3 c, float d) { return mix(c, uHaze, smoothstep(45.0, 160.0, d) * 0.9); }`;

const BLOCK_VS = /* glsl */`
  attribute vec3 aBox;     // x, z, height
  attribute float aSeed;
  varying vec3 vP; varying vec3 vN; varying float vSeed; varying float vH; varying float vD;
  void main() {
    vec3 p = position;
    p.y *= aBox.z;
    p.xz += aBox.xy;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vP = w.xyz; vN = normal; vSeed = aSeed; vH = aBox.z;
    vec4 mv = viewMatrix * w; vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const BLOCK_FS = /* glsl */`
  ${HAZE}
  uniform float uTime;
  varying vec3 vP; varying vec3 vN; varying float vSeed; varying float vH; varying float vD;
  float h1(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  void main() {
    vec3 c;
    if (vN.y > 0.5) {
      c = vec3(0.016, 0.018, 0.023);                        // roofs: near black
    } else {
      // walls catch a cool moonlight on one side, warmer city bounce on the other
      c = abs(vN.x) > 0.5 ? vec3(0.011, 0.014, 0.02) : vec3(0.018, 0.015, 0.017);
      // windows: floors 0.25 high, bays 0.2 wide; a sparse, steady scatter of lit rooms
      float along = abs(vN.x) > 0.5 ? vP.z : vP.x;
      vec2 cell = vec2(floor(along * 5.0), floor(vP.y * 4.0));
      vec2 f = vec2(fract(along * 5.0), fract(vP.y * 4.0));
      float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78) * step(0.3, vP.y) * step(vP.y, vH - 0.15);
      float r = h1(vec3(cell + vSeed * 517.0, vSeed * 131.0));
      float lit = step(r, 0.16) * win;
      // a few rooms switch on and off over the evening
      lit *= step(0.02, fract(r * 13.0 + floor(uTime * 0.25 + r * 7.0) * 0.618));
      vec3 warm = mix(vec3(1.0, 0.72, 0.45), vec3(1.0, 0.86, 0.66), fract(r * 7.0));
      vec3 cool = vec3(0.62, 0.74, 0.92);
      c = mix(c, (fract(r * 31.0) < 0.22 ? cool : warm) * (0.55 + 0.45 * fract(r * 17.0)), lit);
    }
    c = haze(c, vD);
    gl_FragColor = vec4(c * uFade, 1.0);
    #include <colorspace_fragment>
  }`;

const GROUND_FS = /* glsl */`
  ${HAZE}
  uniform float uTime;
  varying vec3 vP; varying float vD;
  void main() {
    vec3 c = vec3(0.006, 0.007, 0.009);
    // streets every five blocks: asphalt a shade lighter, sodium lamps along the kerbs
    vec2 g = abs(fract((vP.xz + 0.5) / 5.0 + 0.5) - 0.5) * 5.0;       // distance to street centre lines
    float street = 1.0 - smoothstep(0.38, 0.5, min(g.x, g.y));
    c = mix(c, vec3(0.015, 0.015, 0.018), street);
    vec2 lamp = fract(vP.xz * 1.0);
    float kerb = (1.0 - smoothstep(0.3, 0.45, abs(min(g.x, g.y) - 0.38)));
    float dots = smoothstep(0.12, 0.0, length(lamp - 0.5));
    c += vec3(1.0, 0.55, 0.25) * dots * kerb * 0.55;
    // traffic: head and tail lights drifting along the streets
    float lane = 1.0 - smoothstep(0.05, 0.12, abs(min(g.x, g.y) - 0.18));
    float along = g.x < g.y ? vP.z : vP.x;
    float car = smoothstep(0.86, 1.0, fract(along * 0.35 + uTime * 0.12 + floor(vP.x * 0.2 + vP.z * 0.2) * 0.37));
    c += mix(vec3(1.0, 0.25, 0.15), vec3(1.0, 0.9, 0.75), step(0.5, fract(along * 0.05))) * car * lane * street * 0.8;
    c = haze(c, vD);
    gl_FragColor = vec4(c * uFade, 1.0);
    #include <colorspace_fragment>
  }`;
const GROUND_VS = /* glsl */`
  varying vec3 vP; varying float vD;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;

const SKY_VS = /* glsl */`varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
  uniform vec3 uTop, uHor, uGlow; uniform float uFade; varying vec3 vDir;
  void main() {
    float y = clamp(vDir.y, -0.2, 1.0);
    vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.45, y));
    c += uGlow * exp(-abs(y) * 22.0);                        // a thin line of city glow on the horizon
    gl_FragColor = vec4(c * uFade, 1.0);
    #include <colorspace_fragment>
  }`;

const TOWER_FS = /* glsl */`
  ${HAZE}
  uniform vec3 uEmber; uniform float uTime, uHeight;
  varying vec3 vP; varying vec3 vN; varying float vD;
  void main() {
    vec3 c = vN.y > 0.5 ? vec3(0.02, 0.02, 0.024) : (abs(vN.x) > 0.5 ? vec3(0.014, 0.016, 0.022) : vec3(0.02, 0.018, 0.02));
    if (vN.y < 0.5) {
      // the property: evenly lit floors, a warm band at every fourth, an ember crown at the top
      float fl = fract(vP.y * 4.0);
      float along = abs(vN.x) > 0.5 ? vP.z : vP.x;
      float bay = step(0.18, fract(along * 5.0)) * step(fract(along * 5.0), 0.82);
      float win = bay * step(0.28, fl) * step(fl, 0.8) * step(0.3, vP.y);
      float rr = fract(sin(dot(vec2(floor(along * 5.0), floor(vP.y * 4.0)), vec2(12.9898, 78.233))) * 43758.5453);
      c = mix(c, vec3(1.0, 0.8, 0.58) * (0.45 + 0.4 * rr), win * step(0.22, rr));
      float crown = smoothstep(uHeight - 0.55, uHeight - 0.45, vP.y);
      c = mix(c, uEmber, crown * 0.95);
    } else {
      c = mix(c, uEmber, 0.35);
    }
    c = haze(c, vD);
    gl_FragColor = vec4(c * uFade, 1.0);
    #include <colorspace_fragment>
  }`;

export function createNight(canvas, { reduce = false, small = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.25 : 1.5));
  renderer.setClearColor(INK, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  // the far ground fades into exactly the sky's horizon colour, so there is no seam between them
  const common = { uHaze: { value: new THREE.Color(HORIZON).add(new THREE.Color(GLOW)) }, uFade: { value: 0 }, uTime: { value: 0 } };

  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color(SKY_TOP) }, uHor: { value: new THREE.Color(HORIZON) }, uGlow: { value: new THREE.Color(GLOW) }, uFade: common.uFade },
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // ground with the street grid
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    vertexShader: GROUND_VS, fragmentShader: GROUND_FS, uniforms: common,
  }));
  scene.add(ground);

  // the city: one block per cell, streets every fifth row and column through x = 0 and z = 0
  const half = small ? 24 : 34;
  const boxes = [], seeds = [];
  for (let x = -half; x <= half; x++) for (let z = -half - 20; z <= half; z++) {
    if (x % 5 === 0 || z % 5 === 0) continue;                                  // streets
    if (Math.abs(x) <= 4 && z <= -9 && z >= -16) continue;                       // the property's plot
    const r = hash(x, z);
    if (r < 0.08) continue;                                                      // the odd open lot
    // a denser, taller downtown off to one side; low rise everywhere else, lower with distance
    const dt = Math.exp(-((x + 14) ** 2 + (z + 20) ** 2) / 220);
    const far = Math.max(0.35, 1 - Math.hypot(x, z + 10) / (half * 1.3));
    const h = (0.35 + 1.6 * r * r + 4.2 * dt * hash(z, x)) * far;
    boxes.push(x, z, Math.max(0.2, h));
    seeds.push(hash(x * 3.1, z * 1.7));
  }
  const unit = new THREE.BoxGeometry(0.86, 1, 0.86).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = unit.index;
  geo.setAttribute('position', unit.getAttribute('position'));
  geo.setAttribute('normal', unit.getAttribute('normal'));
  geo.setAttribute('aBox', new THREE.InstancedBufferAttribute(new Float32Array(boxes), 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  geo.instanceCount = seeds.length;
  const city = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS, uniforms: common }));
  city.frustumCulled = false;
  scene.add(city);

  // the property: two towers at the end of the boulevard (x = 0), the shot's destination
  const towerVS = /* glsl */`varying vec3 vP; varying vec3 vN; varying float vD;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const towers = [[-1.3, -12.6, 1.7, 7.2], [1.6, -11.2, 1.5, 6.0]].map(([x, z, w, h]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w).translate(0, h / 2, 0), new THREE.ShaderMaterial({
      vertexShader: towerVS, fragmentShader: TOWER_FS,
      uniforms: { ...common, uEmber: { value: new THREE.Color(EMBER) }, uHeight: { value: h } },
    }));
    m.position.set(x, 0, z);
    scene.add(m);
    return m;
  });
  // aircraft-warning beacons on the tower tops
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true });
  const beacons = towers.map((t) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), beaconMat);
    b.position.set(t.position.x, t.geometry.parameters.height + 0.1, t.position.z);
    scene.add(b);
    return b;
  });

  const cam = new THREE.Vector3(), look = new THREE.Vector3();
  let w = 0, h = 0, lastT = -1, lastPaint = 0, born = performance.now();
  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // phones are tall: widen the lens so the city still reads as a city
    camera.fov = w / h < 0.8 ? 58 : 38;
    camera.updateProjectionMatrix();
    lastT = -1;
  }
  resize();
  addEventListener('resize', resize);

  /** T: the page's scroll timeline. Repaints only when the shot moves or the city's life ticks. */
  function draw(T) {
    const now = performance.now();
    const fade = reduce ? 1 : Math.min(1, (now - born) / 900);
    const moved = Math.abs(T - lastT) > 1e-4;
    if (!moved && fade >= 1 && now - lastPaint < (reduce ? 1e9 : 90)) return;   // ~11 fps idle life
    lastT = T; lastPaint = now;
    common.uFade.value = fade;
    common.uTime.value = reduce ? 0 : now / 1000;
    beaconMat.opacity = reduce ? 1 : 0.25 + 0.75 * (Math.sin(now / 420) > 0.6 ? 1 : 0);
    shotAt(reduce ? 0 : T, cam, look, w / h < 0.8);
    camera.position.copy(cam);
    camera.lookAt(look);
    renderer.render(scene, camera);
  }
  return { draw, resize, get size() { return seeds.length; } };
}

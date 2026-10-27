/* The ground beneath the Perspective section: the site seen from the drone.
   A field of blocks laid out as a plan, streets between them and the property's two towers in
   the middle. Scrolling raises the plan into buildings ("a plan shows the flat, we show the
   address"); the drone's rotor wash and the visitor's pointer send ripples across it.

   One instanced mesh on its own canvas inside the section, so the cards sit above it while the
   drone's canvas stays in front of the page. It draws only while the section is on screen and
   something is moving, and holds a still, fully raised frame when motion is reduced. */
import * as THREE from 'three';

const SIM_HZ = 60, STEP = 1 / SIM_HZ;
const C2 = 0.18;            // wave speed squared, in cells per step (stable below 0.5)
const KEEP = 0.972;         // velocity kept per step: ripples travel a few blocks, then die
const RELAX = 0.996;        // pull back toward rest, so the plan always settles flat
const EPS = 6e-4;

const vert = /* glsl */`
  attribute vec2 aCell;      // grid position
  attribute float aBase;     // building height when fully raised
  attribute float aWave;     // ripple height
  attribute float aOwn;      // 1 on the property's towers
  uniform float uRise, uAmp;
  varying vec3 vN;
  varying float vWave, vOwn, vTop;
  void main() {
    vec3 p = position;
    float top = aBase * uRise + aWave * uAmp;
    p.y = p.y > 0.0 ? top : -12.0;         // deep columns: troughs never show an underside
    p.xz += aCell;
    vN = normal; vWave = aWave; vOwn = aOwn; vTop = top;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const frag = /* glsl */`
  uniform vec3 uTop, uLeft, uRight, uEmber;
  uniform float uRise;
  varying vec3 vN;
  varying float vWave, vOwn, vTop;
  void main() {
    vec3 c = vN.y > 0.5 ? uTop : (abs(vN.x) > 0.5 ? uLeft : uRight);
    // sunk tiles shade, so a trough reads as depth rather than a gap
    if (vN.y > 0.5) c = mix(c, uLeft, clamp(-vTop * 1.4, 0.0, 0.7));
    // the property: an ember roof that warms as it rises
    if (vOwn > 0.5) c = vN.y > 0.5 ? mix(c, uEmber, 0.35 + 0.6 * uRise) : mix(c, uLeft, 0.35);
    // a moving crest catches the light
    c = mix(c, uEmber, clamp(abs(vWave) * 0.9, 0.0, 0.6) * (vN.y > 0.5 ? 0.07 : 0.14));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

// a fixed scatter, so the town is the same on every visit
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

export function createCubes(canvas, { reduce = false, colors } = {}) {
  const col = { top: '#EDE8DF', left: '#D9D2C5', right: '#E4DED3', ember: '#FF6B35', ...colors };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
  camera.position.set(10, 10, 10);           // the isometric diagonal
  camera.lookAt(0, 0, 0);

  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      uRise: { value: reduce ? 1 : 0 }, uAmp: { value: 0.55 },
      uTop: { value: new THREE.Color(col.top) }, uLeft: { value: new THREE.Color(col.left) },
      uRight: { value: new THREE.Color(col.right) }, uEmber: { value: new THREE.Color(col.ember) },
    },
  });

  let n = 0, h, v, prev, mesh = null, waveAttr = null, cellPx = 80;
  function build(size) {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    n = size;
    h = new Float32Array(n * n); v = new Float32Array(n * n); prev = new Float32Array(n * n);
    const box = new THREE.BoxGeometry(0.94, 1, 0.94).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index;
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('normal', box.getAttribute('normal'));
    const cell = new Float32Array(n * n * 2), base = new Float32Array(n * n), own = new Float32Array(n * n);
    const half = (n - 1) / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = i * n + j, x = i - half, z = j - half;
      cell[k * 2] = x; cell[k * 2 + 1] = z;
      const bi = Math.round(x), bj = Math.round(z);
      // the property: two towers on the central plot
      // two slender towers side by side on screen: (0,0) and its right-hand neighbour (1,-1)
      const t1 = bi === 0 && bj === 0, t2 = bi === 1 && bj === -1;
      if (t1 || t2) { base[k] = t1 ? 1.5 : 1.15; own[k] = 1; continue; }
      // streets every fifth row and column; the central plot stays open ground around the towers
      const street = ((bi % 4) + 4) % 4 === 3 || ((bj % 4) + 4) % 4 === 3;
      if (street || (Math.abs(bi) <= 2 && Math.abs(bj) <= 2)) { base[k] = 0; continue; }
      // blocks: mostly low, the odd mid-rise, lower with distance so the towers lead
      const r = hash(bi, bj), d = Math.hypot(bi, bj);
      base[k] = (r < 0.7 ? 0.12 + r * 0.3 : 0.4 + (r - 0.7) * 1.4) * Math.max(0.3, 1 - d / 22);
    }
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    g.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 1));
    g.setAttribute('aOwn', new THREE.InstancedBufferAttribute(own, 1));
    waveAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * n), 1);
    waveAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aWave', waveAttr);
    g.instanceCount = n * n;
    mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  let w = 0, ht = 0, dirty = true, focus = null;
  function resize() {
    w = canvas.clientWidth; ht = canvas.clientHeight;
    if (!w || !ht) return;
    // phones get bigger blocks: fewer of them, and still legible as buildings
    cellPx = w < 700 ? 58 : w < 1200 ? 72 : 84;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(w, ht, false);
    const unit = cellPx / Math.SQRT2;          // a tile's top spans cellPx across the screen
    // the property stands in the open space beside the copy, not under it
    const fx = focus ? focus.x : w * 0.76, fy = focus ? focus.y : ht * 0.47;
    camera.left = -fx / unit; camera.right = (w - fx) / unit;
    camera.top = fy / unit; camera.bottom = -(ht - fy) / unit;
    camera.updateProjectionMatrix();
    const need = (Math.ceil((w + 2 * ht) * 1.6 / cellPx) + 6) | 1;   // odd: the property sits on a cell
    if (need !== n) build(need);
    dirty = true;
  }

  // screen point (in the canvas) → grid cell, through the ground plane
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function toGrid(x, y) {
    ndc.set((x / w) * 2 - 1, -(y / ht) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(ground, hit)) return null;
    const half = (n - 1) / 2;
    return { i: hit.x + half, j: hit.z + half };
  }
  function push(gi, gj, amount, radius) {
    const reach = Math.ceil(radius * 2.5), inv = 1 / (2 * radius * radius);
    for (let i = Math.max(1, Math.round(gi) - reach); i <= Math.min(n - 2, Math.round(gi) + reach); i++)
      for (let j = Math.max(1, Math.round(gj) - reach); j <= Math.min(n - 2, Math.round(gj) + reach); j++)
        v[i * n + j] -= amount * Math.exp(-((i - gi) ** 2 + (j - gj) ** 2) * inv);
  }
  function step() {
    prev.set(h);
    for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) {
      const k = i * n + j;
      v[k] = (v[k] + C2 * (h[k - 1] + h[k + 1] + h[k - n] + h[k + n] - 4 * h[k])) * KEEP;
    }
    let e = 0;
    for (let k = 0; k < h.length; k++) { h[k] = (h[k] + v[k]) * RELAX; e = Math.max(e, Math.abs(h[k]), Math.abs(v[k]) * 8); }
    return e;
  }

  let acc = 0, energy = 0, washT = 0, lastPtr = null, ptr = null, visible = false, lastRise = -1;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    ptr = x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null;
  };
  if (!reduce) addEventListener('pointermove', onMove, { passive: true });
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) dirty = true; });
  io.observe(canvas);
  resize();

  /** dt in seconds; rise 0..1 from scroll; drone = its position in the viewport, or null */
  function update(dt, rise, drone) {
    if (!visible || !mesh) return;
    if (reduce) rise = 1;
    if (Math.abs(rise - lastRise) > 1e-4) { mat.uniforms.uRise.value = rise; lastRise = rise; dirty = true; }
    if (!reduce) {
      // the pointer drags a soft wake behind it
      if (ptr) {
        const g = toGrid(ptr.x, ptr.y);
        if (g && lastPtr) {
          const d = Math.hypot(g.i - lastPtr.i, g.j - lastPtr.j);
          if (d > 0.05) { const s = Math.ceil(d / 0.4); for (let q = 1; q <= s; q++) push(lastPtr.i + (g.i - lastPtr.i) * q / s, lastPtr.j + (g.j - lastPtr.j) * q / s, Math.min(d, 3) * 0.09 / s, 1.1); energy = 1; }
        }
        lastPtr = g;
      } else lastPtr = null;
      // rotor wash: while the drone hangs over the ground it pushes a ring down every beat
      if (drone) {
        const r = canvas.getBoundingClientRect();
        const x = drone.x - r.left, y = drone.y - r.top + drone.w * 0.35;
        if (x > 0 && y > 0 && x < r.width && y < r.height) {
          washT += dt;
          if (washT > 0.32) { washT = 0; const g = toGrid(x, y); if (g) { push(g.i, g.j, 0.07, 1.3); energy = 1; } }
        }
      }
      if (energy > EPS) {
        acc = Math.min(acc + dt, STEP * 6);
        while (acc >= STEP) { energy = step(); acc -= STEP; }
        const a = acc / STEP, out = waveAttr.array;
        for (let k = 0; k < out.length; k++) out[k] = prev[k] + (h[k] - prev[k]) * a;
        waveAttr.needsUpdate = true;
        dirty = true;
      }
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  }

  return {
    update, resize,
    /** where the property stands, in canvas pixels (its towers rise from this point) */
    setFocus(x, y) { focus = { x, y }; resize(); },
    dispose() { io.disconnect(); removeEventListener('pointermove', onMove); mesh?.geometry.dispose(); mat.dispose(); renderer.dispose(); },
  };
}

// Procedural premium foldable-style camera quadcopter.
// buildDrone(THREE) -> { group, rotors, blurDiscs, gimbal, gimbalYaw, update(dt, throttle), setLedPulse(t) }
// Front faces +Z, up is +Y, origin at body centre. All geometry is merged per material to keep draw calls low.

export function buildDrone(THREE, addons = {}) {
  const PI = Math.PI;
  const group = new THREE.Group();
  group.name = 'drone';

  /* ---------------------------------------------------------------- helpers */

  const TAPER = 0.24; // nose narrowing
  const sgn = (v) => (v < 0 ? -1 : 1);
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // Tiny deterministic PRNG so textures are identical on every load.
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Concatenate geometries into one non-indexed geometry (position, normal, uv, optional color).
  function merge(geos) {
    const list = geos.map((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      if (!ng.attributes.normal) ng.computeVertexNormals();
      return ng;
    });
    let n = 0;
    let hasColor = false;
    for (const g of list) {
      n += g.attributes.position.count;
      if (g.attributes.color) hasColor = true;
    }
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = hasColor ? new Float32Array(n * 3).fill(1) : null;
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();

  // Clone + transform a geometry (position xyz, euler xyz, scale)
  function put(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.clone();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    return g;
  }

  // Tapered, optionally flattened rounded limb between two points.
  function limb(a, b, r0, r1, flat = 1, seg = 16) {
    const f = new THREE.Vector3().subVectors(b, a);
    const L = f.length();
    f.normalize();
    const s = new THREE.Vector3(0, 1, 0).cross(f).normalize();
    const u = new THREE.Vector3().crossVectors(s, f);
    const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
    g.scale(1, 1, flat);
    const m = new THREE.Matrix4().makeBasis(s, f, u);
    m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    g.applyMatrix4(m);
    return g;
  }
  const P = (x, y, z) => new THREE.Vector3(x, y, z);

  // Superellipse outline in the XZ plane (z>0 is the nose, which narrows slightly).
  function outline(a, b, n, taper = 0, N = 80) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      let x = a * sgn(c) * Math.pow(Math.abs(c), 2 / n);
      const z = b * sgn(s) * Math.pow(Math.abs(s), 2 / n);
      if (taper) x *= 1 - taper * Math.pow(Math.max(0, z / b), 2);
      pts.push([x, z]);
    }
    return pts;
  }

  // Rounded slab: superellipse footprint, thickness h along Y, soft bevels, centred on the origin.
  function slab(w, d, h, bevel, n = 3, taper = 0) {
    const pts = outline(w / 2 - bevel, d / 2 - bevel, n, taper);
    const shape = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    shape.closePath();
    const depth = h - 2 * bevel;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 5,
      curveSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateX(-PI / 2);
    smoothNormals(g);
    return g;
  }

  // Area-weighted smooth normals across coincident vertices (soft shell, no faceting).
  function smoothNormals(g) {
    const p = g.attributes.position;
    const n = p.count;
    const acc = new Map();
    const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const keys = new Array(n);
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      c.sub(b); a.sub(b);
      c.cross(a);
      for (let k = 0; k < 3; k++) {
        const kk = (keys[i + k] = key(i + k));
        const v = acc.get(kk) || acc.set(kk, new THREE.Vector3()).get(kk);
        v.add(c);
      }
    }
    const nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = acc.get(keys[i]).clone().normalize();
      nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  }

  // Surface point and outward yaw of the shell outline at a given x on the front (+1) or rear (-1).
  const shellOutline = outline(0.5, 0.625, 3, TAPER, 360);
  function surface(x, side) {
    const N = shellOutline.length;
    for (let i = 0; i < N; i++) {
      const p0 = shellOutline[i];
      const p1 = shellOutline[(i + 1) % N];
      if (p0[1] * side <= 0 && p1[1] * side <= 0) continue;
      if ((p0[0] - x) * (p1[0] - x) > 0) continue;
      if (Math.abs(p1[0] - p0[0]) < 1e-9) continue;
      const t = (x - p0[0]) / (p1[0] - p0[0]);
      const z = p0[1] + (p1[1] - p0[1]) * t;
      if (z * side <= 0) continue;
      const dx = p1[0] - p0[0];
      const dz = p1[1] - p0[1];
      let nx = -dz;
      let nz = dx;
      if (nz * side < 0) {
        nx = -nx;
        nz = -nz;
      }
      return { z, yaw: Math.atan2(nx, nz) };
    }
    return { z: 0.6 * side, yaw: side > 0 ? 0 : PI };
  }

  /* --------------------------------------------------------------- textures */

  // Fine grain used for roughness / bump variation on the shell.
  const grainTex = (() => {
    const c = canvas(256, 256);
    const x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = 200 + rnd() * 55;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  })();

  // Wordmark decal: wide-tracked, mid-grey, transparent.
  const wordTex = (() => {
    const c = canvas(512, 64);
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 64);
    x.font = '700 34px "Helvetica Neue", Helvetica, Arial, sans-serif';
    x.textBaseline = 'middle';
    x.fillStyle = '#45423f';
    const text = 'VIZCLIX';
    const track = 26;
    let total = 0;
    const widths = [...text].map((ch) => x.measureText(ch).width);
    widths.forEach((w) => (total += w + track));
    total -= track;
    let px = (512 - total) / 2;
    [...text].forEach((ch, i) => {
      x.fillText(ch, px, 33);
      px += widths[i] + track;
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();

  // Lens coating: deep blue-violet with faint concentric elements.
  const lensTex = (() => {
    const c = canvas(256, 256);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, '#0a0828');
    g.addColorStop(0.25, '#1d1580');
    g.addColorStop(0.45, '#3a2bd0');
    g.addColorStop(0.62, '#1f63d8');
    g.addColorStop(0.78, '#7a2fd0');
    g.addColorStop(0.92, '#2a0f60');
    g.addColorStop(1, '#05030f');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    x.lineWidth = 2;
    [0.2, 0.36, 0.55, 0.75, 0.9].forEach((r, i) => {
      x.strokeStyle = `rgba(${90 + i * 20},${90},${200},0.22)`;
      x.beginPath();
      x.arc(128, 128, r * 128, 0, PI * 2);
      x.stroke();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // Soft motion-blur disc with faint blade-shaped ghosting.
  const blurTex = (() => {
    const c = canvas(256, 256);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(30,32,36,0)');
    g.addColorStop(0.1, 'rgba(30,32,36,0)');
    g.addColorStop(0.18, 'rgba(30,32,36,0.16)');
    g.addColorStop(0.5, 'rgba(30,32,36,0.26)');
    g.addColorStop(0.84, 'rgba(30,32,36,0.28)');
    g.addColorStop(0.96, 'rgba(30,32,36,0.07)');
    g.addColorStop(1, 'rgba(30,32,36,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    x.save();
    x.translate(128, 128);
    for (let k = 0; k < 2; k++) {
      x.rotate(k ? PI : 0);
      const wg = x.createLinearGradient(0, 0, 124, 0);
      wg.addColorStop(0, 'rgba(30,32,36,0)');
      wg.addColorStop(0.2, 'rgba(30,32,36,0.2)');
      wg.addColorStop(0.9, 'rgba(30,32,36,0.1)');
      wg.addColorStop(1, 'rgba(30,32,36,0)');
      x.fillStyle = wg;
      x.beginPath();
      x.moveTo(0, 0);
      x.arc(0, 0, 124, -0.2, 0.2);
      x.closePath();
      x.fill();
    }
    x.restore();
    return new THREE.CanvasTexture(c);
  })();

  /* -------------------------------------------------------------- materials */

  const M = {
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xd8d4cb, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35,
      roughnessMap: grainTex, bumpMap: grainTex, bumpScale: 0.35,
    }),
    panel: new THREE.MeshPhysicalMaterial({
      color: 0xb4b2ad, roughness: 0.55, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4,
      roughnessMap: grainTex, bumpMap: grainTex, bumpScale: 0.35,
    }),
    graphite: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.5, metalness: 0.35 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.7, metalness: 0.1 }),
    motor: new THREE.MeshStandardMaterial({ color: 0x1f2125, roughness: 0.34, metalness: 0.7 }),
    ring: new THREE.MeshStandardMaterial({ color: 0x7b7e84, roughness: 0.28, metalness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x06070b, roughness: 0.05, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4,
    }),
    visor: new THREE.MeshPhysicalMaterial({
      color: 0x04050a, roughness: 0.2, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.2,
      specularIntensity: 0.35, envMapIntensity: 0.3,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.92, metalness: 0 }),
    led: new THREE.MeshStandardMaterial({
      color: 0x331408, emissive: 0xff6b35, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0,
    }),
    ledWhite: new THREE.MeshStandardMaterial({
      color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0,
    }),
    ember: new THREE.MeshStandardMaterial({
      color: 0x331408, emissive: 0xff6b35, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.2,
    }),
    decal: new THREE.MeshStandardMaterial({
      map: wordTex, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
    lens: new THREE.MeshPhysicalMaterial({
      map: lensTex, emissiveMap: lensTex, emissive: 0xffffff, emissiveIntensity: 0.5, color: 0xffffff, roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02,
      ior: 1.8, envMapIntensity: 1.8,
    }),
    camBody: new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.38, metalness: 0.55 }),
    blade: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.2, clearcoat: 0.35,
      clearcoatRoughness: 0.4, side: THREE.DoubleSide, transparent: true,
    }),
  };

  // bucket[materialKey] -> list of geometries; flushed into one mesh per material
  const bucket = {};
  const add = (key, geo) => (bucket[key] || (bucket[key] = [])).push(geo);
  function flush(target, bucketObj, opts = {}) {
    for (const key of Object.keys(bucketObj)) {
      const mesh = new THREE.Mesh(merge(bucketObj[key]), M[key]);
      mesh.name = key;
      mesh.castShadow = opts.cast !== false && !['decal', 'glass', 'visor', 'led', 'ledWhite', 'ember', 'lens'].includes(key);
      mesh.receiveShadow = key === 'shell' || key === 'panel' || key === 'graphite';
      target.add(mesh);
    }
  }

  /* ------------------------------------------------------------------- body */

  // Light shell, dark belly, thin dark gasket line between them.
  add('shell', put(slab(1.0, 1.25, 0.26, 0.075, 3, TAPER), 0, 0.04, 0));
  // upper cap layer with its own parting line, then the raised battery spine
  add('seam', put(slab(0.95, 1.17, 0.03, 0.012, 3, TAPER), 0, 0.052, 0, 0.07));
  add('shell', put(slab(0.92, 1.13, 0.17, 0.065, 3, TAPER), 0, 0.13, 0, 0.07));
  add('graphite', put(slab(0.9, 1.16, 0.12, 0.045, 3, TAPER), 0, -0.11, 0));
  add('seam', put(slab(0.94, 1.19, 0.04, 0.014, 3, TAPER), 0, -0.07, 0));

  // Rear spine / battery cover with its own groove.
  add('seam', put(slab(0.62, 0.74, 0.03, 0.012, 3.2), 0, 0.22, -0.14, 0.1));
  add('panel', put(slab(0.58, 0.7, 0.13, 0.05, 3.2), 0, 0.265, -0.14, 0.1));
  add('seam', put(new THREE.BoxGeometry(0.22, 0.014, 0.014), 0, 0.29, -0.5, 0.1));

  // Nose gimbal mount: damper plate and yaw motor.
  add('graphite', put(slab(0.3, 0.24, 0.06, 0.02, 3), 0, -0.2, 0.46));
  add('motor', put(new THREE.CylinderGeometry(0.055, 0.06, 0.07, 24), 0, -0.225, 0.5));
  add('ring', put(new THREE.TorusGeometry(0.058, 0.006, 8, 28), 0, -0.2, 0.5, PI / 2));

  // Wordmark decal + ember dot.
  const word = new THREE.PlaneGeometry(0.72, 0.09);
  word.rotateX(-PI / 2);
  add('decal', put(word, 0, 0.1915, 0.34, 0.07));
  const dot = new THREE.CircleGeometry(0.011, 20);
  dot.rotateX(-PI / 2);
  add('ember', put(dot, 0.43, 0.1918, 0.34, 0.07));

  // Forward sensor windows (bezel + glossy glass), embedded into the curved nose.
  const bezelGeo = new THREE.SphereGeometry(1, 20, 12);
  for (const sx of [-1, 1]) {
    const x = sx * 0.22;
    const sf = surface(x, 1);
    const cx = x - Math.sin(sf.yaw) * 0.002;
    add('seam', put(bezelGeo, cx, 0.07, sf.z - 0.004, 0, sf.yaw, 0, 0.1, 0.04, 0.022));
    add('visor', put(bezelGeo, cx + Math.sin(sf.yaw) * 0.006, 0.07, sf.z + 0.006, 0, sf.yaw, 0, 0.068, 0.024, 0.018));
  }

  // Downward sensors on the belly.
  for (const sx of [-1, 1]) {
    for (const [zz, sc] of [[0.3, 1], [0.12, 0.7]]) {
      add('seam', put(bezelGeo, sx * 0.12, -0.17, zz, 0, 0, 0, 0.052 * sc, 0.012, 0.052 * sc));
      add('visor', put(bezelGeo, sx * 0.12, -0.172, zz, 0, 0, 0, 0.036 * sc, 0.012, 0.036 * sc));
    }
  }

  // Rear status LEDs (pulsed) set into the rear face.
  for (const sx of [-1, 1]) {
    const x = sx * 0.22;
    const sr = surface(x, -1);
    add('seam', put(bezelGeo, x, 0.05, sr.z + 0.003, 0, sr.yaw, 0, 0.06, 0.02, 0.014));
    add('led', put(bezelGeo, x, 0.05, sr.z - 0.002, 0, sr.yaw, 0, 0.046, 0.011, 0.014));
  }

  /* ------------------------------------------------------------------- arms */

  const motorLathe = new THREE.LatheGeometry(
    [
      [0.0, 0.0], [0.088, 0.0], [0.1, 0.012], [0.1, 0.075], [0.096, 0.1], [0.088, 0.125],
      [0.07, 0.142], [0.048, 0.15], [0.03, 0.146], [0.0, 0.146],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    28
  );
  const ventGeo = new THREE.BoxGeometry(0.034, 0.03, 0.02);
  const motorBaseY = 0.04;
  const rotorY = motorBaseY + 0.148;

  const motorDefs = [
    // name, sx, sz, spin dir (+1 = counter-clockwise seen from above)
    { sx: 1, sz: 1, dir: -1 },
    { sx: -1, sz: 1, dir: 1 },
    { sx: 1, sz: -1, dir: 1 },
    { sx: -1, sz: -1, dir: -1 },
  ];
  const motorPos = [];

  for (const d of motorDefs) {
    const front = d.sz > 0;
    const shoulder = P(d.sx * 0.3, 0.03, d.sz * (front ? 0.42 : 0.4));
    const knuckle = P(d.sx * 0.7, 0.055, d.sz * (front ? 0.62 : 0.58));
    const mp = P(d.sx * (front ? 0.98 : 1.0), 0.08, d.sz * (front ? 0.82 : 0.78));
    motorPos.push(mp);

    // inner arm, knuckle, outer arm
    add('shell', limb(shoulder, knuckle, 0.082, 0.07, 0.75));
    add('shell', limb(knuckle, mp, 0.07, 0.06, 0.75));
    add('graphite', put(new THREE.CylinderGeometry(0.092, 0.092, 0.092, 28), knuckle.x, knuckle.y, knuckle.z));
    add('ring', put(new THREE.TorusGeometry(0.093, 0.008, 8, 32), knuckle.x, knuckle.y + 0.046, knuckle.z, PI / 2));
    add('ring', put(new THREE.TorusGeometry(0.093, 0.008, 8, 32), knuckle.x, knuckle.y - 0.046, knuckle.z, PI / 2));
    add('ring', put(new THREE.CylinderGeometry(0.026, 0.026, 0.108, 14), knuckle.x, knuckle.y, knuckle.z));

    // motor housing: lathe, ring detail, vents
    add('motor', put(motorLathe, mp.x, motorBaseY, mp.z, 0, 0, 0, 1.14, 1.0, 1.14));
    add('ring', put(new THREE.TorusGeometry(0.114, 0.009, 8, 36), mp.x, motorBaseY + 0.088, mp.z, PI / 2));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * PI * 2;
      add('seam', put(ventGeo, mp.x + Math.sin(a) * 0.111, motorBaseY + 0.04, mp.z + Math.cos(a) * 0.111, 0, a, 0));
    }
    // front arm tip LEDs
    if (front) {
      add('ledWhite', put(bezelGeo, mp.x + d.sx * 0.113, motorBaseY + 0.04, mp.z, 0, 0, 0, 0.014, 0.014, 0.014));
    }
  }

  /* ------------------------------------------------------------ landing feet */

  const FOOT_Y = -0.42;
  const legDefs = [
    // hip, foot, thickness
    [P(0.34, -0.13, -0.46), P(0.58, FOOT_Y + 0.04, -0.64), 0.042],
    [P(-0.34, -0.13, -0.46), P(-0.58, FOOT_Y + 0.04, -0.64), 0.042],
    [P(0.36, -0.13, 0.36), P(0.52, FOOT_Y + 0.036, 0.5), 0.036],
    [P(-0.36, -0.13, 0.36), P(-0.52, FOOT_Y + 0.036, 0.5), 0.036],
  ];
  const ballGeo = new THREE.SphereGeometry(1, 16, 10);
  for (const [hip, foot, r] of legDefs) {
    add('graphite', limb(hip, foot, r * 1.25, r, 0.85, 12));
    add('graphite', put(ballGeo, hip.x, hip.y, hip.z, 0, 0, 0, r * 1.7, r * 1.7, r * 1.7));
    add('rubber', put(ballGeo, foot.x, foot.y, foot.z, 0, 0, 0, r * 1.5, r * 1.15, r * 1.5));
  }

  flush(group, bucket);

  /* ----------------------------------------------------------------- gimbal */

  // gimbalYaw (parent, yaw) -> gimbal (pitch = rotation.x, roll = rotation.z)
  const gimbalYaw = new THREE.Group();
  gimbalYaw.name = 'gimbalYaw';
  gimbalYaw.position.set(0, -0.315, 0.5);
  gimbalYaw.scale.setScalar(1.15);
  group.add(gimbalYaw);
  const gimbal = new THREE.Group();
  gimbal.name = 'gimbal';
  gimbalYaw.add(gimbal);

  const gb = {};
  // Yoke: top bridge, side arms, pitch motors
  const bridgeY = 0.078;
  add2(gb, 'graphite', limb(P(-0.098, bridgeY, 0), P(0.098, bridgeY, 0), 0.02, 0.02, 1, 12));
  for (const sx of [-1, 1]) {
    add2(gb, 'graphite', limb(P(sx * 0.098, bridgeY, 0), P(sx * 0.098, 0.0, 0), 0.02, 0.024, 1, 12));
    add2(gb, 'graphite', put(ballGeo, sx * 0.098, bridgeY, 0, 0, 0, 0, 0.03, 0.03, 0.03));
    add2(gb, 'motor', put(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 20), sx * 0.092, 0, 0, 0, 0, PI / 2));
    add2(gb, 'ring', put(new THREE.TorusGeometry(0.036, 0.004, 8, 24), sx * 0.108, 0, 0, 0, PI / 2, 0));
  }
  // Camera pod: lathe body along +Z
  const podProfile = [
    [0.0, -0.075], [0.04, -0.075], [0.055, -0.065], [0.058, -0.04], [0.058, 0.05], [0.052, 0.06],
    [0.05, 0.075], [0.05, 0.1], [0.056, 0.104], [0.056, 0.112], [0.047, 0.114], [0.0, 0.114],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const pod = new THREE.LatheGeometry(podProfile, 32);
  pod.rotateX(PI / 2);
  add2(gb, 'camBody', pod);
  add2(gb, 'ember', put(new THREE.TorusGeometry(0.0505, 0.0045, 8, 40), 0, 0, 0.087));
  add2(gb, 'ring', put(new THREE.TorusGeometry(0.0575, 0.003, 8, 40), 0, 0, 0.106));
  flush(gimbal, gb);

  // Lens: planar-UV disc bowed forward into a shallow dome
  const lensGeo = new THREE.RingGeometry(0.0001, 0.047, 40, 8);
  {
    const p = lensGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)) / 0.047;
      p.setZ(i, 0.016 * (1 - r * r));
    }
    lensGeo.computeVertexNormals();
  }
  const lensMesh = new THREE.Mesh(lensGeo, M.lens);
  lensMesh.position.set(0, 0, 0.1);
  lensMesh.name = 'lens';
  gimbal.add(lensMesh);

  function add2(obj, key, geo) {
    (obj[key] || (obj[key] = [])).push(geo);
  }

  /* ----------------------------------------------------------------- rotors */

  // Slightly twisted, tapered airfoil blade along +X. dir>0: leading edge toward -Z (counter-clockwise).
  function makeBlade(dir) {
    const R0 = 0.05;
    const R1 = 0.5;
    const ST = 16;
    const us = [0, 0.04, 0.15, 0.35, 0.6, 0.85, 1];
    const loop = [];
    us.forEach((u) => loop.push([u, 1]));
    for (let i = us.length - 2; i >= 1; i--) loop.push([us[i], -1]);
    const M_ = loop.length;
    const pos = [];
    const col = [];
    const idx = [];
    const base = new THREE.Color(0x24262b);
    const tip = new THREE.Color(0xb0502a);
    const tmp = new THREE.Color();
    for (let i = 0; i <= ST; i++) {
      const t = i / ST;
      const r = R0 + (R1 - R0) * t;
      const chord = t < 0.2 ? 0.06 + 0.035 * (t / 0.2) : 0.095 - 0.058 * Math.pow((t - 0.2) / 0.8, 0.9);
      const a = ((26 * (1 - t) + 9 * t) * PI) / 180;
      const tmax = 0.085;
      tmp.copy(base).lerp(tip, smooth(0.86, 0.95, t) * 0.85);
      for (const [u, side] of loop) {
        const th = 5 * tmax * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u);
        const camber = 0.16 * u * (1 - u);
        const yy = (camber + side * th * 0.5) * chord;
        const s = (u - 0.3) * chord;
        let z = s * Math.cos(a) + yy * Math.sin(a);
        const y = -s * Math.sin(a) + yy * Math.cos(a);
        z *= dir > 0 ? 1 : -1;
        pos.push(r, y, z);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < ST; i++) {
      for (let j = 0; j < M_; j++) {
        const a = i * M_ + j;
        const b = i * M_ + ((j + 1) % M_);
        const c = (i + 1) * M_ + ((j + 1) % M_);
        const d = (i + 1) * M_ + j;
        idx.push(a, b, c, a, c, d);
      }
    }
    const e = ST * M_;
    for (let j = 1; j < M_ - 1; j++) idx.push(e, e + j + 1, e + j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Each prop: two blades (shared geometry), hub with fold hinges.
  const bladeGeos = { '1': (() => { const b = makeBlade(1); return merge([b, put(b, 0, 0, 0, 0, PI, 0)]); })(),
                      '-1': (() => { const b = makeBlade(-1); return merge([b, put(b, 0, 0, 0, 0, PI, 0)]); })() };
  const hubProfile = [[0, -0.012], [0.05, -0.012], [0.052, 0.012], [0.045, 0.026], [0.03, 0.034], [0.012, 0.037], [0, 0.036]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const hubGeo = merge([
    new THREE.LatheGeometry(hubProfile, 24),
    put(new THREE.BoxGeometry(0.1, 0.02, 0.05), 0.06, -0.002, 0),
    put(new THREE.BoxGeometry(0.1, 0.02, 0.05), -0.06, -0.002, 0),
    put(new THREE.CylinderGeometry(0.022, 0.022, 0.034, 14), 0.082, 0.0, 0),
    put(new THREE.CylinderGeometry(0.022, 0.022, 0.034, 14), -0.082, 0.0, 0),
  ]);
  const discGeo = new THREE.CircleGeometry(0.53, 48);
  discGeo.rotateX(-PI / 2);

  const rotors = [];
  const blurDiscs = [];
  motorDefs.forEach((d, i) => {
    const mp = motorPos[i];
    const rotor = new THREE.Group();
    rotor.name = 'rotor' + i;
    rotor.position.set(mp.x, rotorY, mp.z);
    rotor.userData.dir = d.dir;
    const blades = new THREE.Mesh(bladeGeos[String(d.dir)], M.blade);
    blades.position.y = 0.02;
    blades.castShadow = false;
    const hub = new THREE.Mesh(hubGeo, M.motor);
    hub.castShadow = true;
    rotor.add(blades, hub);
    group.add(rotor);
    rotors.push(rotor);

    const mat = new THREE.MeshStandardMaterial({
      map: blurTex, color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, mat);
    disc.position.set(mp.x, rotorY + 0.062, mp.z);
    disc.name = 'blur' + i;
    disc.renderOrder = 2;
    group.add(disc);
    blurDiscs.push(disc);
  });

  /* ---------------------------------------------------------------- runtime */

  const MAX_SPEED = 88; // rad/s at full throttle: aliases pleasantly at 60 fps
  const ledMat = M.led;

  function update(dt, throttle) {
    const t = throttle < 0 ? 0 : throttle > 1 ? 1 : throttle;
    const spin = t * MAX_SPEED * dt;
    const k = smooth(0.1, 0.85, t);
    for (let i = 0; i < 4; i++) {
      rotors[i].rotation.y += rotors[i].userData.dir * spin;
      blurDiscs[i].material.opacity = 0.9 * k;
      blurDiscs[i].rotation.y += rotors[i].userData.dir * spin * 0.5;
    }
    M.blade.opacity = 1 - 0.72 * k;
  }

  function setLedPulse(t) {
    ledMat.emissiveIntensity = 0.55 + 1.05 * (0.5 + 0.5 * Math.sin(t * 2.6));
  }

  return { group, rotors, blurDiscs, gimbal, gimbalYaw, update, setLedPulse };
}

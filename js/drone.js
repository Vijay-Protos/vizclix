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

  // Extrude a closed outline [[x,z]...] into a chamfered plate of thickness h.
  // Tight chamfers + angle-limited normals are what give the machined read.
  function plate(pts, h, bevel, segs = 2) {
    const clean = [];
    for (const pt of pts) {
      const last = clean[clean.length - 1];
      if (!last || Math.abs(last[0] - pt[0]) > 1e-6 || Math.abs(last[1] - pt[1]) > 1e-6) clean.push(pt);
    }
    const shape = new THREE.Shape();
    clean.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    shape.closePath();
    const depth = Math.max(0.002, h - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: segs, curveSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateX(-PI / 2);
    smoothNormals(g);
    return g;
  }

  // Chamfered slab with a superellipse footprint, centred on the origin.
  function slab(w, d, h, bevel, n = 3, taper = 0, N = 72, segs = 2) {
    return plate(outline(w / 2 - bevel, d / 2 - bevel, n, taper, N), h, bevel, segs);
  }

  // Clip a closed outline to a z band, so panel plates get flat machined cut ends.
  function clipZ(pts, zmin, zmax) {
    let poly = pts;
    for (const [sign, bound] of [[1, zmin], [-1, zmax]]) {
      const out = [];
      const inside = (q) => sign * (q[1] - bound) >= 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const ia = inside(a);
        if (ia) out.push(a);
        if (ia !== inside(b)) {
          const t = (bound - a[1]) / (b[1] - a[1]);
          out.push([a[0] + (b[0] - a[0]) * t, bound]);
        }
      }
      poly = out;
      if (!poly.length) break;
    }
    return poly;
  }

  // Chamfered rectangular beam running from a to b.
  function beam(a, b, w, t, bevel = 0.018, n = 9) {
    const f = new THREE.Vector3().subVectors(b, a);
    const L = f.length();
    f.normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(f).normalize();
    const up = new THREE.Vector3().crossVectors(f, side);
    const g = slab(w, L, t, bevel, n, 0, 28);
    const m = new THREE.Matrix4().makeBasis(side, up, f);
    m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    g.applyMatrix4(m);
    return g;
  }

  // Re-normal an indexed primitive with the same break angle as the shell.
  function crisp(g, angle = 44) {
    const ng = g.index ? g.toNonIndexed() : g;
    smoothNormals(ng, angle);
    return ng;
  }

  // Normals are averaged only across edges below the break angle, so flat faces
  // stay flat and every chamfer keeps a narrow, deliberate specular band.
  function smoothNormals(g, breakAngle = 44) {
    const p = g.attributes.position;
    const n = p.count;
    const faces = n / 3;
    const fn = new Float32Array(faces * 3);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let f = 0; f < faces; f++) {
      a.fromBufferAttribute(p, f * 3);
      b.fromBufferAttribute(p, f * 3 + 1);
      c.fromBufferAttribute(p, f * 3 + 2);
      c.sub(b);
      a.sub(b);
      c.cross(a).normalize();
      fn[f * 3] = c.x;
      fn[f * 3 + 1] = c.y;
      fn[f * 3 + 2] = c.z;
    }
    const groups = new Map();
    const keys = new Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(p.getX(i) * 8e3)},${Math.round(p.getY(i) * 8e3)},${Math.round(p.getZ(i) * 8e3)}`;
      keys[i] = k;
      let arr = groups.get(k);
      if (!arr) groups.set(k, (arr = []));
      arr.push(i);
    }
    const lim = Math.cos((breakAngle * PI) / 180);
    const nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const f = (i / 3) | 0;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const j of groups.get(keys[i])) {
        const o = (j / 3) | 0;
        const dot = fn[f * 3] * fn[o * 3] + fn[f * 3 + 1] * fn[o * 3 + 1] + fn[f * 3 + 2] * fn[o * 3 + 2];
        if (dot < lim) continue;
        nx += fn[o * 3];
        ny += fn[o * 3 + 1];
        nz += fn[o * 3 + 2];
      }
      const L = Math.hypot(nx, ny, nz) || 1;
      nor[i * 3] = nx / L;
      nor[i * 3 + 1] = ny / L;
      nor[i * 3 + 2] = nz / L;
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
    t.repeat.set(7, 7);
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
    // semi-matte moulded shell
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xd2cec5, roughness: 0.42, metalness: 0, clearcoat: 0.28, clearcoatRoughness: 0.2,
      roughnessMap: grainTex, bumpMap: grainTex, bumpScale: 0.3,
    }),
    // battery hatch, a touch greyer and flatter than the shell
    panel: new THREE.MeshPhysicalMaterial({
      color: 0xbfbcb5, roughness: 0.52, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.35,
      roughnessMap: grainTex, bumpMap: grainTex, bumpScale: 0.25,
    }),
    // chassis: rougher, slightly metallic composite
    graphite: new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.62, metalness: 0.2 }),
    // recessed panel gaps and grooves: no shine at all
    seam: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.88, metalness: 0 }),
    // anodised motor housings: tight specular
    motor: new THREE.MeshStandardMaterial({ color: 0x232529, roughness: 0.25, metalness: 0.9 }),
    ring: new THREE.MeshStandardMaterial({ color: 0x8a8d93, roughness: 0.18, metalness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x06070b, roughness: 0.05, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4,
    }),
    visor: new THREE.MeshPhysicalMaterial({
      color: 0x04050a, roughness: 0.18, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.15,
      specularIntensity: 0.3, envMapIntensity: 0.3,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.94, metalness: 0 }),
    led: new THREE.MeshStandardMaterial({
      color: 0x331408, emissive: 0xff6b35, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0,
    }),
    ledWhite: new THREE.MeshStandardMaterial({
      color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0,
    }),
    ember: new THREE.MeshStandardMaterial({
      color: 0x2e1207, emissive: 0xff6b35, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.2,
    }),
    decal: new THREE.MeshStandardMaterial({
      map: wordTex, transparent: true, roughness: 0.6, metalness: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }),
    lens: new THREE.MeshPhysicalMaterial({
      map: lensTex, emissiveMap: lensTex, emissive: 0xffffff, emissiveIntensity: 0.5, color: 0xffffff,
      roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.8, envMapIntensity: 1.8,
    }),
    camBody: new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.32, metalness: 0.6 }),
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

  const BEV = 0.018;       // tight chamfer on the main shell volume
  const PB = 0.016;        // chamfer on deck / belly plates
  const GAP = 0.012;       // constant recessed panel-gap width
  const DECK_IN = 0.034;   // deck inset from the body edge, forms a crisp ledge

  // Main shell volume, split by a real horizontal panel groove: the dark core
  // shows through a constant-width gap, and the two chamfers either side of it
  // each catch a narrow highlight that runs the length of the body.
  add('shell', put(slab(1.0, 1.25, 0.14, BEV, 3, TAPER, 76), 0, 0.1, 0));
  add('seam', put(slab(0.958, 1.208, 0.09, 0.01, 3, TAPER, 64), 0, 0.024, 0));
  add('shell', put(slab(1.0, 1.25, 0.108, BEV, 3, TAPER, 76), 0, -0.036, 0));
  // recessed parting gasket at the chassis joint
  add('seam', put(slab(0.952, 1.202, 0.05, 0.012, 3, TAPER, 64), 0, -0.088, 0));

  // Top deck: a dark sub-deck with three plates over it. The constant gaps
  // between plates are real openings, so each panel line is a true recess.
  const deckPts = outline(0.5 - DECK_IN - PB, 0.625 - DECK_IN - PB, 3, TAPER, 72);
  add('seam', put(slab(2 * (0.5 - DECK_IN) + 0.012, 2 * (0.625 - DECK_IN) + 0.012, 0.05, 0.01, 3, TAPER, 64), 0, 0.145, 0));
  const plateBase = 0.172;
  // dark nose plate: the heading signature, readable from any angle
  add('graphite', put(plate(clipZ(deckPts, 0.2 + PB, 1), 0.055, PB), 0, plateBase + 0.0275, 0));
  // centre plate carrying the wordmark
  add('shell', put(plate(clipZ(deckPts, -0.3 + PB, 0.188 - PB), 0.085, PB), 0, plateBase + 0.0425, 0));
  // raised battery hatch with a grip bar
  add('panel', put(plate(clipZ(deckPts, -1, -0.312 - PB), 0.128, PB), 0, plateBase + 0.064, 0));
  add('seam', put(slab(0.26, 0.03, 0.016, 0.005, 6, 0, 20), 0, 0.3015, -0.49));
  // Gap fillers raise the floor of each panel line so the groove is a constant
  // 12mm wide and 12mm deep with dark walls, instead of a deep slot that
  // catches the key light and disappears.
  const gapPts = outline(0.5 - DECK_IN - 0.003, 0.625 - DECK_IN - 0.003, 3, TAPER, 72);
  add('seam', put(plate(clipZ(gapPts, 0.188 + 0.003, 0.2 - 0.003), 0.043, 0.003), 0, 0.1935, 0));
  add('seam', put(plate(clipZ(gapPts, -0.312 + 0.003, -0.3 - 0.003), 0.073, 0.003), 0, 0.2085, 0));

  // Belly: same construction, so the panel lines read from below too.
  add('seam', put(slab(0.912, 1.172, 0.06, 0.012, 3, TAPER, 64), 0, -0.108, 0));
  const bellyPts = outline(0.45 - 0.014, 0.572 - 0.014, 3, TAPER, 64);
  const bellyY = -0.1605;
  add('graphite', put(plate(clipZ(bellyPts, 0.194 + 0.014, 1), 0.055, 0.014), 0, bellyY, 0));
  add('graphite', put(plate(clipZ(bellyPts, -0.182 + 0.014, 0.182 - 0.014), 0.055, 0.014), 0, bellyY, 0));
  add('graphite', put(plate(clipZ(bellyPts, -1, -0.194 - 0.014), 0.055, 0.014), 0, bellyY, 0));

  // Nose gimbal mount: damper plate and yaw motor.
  add('graphite', put(slab(0.3, 0.24, 0.06, 0.016, 4, 0, 40), 0, -0.206, 0.46));
  add('motor', put(crisp(new THREE.CylinderGeometry(0.055, 0.062, 0.07, 26)), 0, -0.232, 0.5));
  add('ring', put(new THREE.TorusGeometry(0.06, 0.006, 8, 28), 0, -0.206, 0.5, PI / 2));

  // Wordmark decal, ember dot, and an ember bar on the nose plate.
  const word = new THREE.PlaneGeometry(0.72, 0.09);
  word.rotateX(-PI / 2);
  add('decal', put(word, 0, 0.258, -0.02));
  const dot = new THREE.CircleGeometry(0.012, 20);
  dot.rotateX(-PI / 2);
  add('ember', put(dot, 0.42, 0.2582, -0.02));
  add('ember', put(slab(0.17, 0.024, 0.012, 0.004, 6, 0, 20), 0, 0.2305, 0.44));

  // Forward sensor windows: machined rectangular housings with a recessed visor.
  for (const sx of [-1, 1]) {
    const x = sx * 0.225;
    const sf = surface(x, 1);
    add('seam', put(slab(0.185, 0.06, 0.075, 0.012, 6, 0, 24), x, 0.045, sf.z - 0.026, 0, sf.yaw, 0));
    add('visor', put(slab(0.15, 0.05, 0.056, 0.009, 6, 0, 24), x, 0.045, sf.z - 0.032, 0, sf.yaw, 0));
  }

  // Downward sensors on the belly.
  for (const sx of [-1, 1]) {
    for (const [zz, sc] of [[0.3, 1], [0.1, 0.72]]) {
      add('seam', put(slab(0.105 * sc, 0.08 * sc, 0.022, 0.006, 6, 0, 20), sx * 0.13, -0.186, zz));
      add('visor', put(slab(0.075 * sc, 0.058 * sc, 0.016, 0.005, 6, 0, 20), sx * 0.13, -0.194, zz));
    }
  }

  // Rear status LEDs, recessed into their housings.
  for (const sx of [-1, 1]) {
    const x = sx * 0.23;
    const sr = surface(x, -1);
    add('seam', put(slab(0.145, 0.05, 0.058, 0.011, 6, 0, 24), x, 0.1, sr.z + 0.028, 0, sr.yaw, 0));
    add('led', put(slab(0.088, 0.032, 0.04, 0.007, 6, 0, 24), x, 0.1, sr.z + 0.016, 0, sr.yaw, 0));
  }

  /* ------------------------------------------------------------------- arms */

  // Motor housing: base flange chamfer, barrel, crown flange overhang, chamfered top.
  const motorLathe = crisp(new THREE.LatheGeometry(
    [
      [0.0, 0.0], [0.094, 0.0], [0.108, 0.014], [0.108, 0.032], [0.1, 0.042],
      [0.1, 0.104], [0.116, 0.114], [0.116, 0.13], [0.09, 0.142],
      [0.075, 0.149], [0.075, 0.152], [0.0, 0.152],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    30
  ));
  const ventGeo = slab(0.024, 0.03, 0.05, 0.005, 8, 0, 20);
  const screwGeo = crisp(new THREE.CylinderGeometry(0.0075, 0.0075, 0.007, 12));
  const knuckleGeo = crisp(new THREE.CylinderGeometry(0.086, 0.086, 0.094, 26));
  const pinGeo = crisp(new THREE.CylinderGeometry(0.024, 0.024, 0.11, 16));
  const motorBaseY = 0.04;
  const rotorY = motorBaseY + 0.166;

  const motorDefs = [
    // sx, sz, spin dir (+1 = counter-clockwise seen from above)
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

    // Arms are chamfered beams, not tubes: the flat top face carries a long
    // narrow highlight all the way out to the motor.
    add('shell', beam(shoulder, knuckle, 0.152, 0.086, 0.016, 11));
    add('shell', beam(knuckle, mp, 0.126, 0.076, 0.015, 11));
    // fold hinge knuckle with a through pin
    add('graphite', put(knuckleGeo, knuckle.x, knuckle.y, knuckle.z));
    add('ring', put(new THREE.TorusGeometry(0.0872, 0.0065, 8, 30), knuckle.x, knuckle.y + 0.047, knuckle.z, PI / 2));
    add('ring', put(new THREE.TorusGeometry(0.0872, 0.0065, 8, 30), knuckle.x, knuckle.y - 0.047, knuckle.z, PI / 2));
    add('ring', put(pinGeo, knuckle.x, knuckle.y, knuckle.z));

    // motor housing, crown ring, milled vent slots, cap screws
    add('motor', put(motorLathe, mp.x, motorBaseY, mp.z));
    add('ring', put(new THREE.TorusGeometry(0.1165, 0.0055, 8, 36), mp.x, motorBaseY + 0.122, mp.z, PI / 2));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * PI * 2;
      add('seam', put(ventGeo, mp.x + Math.sin(a) * 0.09, motorBaseY + 0.072, mp.z + Math.cos(a) * 0.09, 0, a, 0));
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2 + 0.26;
      add('ring', put(screwGeo, mp.x + Math.sin(a) * 0.06, motorBaseY + 0.1525, mp.z + Math.cos(a) * 0.06));
    }
    // front arm tip LEDs
    if (front) {
      add('ledWhite', put(slab(0.03, 0.024, 0.014, 0.004, 6, 0, 16), mp.x + d.sx * 0.104, motorBaseY + 0.058, mp.z, 0, (d.sx * PI) / 2, 0));
    }
  }

  /* ------------------------------------------------------------ landing feet */

  const FOOT_Y = -0.375;
  const legDefs = [
    // hip, foot, strut width, strut thickness
    [P(0.34, -0.15, -0.44), P(0.555, FOOT_Y + 0.045, -0.6), 0.062, 0.05],
    [P(-0.34, -0.15, -0.44), P(-0.555, FOOT_Y + 0.045, -0.6), 0.062, 0.05],
    [P(0.355, -0.15, 0.33), P(0.5, FOOT_Y + 0.042, 0.45), 0.054, 0.044],
    [P(-0.355, -0.15, 0.33), P(-0.5, FOOT_Y + 0.042, 0.45), 0.054, 0.044],
  ];
  const padGeo = crisp(new THREE.CylinderGeometry(0.055, 0.05, 0.026, 20));
  const rubberGeo = crisp(new THREE.CylinderGeometry(0.05, 0.046, 0.02, 20));
  const _ax = new THREE.Vector3();
  const _side = new THREE.Vector3();
  for (const [hip, foot, w, t] of legDefs) {
    // machined strut with a visible hinge knuckle and through pin at the hip
    add('graphite', beam(hip, foot, w, t, 0.014));
    _ax.subVectors(foot, hip).normalize();
    _side.set(0, 1, 0).cross(_ax).normalize().multiplyScalar(w * 0.52);
    add('graphite', limb(hip.clone().sub(_side), hip.clone().add(_side), w * 0.66, w * 0.66, 1, 16));
    const pin = _side.clone().multiplyScalar(1.7);
    add('ring', limb(hip.clone().sub(pin), hip.clone().add(pin), 0.013, 0.013, 1, 12));
    add('graphite', put(padGeo, foot.x, foot.y - 0.012, foot.z));
    add('rubber', put(rubberGeo, foot.x, foot.y - 0.032, foot.z));
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
  const yokeCorner = slab(0.052, 0.052, 0.052, 0.012, 5, 0, 20);
  // Yoke: top bridge, side arms, pitch motors
  const bridgeY = 0.078;
  add2(gb, 'graphite', limb(P(-0.098, bridgeY, 0), P(0.098, bridgeY, 0), 0.02, 0.02, 1, 12));
  for (const sx of [-1, 1]) {
    add2(gb, 'graphite', limb(P(sx * 0.098, bridgeY, 0), P(sx * 0.098, 0.0, 0), 0.02, 0.024, 1, 12));
    add2(gb, 'graphite', put(yokeCorner, sx * 0.098, bridgeY, 0));
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
    ledMat.emissiveIntensity = 0.4 + 0.85 * (0.5 + 0.5 * Math.sin(t * 2.6));
  }

  return { group, rotors, blurDiscs, gimbal, gimbalYaw, update, setLedPulse };
}

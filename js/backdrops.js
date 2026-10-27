/* Two light backdrops drawn in SVG, built from the page's own content so they follow the CMS.

   flightPlan — Process: survey contours across the section and the shoot's route through a
   waypoint at each step's number. The planned route is dashed; the flown route draws over it in
   ember as the steps scroll by, and each waypoint lights as the route reaches it.

   cityNetwork — Fly With Us: a dot-matrix field with the section's cities at their true map
   positions, and routes reaching out from the open city (the hub) as the section scrolls in.

   Both rebuild on resize, and touch the DOM only when their progress actually changes. */
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rel = (r, base) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });

// a smooth path through points (Catmull-Rom as cubic Béziers)
function through(pts) {
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function flightPlan(section, svg, { reduce = false } = {}) {
  let route = null, flown = null, len = 0, marks = [], steps = null, last = -1;
  function build() {
    const box = section.getBoundingClientRect(), w = box.width, h = box.height;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.replaceChildren();
    // survey contours: three hills, wavy rings, every fourth an index contour
    const hills = [[0.16, 0.34, 9], [0.74, 0.5, 11], [0.42, 0.9, 8]];
    hills.forEach(([hx, hy, levels], n) => {
      for (let i = 1; i <= levels; i++) {
        const R = 34 + i * Math.min(w, 1400) * 0.028, pts = [];
        for (let a = 0; a <= 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          const r = R * (1 + 0.11 * Math.sin(3 * t + n * 1.7 + i * 0.15) + 0.05 * Math.sin(7 * t + n + i * 0.4));
          pts.push(`${(hx * w + Math.cos(t) * r * 1.35).toFixed(1)},${(hy * h + Math.sin(t) * r).toFixed(1)}`);
        }
        el('polyline', { points: pts.join(' '), class: i % 4 === 0 ? 'ct ct-i' : 'ct' }, svg);
      }
    });
    // waypoints: just right of each step's number
    steps = section.querySelector('.steps');
    const nums = [...section.querySelectorAll('.steps .num')];
    if (!nums.length) return;
    // beside each number's glyphs; when the steps stack in one column, the route runs down the
    // right-hand gutter instead, so it never crosses the copy
    const stacked = nums.length > 1 && Math.abs(nums[0].getBoundingClientRect().left - nums[1].getBoundingClientRect().left) < 4;
    const pts = nums.map((nEl) => {
      const range = document.createRange(); range.selectNodeContents(nEl);
      const r = rel(range.getBoundingClientRect(), box);
      return { x: stacked ? w - 14 : r.x + r.w + 22, y: r.y + r.h * 0.32 };
    });
    // the route arrives from the left edge, threads the waypoints, and leaves to the right
    const lead = stacked ? { x: w - 14, y: pts[0].y - 120 } : { x: pts[0].x - Math.min(140, w * 0.12), y: pts[0].y - 70 };
    const tail = stacked ? { x: w - 14, y: pts[pts.length - 1].y + 120 } : { x: pts[pts.length - 1].x + Math.min(120, w * 0.1), y: pts[pts.length - 1].y - 60 };
    const d = through([lead, ...pts, tail]);
    route = el('path', { d, class: 'rt' }, svg);
    flown = el('path', { d, class: 'rt-flown' }, svg);
    len = flown.getTotalLength();
    flown.style.strokeDasharray = `${len}`;
    // where along the route each waypoint sits, to light it as the route passes
    const at = pts.map((p) => {
      let best = 0, bd = 1e9;
      for (let s = 0; s <= 200; s++) { const q = flown.getPointAtLength((len * s) / 200), dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (dd < bd) { bd = dd; best = s / 200; } }
      return best;
    });
    marks = pts.map((p, i) => {
      const g = el('g', { class: 'wp', transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` }, svg);
      el('circle', { r: 7 }, g);
      el('path', { d: 'M-12 0h5M7 0h5M0 -12v5M0 7v5' }, g);
      el('text', stacked ? { x: -12, y: -12, 'text-anchor': 'end' } : { x: 14, y: -12 }, g).textContent = `WP${String(i + 1).padStart(2, '0')}`;
      return { g, at: at[i] };
    });
    last = -1;
  }
  function update() {
    if (!steps) return;
    const r = steps.getBoundingClientRect(), vh = innerHeight;
    const p = reduce ? 1 : clamp((vh * 0.9 - r.top) / (r.height + vh * 0.35));
    if (Math.abs(p - last) < 0.002) return;
    last = p;
    flown.style.strokeDashoffset = `${len * (1 - p)}`;
    for (const m of marks) m.g.classList.toggle('on', p >= m.at - 0.01);
  }
  build();
  new ResizeObserver(() => { build(); update(); }).observe(section);
  return { update };
}

// [longitude, latitude] for the cities the network may list; names not here are left off the map
const CITY = {
  Mumbai: [72.88, 19.08], Thane: [72.98, 19.22], Pune: [73.86, 18.52], Nagpur: [79.09, 21.15],
  Bengaluru: [77.59, 12.97], Bangalore: [77.59, 12.97], Hyderabad: [78.49, 17.39], Chennai: [80.27, 13.08],
  'Delhi NCR': [77.21, 28.61], Delhi: [77.21, 28.61], Ahmedabad: [72.57, 23.02], Kolkata: [88.36, 22.57],
  Jaipur: [75.79, 26.91], Kochi: [76.27, 9.93], Surat: [72.83, 21.17], Goa: [73.83, 15.49], Lucknow: [80.95, 26.85],
  Chandigarh: [76.78, 30.73], Indore: [75.86, 22.72], Nashik: [73.79, 19.99], 'Navi Mumbai': [73.02, 19.03],
};
// label placement for the crowded west coast: [dx, dy, anchor]
const LABEL = {
  Mumbai: [-10, 4, 'end'], Thane: [8, -8, 'start'], Pune: [8, 12, 'start'], 'Navi Mumbai': [8, 4, 'start'],
  Bengaluru: [-8, 4, 'end'], Bangalore: [-8, 4, 'end'], Chennai: [8, 4, 'start'], Kochi: [-8, 4, 'end'],
};

export function cityNetwork(section, svg, { reduce = false } = {}) {
  let arcs = [], last = -1;
  function build() {
    const box = section.getBoundingClientRect(), w = box.width;
    svg.setAttribute('viewBox', `0 0 ${w} ${box.height}`);
    svg.replaceChildren();
    // the map sits in the open space above the section's copy, toward the right on wide screens
    const head = section.querySelector('.sec-head');
    const top = 36, bottom = head ? rel(head.getBoundingClientRect(), box).y - 24 : box.height * 0.4;
    const wide = w > 900;
    const area = wide ? { x: w * 0.6, y: top, w: w * 0.36, h: bottom - top } : { x: w * 0.12, y: top, w: w * 0.76, h: bottom - top };
    if (area.h < 120) return;
    // India's extent, equirectangular with the latitude squeeze at ~22°N, fitted into the area
    const [lo0, lo1, la0, la1] = [68, 97.5, 7.5, 35.5], k = Math.cos((22 * Math.PI) / 180);
    const s = Math.min(area.w / ((lo1 - lo0) * k), area.h / (la1 - la0));
    const ox = area.x + (area.w - (lo1 - lo0) * k * s) / 2, oy = area.y + (area.h - (la1 - la0) * s) / 2;
    const proj = ([lo, la]) => ({ x: ox + (lo - lo0) * k * s, y: oy + (la1 - la) * s });
    // dot-matrix field, fading out toward its edges
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'nw-dots', width: 12, height: 12, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 6, cy: 6, r: 1, class: 'nw-dot' }, pat);
    const grad = el('radialGradient', { id: 'nw-fade' }, defs);
    el('stop', { offset: '0.35', 'stop-color': '#fff', 'stop-opacity': '1' }, grad);
    el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }, grad);
    const mask = el('mask', { id: 'nw-mask' }, defs);
    el('ellipse', { cx: area.x + area.w / 2, cy: area.y + area.h / 2, rx: area.w * 0.62, ry: area.h * 0.62, fill: 'url(#nw-fade)' }, mask);
    el('rect', { x: area.x - area.w * 0.15, y: area.y - 10, width: area.w * 1.3, height: area.h + 20, fill: 'url(#nw-dots)', mask: 'url(#nw-mask)' }, svg);
    // the section's own city list: names, and which one is open (the hub)
    const items = [...section.querySelectorAll('.cities li')].map((li) => ({ name: li.textContent.trim(), open: !!li.querySelector('.dotpulse') })).filter((c) => CITY[c.name]);
    if (!items.length) return;
    const hub = items.find((c) => c.open) || items.find((c) => c.name === 'Mumbai') || items[0];
    const H = proj(CITY[hub.name]);
    arcs = [];
    const others = items.filter((c) => c !== hub);
    others.forEach((c, i) => {
      const P = proj(CITY[c.name]), mx = (H.x + P.x) / 2, my = (H.y + P.y) / 2, dx = P.x - H.x, dy = P.y - H.y;
      const bend = 0.22 * (i % 2 ? 1 : -1);
      const path = el('path', { d: `M${H.x.toFixed(1)} ${H.y.toFixed(1)} Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${P.x.toFixed(1)} ${P.y.toFixed(1)}`, class: 'nw-arc' }, svg);
      const L = path.getTotalLength();
      path.style.strokeDasharray = `${L}`;
      arcs.push({ path, L, from: (i / others.length) * 0.6, node: null });
    });
    for (const c of items) {
      const P = proj(CITY[c.name]), isHub = c === hub;
      const g = el('g', { class: isHub ? 'nw-node nw-hub' : 'nw-node', transform: `translate(${P.x.toFixed(1)} ${P.y.toFixed(1)})` }, svg);
      if (isHub) el('circle', { r: 9, class: 'nw-ring' }, g);
      el('circle', { r: isHub ? 4.5 : 3 }, g);
      const [lx, ly, anchor] = LABEL[c.name] || [7, 4, 'start'];
      el('text', { x: lx, y: ly, 'text-anchor': anchor }, g).textContent = c.name;
      const a = arcs.find((x) => x.path.getAttribute('d').endsWith(`${P.x.toFixed(1)} ${P.y.toFixed(1)}`));
      if (a) a.node = g;
    }
    last = -1;
  }
  function update() {
    if (!arcs.length) return;
    const r = section.getBoundingClientRect(), vh = innerHeight;
    const p = reduce ? 1 : clamp((vh * 0.95 - r.top) / (vh * 0.85));
    if (Math.abs(p - last) < 0.002) return;
    last = p;
    for (const a of arcs) {
      const q = clamp((p - a.from) / 0.4);
      a.path.style.strokeDashoffset = `${a.L * (1 - q)}`;
      if (a.node) a.node.classList.toggle('on', q > 0.98);
    }
  }
  build();
  new ResizeObserver(() => { build(); update(); }).observe(section);
  return { update };
}

// VizClix — page choreography. One damped scroll value drives the 3D world and every scroll-linked text.
const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

// Motion preference: the OS setting is the default; a visitor can override it with the Motion switch.
// ?motion forces the full experience (used when testing on a machine that has reduced motion switched on).
const pref = (() => { try { return localStorage.getItem('vc-motion'); } catch (_) { return null; } })();
const osReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const reduce = !/[?&]motion\b/.test(location.search) && (pref === 'off' || (osReduce && pref !== 'on'));
if (reduce) root.classList.add('reduced');
const small = innerWidth < 860 || (navigator.deviceMemory && navigator.deviceMemory <= 4);

/* ---------- loader: counts real milestones ---------- */
const loader = $('#loader'), loaderN = $('#loader-n'), loaderBar = $('#loader-bar');
const steps = { fonts: false, engine: false, model: false, frame: false };
let shown = 0, loaderDone = false;
const minShow = performance.now() + 500;
function loaderTick() {
  const goal = Object.values(steps).filter(Boolean).length / 4 * 100;
  shown += (goal - shown) * 0.2;
  if (goal === 100 && shown > 99.2) shown = 100;
  loaderN.textContent = String(Math.round(shown)).padStart(3, '0');
  loaderBar.style.width = shown + '%';
  if (shown >= 100 && performance.now() > minShow) return finishLoader();
  if (!loaderDone) requestAnimationFrame(loaderTick);
}
function finishLoader() {
  if (loaderDone) return;
  loaderDone = true;
  loader.classList.add('done');
  setTimeout(() => root.classList.add('ready'), 150);
}
requestAnimationFrame(loaderTick);
document.fonts.ready.then(() => { steps.fonts = true; layout(); });
setTimeout(finishLoader, 6000); // never trap a visitor behind the loader

/* ---------- text helpers ---------- */
function splitHeading(el) {
  const text = el.textContent.replace(/\.$/, '').trim();
  const words = text.split(/\s+/);
  el.setAttribute('aria-label', text + '.');
  el.innerHTML = words.map((w, i) =>
    `<span class="wd" aria-hidden="true"><span style="--i:${i}">${w}${i === words.length - 1 ? '<span class="dot">.</span>' : ''}</span></span>`).join(' ');
}
$$('[data-split]').forEach(splitHeading);

const scrubEl = $('[data-scrub]');
let scrubWords = [];
if (scrubEl) {
  const words = scrubEl.textContent.trim().split(/\s+/);
  scrubEl.setAttribute('aria-label', words.join(' '));
  scrubEl.innerHTML = words.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
  scrubWords = $$('.w', scrubEl);
}

$$('[data-bigword]').forEach((el) => {
  const t = el.textContent.trim();
  el.innerHTML = [...t].map((c, i) => `<span class="ch" style="--i:${i}">${c}</span>`).join('');
});
const bigIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); bigIO.unobserve(e.target); } }), { threshold: 0.25 });
$$('[data-bigword]').forEach((el) => bigIO.observe(el));

/* ---------- header: clock, section label, light/solid state ---------- */
const bar = $('#bar'), barSection = $('#bar-section'), clock = $('#clock');
function tickClock() {
  clock.textContent = 'Local ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}
tickClock(); setInterval(tickClock, 20000);

// route rail: one waypoint per section after the flight, built from the sections themselves
const route = $('#route');
const routeLinks = $$('.sec[data-section]').map((s) => {
  const a = document.createElement('a');
  a.href = '#' + s.id;
  a.innerHTML = `<i aria-hidden="true"></i><span>${s.dataset.section.split('— ')[1]}</span>`;
  route.append(a);
  return a;
});

const sectionIO = new IntersectionObserver((es) => {
  es.forEach((e) => {
    if (!e.isIntersecting) return;
    barSection.textContent = e.target.dataset.section || '';
    const onLight = e.target.classList.contains('light');
    bar.classList.toggle('on-light', onLight);
    route.classList.toggle('on-light', onLight);
    routeLinks.forEach((a) => a.classList.toggle('on', a.hash === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
$$('[data-section]').forEach((s) => sectionIO.observe(s));

/* ---------- menu ---------- */
const menuBtn = $('#menu-btn'), menu = $('#menu');
let lastFocus = null;
function setMenu(open) {
  menu.hidden = false;
  menu.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.firstElementChild.textContent = open ? 'close' : 'menu';
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) { lastFocus = document.activeElement; $('a', menu).focus(); } else if (lastFocus) lastFocus.focus();
}
menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false); });
$$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));

/* ---------- motion switch ---------- */
const hint = $('#motion-hint');
if (hint && reduce) hint.hidden = false;
function setMotion(on) {
  try { localStorage.setItem('vc-motion', on ? 'on' : 'off'); } catch (_) { /* storage unavailable */ }
  location.reload();
}
// the hero prompt only ever turns motion on; it is shown only when motion is off
$$('[data-motion-on]').forEach((b) => b.addEventListener('click', () => setMotion(true)));
// the footer and menu control flips whichever way it currently sits
$$('[data-motion-toggle]').forEach((b) => {
  b.textContent = reduce ? 'Motion — Reduced · switch on' : 'Motion — On · reduce';
  b.setAttribute('aria-pressed', String(!reduce));
  b.addEventListener('click', () => setMotion(reduce));
});

/* ---------- contact: two audiences ---------- */
const pathInputs = $$('input[name="path"]');
const sendLabel = $('[data-send-label]');
// remember which fields were genuinely required before anything is toggled
$$('[data-for] input,[data-for] select,[data-for] textarea').forEach((f) => {
  f.dataset.req = f.hasAttribute('required') ? '1' : '0';
});
function applyPath() {
  const picked = (pathInputs.find((i) => i.checked) || {}).value || 'shoot';
  $$('[data-for]').forEach((el) => {
    const on = el.dataset.for === picked;
    el.hidden = !on;
    $$('input,select,textarea', el).forEach((f) => {
      f.disabled = !on;
      if (on && f.dataset.req === '1') f.setAttribute('required', '');
      else f.removeAttribute('required');
    });
  });
  if (sendLabel) sendLabel.textContent = picked === 'operator' ? 'Apply to the Network' : 'Send Enquiry';
}
pathInputs.forEach((i) => i.addEventListener('change', applyPath));
$$('[data-pick-partner]').forEach((a) => a.addEventListener('click', () => {
  const op = pathInputs.find((i) => i.value === 'operator');
  if (op) { op.checked = true; applyPath(); }
}));
applyPath();

/* ---------- anchors ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href') === '#') return;
  const t = document.querySelector(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  const top = t.getBoundingClientRect().top + scrollY - (a.getAttribute('href') === '#top' ? 0 : 0);
  const far = Math.abs(top - scrollY) > innerHeight * 3;
  scrollTo({ top, behavior: reduce || far ? 'auto' : 'smooth' });
  try { history.replaceState(null, '', a.getAttribute('href')); } catch (_) { /* sandboxed frames may refuse */ }
});

/* ---------- layout metrics + timeline ---------- */
const intro = $('#intro'), flight = $('#flight');
const chapters = $$('.chapter');
const hudAlt = $('#hud-alt'), hudDist = $('#hud-dist'), railFill = $('#rail-fill'), shutter = $('#shutter');
const canvas = $('#gl');
const light = $('#perspective'), lightLast = $('#process');
const progress = $('#progress-fill');
let introTop = 0, introH = 1, flightTop = 1, flightH = 1, vh = innerHeight, flightEnd = 1;

// Scroll → timeline. T 0–3 is the hero, intro and flight; 3–4 settles the camera into the studio
// view as Work arrives. From there the drone is placed by the escort below, not by the timeline.
let stations = [];
function layout() {
  vh = innerHeight;
  introTop = intro.offsetTop; introH = intro.offsetHeight;
  flightTop = flight.offsetTop; flightH = flight.offsetHeight;
  flightEnd = flightTop + flightH;
  const raw = [[0, 0], [introTop, 1], [flightTop, 2], [flightEnd - vh, 3], [flightEnd - vh * 0.4, 4]];
  stations = [];
  for (const [y, T] of raw) {                       // keep y strictly increasing
    const prev = stations[stations.length - 1];
    stations.push([prev ? Math.max(y, prev[0] + 1) : y, T]);
  }
  measureEscort();
}

function timelineT(y) {
  if (y <= stations[0][0]) return 0;
  for (let i = 1; i < stations.length; i++) {
    const [y1, t1] = stations[i];
    if (y <= y1) {
      const [y0, t0] = stations[i - 1];
      return t0 + (t1 - t0) * ((y - y0) / Math.max(1, y1 - y0));
    }
  }
  return stations[stations.length - 1][1];
}

/* ---------- the escort: the drone parks beside each heading and call to action ----------
   Docks come from the real layout. For each anchor, the closest spot beside it where a drone-sized
   footprint touches no text, image or control. The drone rests there in page space, so it travels
   with its heading as the page scrolls; it flies to the next dock as that one comes up the screen
   and slips out to the side when the one it holds leaves. Where it cannot sit beside an anchor
   without covering copy (the drone is always behind the page), it flies past instead. */
const reticle = $('#reticle');
let docks = [], droneW = 180;
function measureEscort() {
  const sy = scrollY, vw = innerWidth;
  const phone = vw < 860;
  droneW = phone ? Math.min(150, vw * 0.36) : clamp(vw * 0.13, 150, 230);
  const dw = droneW, dh = droneW * 0.46;
  const edge = phone ? 10 : 28;
  const obs = [];
  const add = (r) => { if (r.width && r.height) obs.push([r.left - 12, r.top + sy - 12, r.right + 12, r.bottom + sy + 12]); };
  const range = document.createRange();
  const rects = (el) => { range.selectNodeContents(el); return [...range.getClientRects()]; };
  for (const s of $$('.sec, .foot')) {
    const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() ? 1 : 2) });
    for (let n; (n = tw.nextNode());) rects(n).forEach(add);
    $$('img,svg,.card,.slot,.cta-solid,.chip span,.cities li,input,select,textarea', s).forEach((el) => add(el.getBoundingClientRect()));
  }
  // the case-study image is sticky, so it can be anywhere down its column
  const shot = $('.study-shot');
  if (shot && getComputedStyle(shot).position === 'sticky') {
    const a = shot.getBoundingClientRect(), b = shot.parentElement.getBoundingClientRect();
    add({ left: a.left, right: a.right, top: b.top, bottom: b.bottom, width: 1, height: 1 });
  }
  const free = (x, y) => {
    const l = x - dw / 2, r = x + dw / 2, t = y - dh / 2, b = y + dh / 2;
    if (l < edge || r > vw - edge) return false;
    for (const o of obs) if (o[0] < r && o[2] > l && o[1] < b && o[3] > t) return false;
    return true;
  };
  docks = $$('.sec-head .h2, .more .link-arrow, .study-block .link-arrow, .fsub .cta').map((el) => {
    const lines = (el.matches('.h2') ? rects(el) : [el.getBoundingClientRect()])
      .filter((r) => r.width > 1).map((r) => [r.left, r.top + sy, r.right, r.bottom + sy]);
    if (!lines.length) return null;
    const A = lines.reduce((u, L) => [Math.min(u[0], L[0]), Math.min(u[1], L[1]), Math.max(u[2], L[2]), Math.max(u[3], L[3])]);
    const cands = [];
    for (const L of lines) {
      const cy = (L[1] + L[3]) / 2;
      for (let k = 0; k < 8; k++) cands.push([L[2] + 24 + dw / 2 + k * dw * 0.25, cy], [L[0] - 24 - dw / 2 - k * dw * 0.25, cy]);
    }
    for (let k = 0; k < 10; k++) {
      const x = A[0] + dw / 2 + k * dw * 0.3;
      cands.push([x, A[1] - 20 - dh / 2], [x, A[3] + 20 + dh / 2]);
    }
    // nearest free spot to the anchor's own text; the right-hand side reads best, so it wins ties
    let best = null, bs = vw * 0.3;
    for (const [x, y] of cands) {
      if (!free(x, y)) continue;
      const gx = Math.max(A[0] - (x + dw / 2), x - dw / 2 - A[2], 0);
      const gy = Math.max(A[1] - (y + dh / 2), y - dh / 2 - A[3], 0);
      const sc = gx + gy * 1.6 + (x < A[0] ? 60 : 0);
      if (sc < bs) { bs = sc; best = [x, y]; }
    }
    const [x, y] = best || [(A[0] + A[2]) / 2, (A[1] + A[3]) / 2];
    // face the anchor, turned three-quarters toward the reader so the camera reads
    const face = x > A[2] ? Math.PI * 1.5 + 0.6 : x < A[0] ? Math.PI / 2 - 0.6 : 0.3;
    return { el, x, y, ok: !!best, face, side: x > vw / 2 ? 1 : -1, frame: A };
  }).filter(Boolean);
}

const E = { x: 0, y: 0, vx: 0, vy: 0, yaw: Math.PI * 1.5, on: null, init: false };
const wrapPI = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function escort(y, dt) {
  const vw = innerWidth;
  // the dock in charge: the last one that has come up past 72% of the screen
  let i = -1;
  for (let k = 0; k < docks.length && docks[k].y - y <= vh * 0.72; k++) i = k;
  const d = docks[i];
  const last = i === docks.length - 1;
  const out = (side, row) => [side > 0 ? vw + droneW : -droneW, row];
  let [tx, ty] = out(1, y + vh * 0.42);                 // before the first dock: waiting off to the side
  let held = false;
  if (d && d.ok && (last || d.y - y > vh * 0.16)) { tx = d.x; ty = d.y; held = true; }
  else if (d) [tx, ty] = out(d.side, d.y);              // its dock is leaving, or has no clear spot
  const land = held && last ? smooth(clamp((vh * 0.66 - (d.y - y)) / (vh * 0.22))) : 0;
  ty += land * droneW * 0.06;
  // a jump (menu, rail) would streak the drone across the page: re-enter from the side instead
  if (!E.init || Math.abs(ty - E.y) > vh * 1.5) {
    [E.x, E.y] = E.init ? out(d ? d.side : 1, ty) : [tx, ty];
    E.vx = E.vy = 0; E.init = true;
  }
  // a critically damped spring in page space: arrives without overshoot, leaves without a jolt
  const w = 3.6;
  E.vx += (w * w * (tx - E.x) - 2 * w * E.vx) * dt; E.x += E.vx * dt;
  E.vy += (w * w * (ty - E.y) - 2 * w * E.vy) * dt; E.y += E.vy * dt;
  const move = clamp(Math.hypot(E.vx, E.vy) / 650);
  const travel = E.vx >= 0 ? Math.PI / 2 : Math.PI * 1.5;
  let yawT = held ? d.face + wrapPI(travel - d.face) * move : travel;
  yawT += wrapPI(0 - yawT) * land;                       // landed, it turns to face you
  E.yaw += wrapPI(yawT - E.yaw) * (1 - Math.exp(-dt * 3.2));
  const fwd = E.vx * Math.sin(E.yaw), side = E.vx * Math.cos(E.yaw);
  // reticle: frames the anchor once the drone has settled beside it
  const settled = held && Math.hypot(tx - E.x, ty - E.y) < 40 && land < 0.5;
  const on = settled ? d : null;
  if (on !== E.on) {
    E.on = on;
    if (on) {
      const [l, t, r, b] = on.frame;
      Object.assign(reticle.style, { left: l - 16 + 'px', top: t - 12 + 'px', width: r - l + 32 + 'px', height: b - t + 24 + 'px' });
    }
    reticle.classList.toggle('on', !!on);
  }
  return {
    x: E.x, y: E.y - y, w: droneW, yaw: E.yaw,
    pitch: 0.05 + clamp(fwd / 1100, -1, 1) * 0.3,
    roll: -clamp(side / 1100, -1, 1) * 0.35,
    thr: lerp(0.62 + move * 0.38 + clamp(-E.vy / 900) * 0.15, 0, land),
    gim: -0.3, land,
  };
}

layout();
addEventListener('load', layout);
// FAQ answers opening, the form switching paths: anything that moves copy moves the docks
new ResizeObserver(() => layout()).observe(document.body);

// The world only crosses to daylight once the daylight section genuinely owns the screen.
// Tying it to how much of the viewport the section covers keeps the change off its neighbours,
// whose copy is written for a dark ground.
// Daylight runs from Perspective through Process. A single coverage figure cannot drive it:
// coverage falls both when the block is arriving and when it is leaving, so the daylight drained
// out from under copy that was still on screen. These sections are transparent in gl mode and
// take their ground from the canvas, so the two edges are tracked apart — the block rises into
// the daylight as it takes the screen, and only gives it back once it is genuinely leaving.
// Dark neighbours paint their own ink ground while crossing, so the boundary stays a clean edge.
function lightMix(y) {
  const top = light.offsetTop;
  const bottom = lightLast.offsetTop + lightLast.offsetHeight;
  const entered = (y + vh - top) / vh;   // 0 as the block's top meets the foot of the screen
  const left = (bottom - y) / vh;        // 0 as the block's bottom clears the top of the screen
  return smooth(Math.min(clamp((entered - 0.3) / 0.38), clamp((left - 0.04) / 0.26)));
}
const windows = [[0.03, 0.34, false], [0.38, 0.68, false], [0.72, 1.0, true]];
function chapterOpacity(f, [a, b, hold]) {
  const x = (f - a) / (b - a);
  const inn = smooth(clamp(x / 0.22));
  const outt = hold ? 1 : 1 - smooth(clamp((x - 0.8) / 0.2));
  return inn * outt;
}

function updateDom(T, y) {
  const f = clamp(T - 2);
  if (progress) progress.style.transform = 'scaleX(' + clamp(y / Math.max(1, document.documentElement.scrollHeight - vh)).toFixed(4) + ')';
  // header solid once past the flight
  bar.classList.toggle('solid', y > flightEnd - vh * 0.6);
  route.classList.toggle('show', y > flightEnd - vh * 0.6);
  // word-by-word statement
  if (scrubWords.length) {
    const p = clamp((y - introTop - vh * 0.1) / Math.max(1, introH - vh * 1.2));
    const n = scrubWords.length;
    scrubWords.forEach((w, k) => { w.style.opacity = (0.16 + 0.84 * clamp(p * (n + 3) - k)).toFixed(3); });
  }
  // chapters, HUD, rail
  chapters.forEach((c, i) => {
    const o = chapterOpacity(f, windows[i]);
    c.style.opacity = o.toFixed(3);
    c.style.transform = `translateY(${((1 - o) * 26).toFixed(1)}px)`;
    c.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
  });
  const inFlight = T >= 2 ? f : 0;
  hudAlt.textContent = String(Math.round(lerp(118, 64, inFlight))).padStart(3, '0');
  hudDist.textContent = String(Math.round(lerp(640, 0, inFlight))).padStart(3, '0');
  railFill.style.transform = `scaleY(${inFlight.toFixed(3)})`;
  // the click
  if (f > 0.94 && !fired) { fired = true; fireShutter(); } else if (f < 0.88) fired = false;
}
let fired = false;
function fireShutter() {
  if (reduce) return;
  shutter.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.1 }, { opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.22,.61,.36,1)' });
}

/* ---------- 3D ---------- */
let world = null, drone = null;
async function boot3D() {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const THREE = await import('three');
    const [{ buildDrone }, { createWorld }] = await Promise.all([import('./drone.js'), import('./scene.js')]);
    steps.engine = true;
    drone = buildDrone(THREE);
    steps.model = true;
    const saveData = (navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''))) || false;
    const quality = small
      ? { dpr: 1.5, seg: 110, dust: 220, aa: false, city: 190, video: false }
      : { dpr: 2, seg: 220, dust: 520, aa: true, city: 420, video: !saveData };
    world = createWorld({ canvas, drone, quality });
    world.update({ T: 0, time: 0, dt: 0, light: 0 });
    steps.frame = true;
    if (!reduce) root.classList.add('gl'); // sections go transparent so the drone flies behind them
  } catch (err) {
    console.warn('3D scene unavailable, showing static page.', err);
    root.classList.remove('gl');
    root.classList.add('no-gl');
    Object.keys(steps).forEach((k) => (steps[k] = true));
  }
}

/* ---------- main loop ---------- */
let cur = scrollY, last = performance.now(), time = 0, frames = 0, slow = 0, dprDropped = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  const y = scrollY;
  cur += (y - cur) * (reduce ? 1 : 1 - Math.exp(-dt * 5.2));
  if (Math.abs(y - cur) < 0.1) cur = y;
  const T = timelineT(cur);
  updateDom(T, cur);

  if (world && !root.classList.contains('no-gl')) {
    if (reduce) {
      canvas.style.opacity = String(clamp(1 - y / (vh * 0.9)));
      if (!loop.drawn) { world.update({ T: 0, time: 1, dt: 0, light: 0 }); loop.drawn = true; }
    } else if (!document.hidden) {
      const mix = lightMix(y);
      // Whenever the canvas is anything but full ink, dark sections hold their own background:
      // at full daylight the next dark section is already on screen, and left transparent it
      // shows bone through its own copy. Only true ink lets them go back to the canvas.
      root.classList.toggle('crossing', mix > 0.002);
      world.update({ T, time, dt, light: mix, dock: T >= 3 ? escort(y, dt) : null });
      // adaptive quality: if the first second is slow, drop the pixel ratio once
      if (++frames > 20 && frames < 90) { slow += dt > 0.032 ? 1 : 0; }
      if (frames === 90 && slow > 40 && !dprDropped) { dprDropped = true; world.renderer.setPixelRatio(1); world.resize(); }
    }
  }
  requestAnimationFrame(loop);
}

addEventListener('resize', () => { layout(); if (world) { world.resize(); if (reduce) { loop.drawn = false; } } });

boot3D().then(() => {
  requestAnimationFrame((n) => { last = n; loop(n); });
  if (location.search.includes('debug')) window.__vc = { get T() { return timelineT(cur); }, get info() { return world && world.info(); }, get frames() { return frames; }, get docks() { return docks; }, drone, world };
});

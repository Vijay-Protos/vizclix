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

const sectionIO = new IntersectionObserver((es) => {
  es.forEach((e) => {
    if (!e.isIntersecting) return;
    barSection.textContent = e.target.dataset.section || '';
    bar.classList.toggle('on-light', e.target.classList.contains('light'));
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
$$('[data-motion-toggle]').forEach((b) => {
  if (!b.closest('.motion-hint')) b.textContent = reduce ? 'Motion — Reduced · switch on' : 'Motion — On · reduce';
  b.setAttribute('aria-pressed', String(!reduce));
  b.addEventListener('click', () => {
    try { localStorage.setItem('vc-motion', reduce ? 'on' : 'off'); } catch (_) { /* storage unavailable */ }
    location.reload();
  });
});

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
const light = $('#perspective');
let introTop = 0, introH = 1, flightTop = 1, flightH = 1, vh = innerHeight, flightEnd = 1;

// Scroll → timeline. Stations below T=3 are the flight; above it each section owns a stretch of
// the timeline, so the drone always arrives with its section however long the content grows.
let stations = [];
function layout() {
  vh = innerHeight;
  introTop = intro.offsetTop; introH = intro.offsetHeight;
  flightTop = flight.offsetTop; flightH = flight.offsetHeight;
  flightEnd = flightTop + flightH;
  const mid = (el, k = 0.5) => el.offsetTop + el.offsetHeight * k - vh * 0.5;
  const raw = [
    [0, 0], [introTop, 1], [flightTop, 2], [flightEnd - vh, 3],
    [mid($('#work'), 0), 3.4], [mid($('#work')), 4],
    [mid($('#services'), 0), 4.5], [mid($('#services')), 5], [mid($('#services'), 1), 5.6],
    [mid(light, 0.35), 6], [mid(light, 1), 6.6],
    [mid($('#process'), 0.4), 7],
    [mid($('#proof'), 0.5), 7.5], [mid($('#faq'), 0.5), 8],
    [mid($('#contact'), 0.1), 8.5], [mid($('#contact'), 0.75), 9],
    [document.documentElement.scrollHeight - vh, 9.4],
  ];
  stations = [];
  for (const [y, T] of raw) {                       // keep y strictly increasing
    const prev = stations[stations.length - 1];
    stations.push([prev ? Math.max(y, prev[0] + 1) : y, T]);
  }
}
layout();
addEventListener('load', layout);

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

// how far the daylight section fills the screen — drives the world's background crossover
function lightMix(y) {
  const top = light.offsetTop, h = light.offsetHeight;
  const fade = Math.min(260, h * 0.3);
  return clamp((y + vh - top) / fade) * clamp((top + h - y) / fade);
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
  // header solid once past the flight
  bar.classList.toggle('solid', y > flightEnd - vh * 0.6);
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
    let addons = {};
    try { const m = await import('three/addons/geometries/RoundedBoxGeometry.js'); addons = { RoundedBoxGeometry: m.RoundedBoxGeometry }; } catch (_) { /* optional */ }
    steps.engine = true;
    drone = buildDrone(THREE, addons);
    steps.model = true;
    const quality = small ? { dpr: 1.5, seg: 110, dust: 220, aa: false } : { dpr: 2, seg: 220, dust: 520, aa: true };
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
  cur += (y - cur) * (reduce ? 1 : 1 - Math.exp(-dt * 7));
  if (Math.abs(y - cur) < 0.1) cur = y;
  const T = timelineT(cur);
  updateDom(T, cur);

  if (world && !root.classList.contains('no-gl')) {
    if (reduce) {
      canvas.style.opacity = String(clamp(1 - y / (vh * 0.9)));
      if (!loop.drawn) { world.update({ T: 0, time: 1, dt: 0, light: 0 }); loop.drawn = true; }
    } else if (!document.hidden) {
      world.update({ T, time, dt, light: lightMix(y) });
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
  if (location.search.includes('debug')) window.__vc = { get T() { return timelineT(cur); }, get info() { return world && world.info(); }, get frames() { return frames; }, drone, world };
});

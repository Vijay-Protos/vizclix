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
const forced = /[?&]motion\b/.test(location.search);
const reduce = !forced && (pref === 'off' || (osReduce && pref !== 'on'));
if (reduce) root.classList.add('reduced');
const small = innerWidth < 860 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
// Lenis smooths wheel and keyboard scrolling, so the timeline and the docked drone move as one
// with the page. It is driven from the main loop (autoRaf off); touch keeps native scrolling.
let lenis = null;
if (!reduce) import('../vendor/lenis/lenis.mjs').then(({ default: Lenis }) => { lenis = new Lenis({ autoRaf: false, lerp: 0.1 }); }).catch(() => { /* native scrolling */ });

/* ---------- loader: counts real milestones ---------- */
const loader = $('#loader'), loaderN = $('#loader-n'), loaderBar = $('#loader-bar');
// the loader waits only for what the first screen is made of: the fonts and the film's first frame.
// The 3D drone fades in when it is ready (html.world-on) and only then flies out of the fog.
const steps = { fonts: false, film: false };
let shown = 0, loaderDone = false;
const minShow = performance.now() + 500;
function loaderTick() {
  const goal = Object.values(steps).filter(Boolean).length / Object.keys(steps).length * 100;
  shown += (goal - shown) * 0.2;
  if (goal === 100 && shown > 99.2) shown = 100;
  loaderN.textContent = String(Math.round(shown)).padStart(3, '0');
  loaderBar.style.width = shown + '%';
  if (shown >= 100 && performance.now() > minShow) return finishLoader();
  if (!loaderDone) requestAnimationFrame(loaderTick);
}
let introAt = 0;
function finishLoader() {
  if (loaderDone) return;
  loaderDone = true;
  loader.classList.add('done');
  setTimeout(() => root.classList.add('ready'), 150);
}
requestAnimationFrame(loaderTick);
document.fonts.ready.then(() => { steps.fonts = true; layout(); });
setTimeout(finishLoader, 4000); // never trap a visitor behind the loader

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
  scrubEl.innerHTML = `<span class="sr-only">${words.join(' ')}</span>` + words.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
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
// with motion on, the clock tells the shoot day instead (updateDom); without it, the local time
if (reduce) { tickClock(); setInterval(tickClock, 20000); }

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
  if (lenis) open ? lenis.stop() : lenis.start();
  for (const el of $$('main, .foot, .route')) el.inert = open;   // focus stays in the menu
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
  b.textContent = forced ? 'Motion — On (set by link)' : reduce ? 'Motion — Reduced · switch on' : 'Motion — On · reduce';
  b.disabled = forced;
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
  if (!a || a.getAttribute('href') === '#' || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const t = document.querySelector(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  const top = t.getBoundingClientRect().top + scrollY;
  const far = Math.abs(top - scrollY) > innerHeight * 3;
  if (lenis) lenis.scrollTo(top, { immediate: far });
  else scrollTo({ top, behavior: reduce || far ? 'auto' : 'smooth' });
  try { history.replaceState(null, '', a.getAttribute('href')); } catch (_) { /* sandboxed frames may refuse */ }
  // keyboard and screen-reader users continue from the target, not from the link they left
  if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
  t.focus({ preventScroll: true });
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
  // the shoot day: each section's hour takes over as its top reaches 40% of the screen. Hours run
  // on through the night (19 → 29 = 05:00), so the page never interpolates backwards in time.
  // The night between the flight and the morning shoot passes as a time-lapse in the last half
  // screen before Work, not spread across the whole flight.
  let last = 0;
  hours = [];
  for (const s of $$('[data-hour]')) {
    let h = +s.dataset.hour;
    while (h < last) h += 24;
    const y = Math.max(0, s.offsetTop - vh * 0.4);
    if (h - last > 6) hours.push([y - vh * 0.5, last + 0.3]);
    hours.push([y, h]);
    last = h;
  }
  measureEscort();
  lightTop = light.offsetTop; lightBottom = lightLast.offsetTop + lightLast.offsetHeight;
  E.path = null; E.key = ''; loiter.at = -1;     // re-measured docks: start the flight afresh
}
let hours = [], lightTop = 0, lightBottom = 1;
function hourAt(y) {
  let i = 0;
  while (i < hours.length - 2 && y > hours[i + 1][0]) i++;
  const [y0, h0] = hours[i], [y1, h1] = hours[i + 1];
  return (h0 + (h1 - h0) * clamp((y - y0) / Math.max(1, y1 - y0))) % 24;
}
const HOUR_NAMES = [[0, 'Night'], [4.5, 'Before Dawn'], [5.4, 'Blue Hour'], [6.2, 'Sunrise'], [7.5, 'Morning'], [10.5, 'Midday'], [14.5, 'Afternoon'], [16.6, 'Golden Hour'], [18.2, 'Dusk'], [19.2, 'Night']];
function hourLabel(h) {
  const name = HOUR_NAMES.filter(([at]) => h >= at).pop()[1];
  const m = Math.floor(h * 60) % 1440;
  return `Light ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} · ${name}`;
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

/* ---------- the escort: the drone flies the page in front of it ----------
   After the flight the canvas moves in front of the page (html.front) and the sky becomes a CSS
   layer behind it, so the drone can never be hidden by content. Docks come from the real layout:
   for each heading and call to action, the nearest spot beside it that a drone-sized footprint
   can take without covering copy. Between docks it never leaves the screen: it loiters in the
   clearest space in view. Every move is a curved path (cubic Hermite from its current velocity,
   so a new target never jolts it), shaped by the section's own move from "Six Moves": a glide
   arcs over, a reveal rises from below, an orbit loops once before settling. */
const reticle = $('#reticle');
let docks = [], obstacles = [], droneW = 180, feedW = 225, feedH = 152, barH = 84;

// the drone's camera feed: one panel, re-pointed at whatever the current stop is filming
const feedEl = $('#feed'), feedVid = $('video', feedEl);
let feedImg = null;
const feedLabel = $('.feed-label', feedEl), feedTc = $('.feed-tc', feedEl);
function showFeed(f) {
  feedEl.classList.toggle('on', !!f);
  if (!f) { feedVid.pause(); return; }
  const kind = f.src === 'plan' ? 'plan' : /\.mp4$/.test(f.src) ? 'video' : 'image';
  feedEl.dataset.kind = kind;
  feedLabel.textContent = 'Feed — ' + f.label + (f.stock ? ' · Stock' : '');
  if (kind === 'video') {
    if (!feedVid.src.endsWith(f.src)) feedVid.src = f.src;
    feedVid.play().catch(() => { /* autoplay refused: the still frame stays */ });
  } else {
    feedVid.pause();
    if (kind === 'image') {
      if (!feedImg) { feedImg = document.createElement('img'); feedImg.alt = ''; $('.feed-view', feedEl).append(feedImg); }
      feedImg.src = f.src;
    }
  }
}
function measureEscort() {
  const sy = scrollY, vw = innerWidth;
  const phone = vw < 860;
  barH = bar.offsetHeight;
  droneW = phone ? Math.min(150, vw * 0.36) : clamp(vw * 0.13, 150, 230);
  const dw = droneW, dh = droneW * 0.46;
  const edge = phone ? 10 : 28;
  const obs = [];
  const add = (r, kind) => { if (r.width && r.height) obs.push([r.left - 12, r.top + sy - 12, r.right + 12, r.bottom + sy + 12, kind]); };
  const range = document.createRange();
  const rects = (el) => { range.selectNodeContents(el); return [...range.getClientRects()]; };
  for (const s of $$('.sec, .foot')) {
    // a phone's single column has no margin, but the outlined section word above each heading is
    // pure decoration: there the drone and its feed may sit over it
    const skip = (n) => !n.nodeValue.trim() || n.parentElement.closest('.bigword');
    const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (skip(n) ? 2 : 1) });
    for (let n; (n = tw.nextNode());) rects(n).forEach((r) => add(r, 3));
    // logo cells count whole: the lazy logos inside measure 0x0 until they load
    if (!phone) $$('.bigword', s).forEach((el) => add(el.getBoundingClientRect(), 3));
    $$('img,svg,.card,.slot,.logos li,.cta-solid,.chip span,.cities li,input,select,textarea', s).forEach((el) => add(el.getBoundingClientRect(), 1));
  }
  // the case-study image is sticky, so it can be anywhere down its column
  const shot = $('.study-shot');
  if (shot && getComputedStyle(shot).position === 'sticky') {
    const a = shot.getBoundingClientRect(), b = shot.parentElement.getBoundingClientRect();
    add({ left: a.left, right: a.right, top: b.top, bottom: b.bottom, width: 1, height: 1 }, 1);
  }
  obstacles = obs.sort((a, b) => a[1] - b[1]);
  // a footprint is the drone, plus (when it carries one) its camera feed hanging beneath it
  feedW = Math.round(dw * (phone ? 1.1 : 1.25)); feedH = Math.round(feedW * 9 / 16) + 26;
  const free = (x, y, feed) => {
    // the feed is a solid panel in front of the page, so it keeps a wider berth than the drone
    const w = feed ? Math.max(dw, feedW) + 16 : dw;
    const l = x - w / 2, r = x + w / 2, t = y - dh / 2, b = y + dh / 2 + (feed ? 8 + feedH + 8 : 0);
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
      // above it (drone alone, and drone with its feed stacked beneath), and below it
      cands.push([x, A[1] - 20 - dh / 2], [x, A[1] - 20 - dh / 2 - 8 - feedH], [x, A[3] + 20 + dh / 2]);
    }
    // nearest free spot to the anchor's own text; the right-hand side reads best, so it wins ties
    const pick = (feed) => {
      let best = null, bs = vw * 0.3;
      for (const [x, y] of cands) {
        if (!free(x, y, feed)) continue;
        if (feed && y - dh / 2 > A[3]) continue;                     // a feed never sits in the content below
        const gx = Math.max(A[0] - (x + dw / 2), x - dw / 2 - A[2], 0);
        const foot = y + dh / 2 + (feed ? 8 + feedH : 0);           // bottom of the whole footprint
        const gy = Math.max(A[1] - foot, y - dh / 2 - A[3], 0);
        const sc = gx + gy * 1.6 + (x < A[0] ? 60 : 0);
        if (sc < bs) { bs = sc; best = [x, y]; }
      }
      return best;
    };
    // a section heading carries its camera feed if there is room for it; otherwise just the drone
    const sec = el.closest('.sec');
    const spec = el.matches('.h2') && sec.dataset.feed;
    let best = spec && pick(true), feed = null;
    if (best) { const [src, label, stock] = spec.split('|'); feed = { src, label, stock: stock === 'stock' }; } else best = pick(false);
    if (!best) return null;                                         // nowhere to stand: fly on by
    const [x, y] = best;
    // face the anchor, turned three-quarters toward the reader so the camera reads
    const face = x > A[2] ? Math.PI * 1.5 + 0.6 : x < A[0] ? Math.PI / 2 - 0.6 : 0.3;
    const move = el.matches('.h2') ? sec.dataset.move || 'glide' : 'glide';
    return { el, x, y, face, frame: A, feed, move };
  }).filter(Boolean).sort((a, b) => a.y - b.y);
}

// How much of a drone-sized footprint at (x, y) (page px) lies over content: text counts three
// times an image. 0 means clear air.
function cover(x, y) {
  const dw = droneW, dh = droneW * 0.46, l = x - dw / 2, r = x + dw / 2, t = y - dh / 2, b = y + dh / 2;
  let c = 0;
  for (const o of obstacles) {
    if (o[1] > b) break;
    if (o[3] < t || o[0] > r || o[2] < l) continue;
    c += o[4] * (Math.min(r, o[2]) - Math.max(l, o[0])) * (Math.min(b, o[3]) - Math.max(t, o[1]));
  }
  return c / (dw * dh);
}
// Between docks: the clearest spot on screen, held in screen space so it stays in view as the
// page scrolls. It is kept until copy has properly slid under it, and for at least 0.8 s, so the
// drone holds a position instead of chasing every line of text that scrolls past.
// Where nothing in view is clear (often, on a phone's single column) it perches instead: smaller,
// half tucked behind the right edge of the screen, peeking in until there is room again.
const loiter = { sx: 0, sy: 0, at: -1, perch: false };
function loiterSpot(y, nearX, nearY) {
  const vw = innerWidth, dw = droneW, dh = droneW * 0.46;
  if (loiter.at >= 0 && (E.t - loiter.at < 0.8 || (loiter.perch ? false : cover(loiter.sx, loiter.sy + y) < 0.3))) return loiter;
  let best = null, bs = Infinity;
  for (let gx = 0; gx <= 8; gx++) for (let gy = 0; gy <= 6; gy++) {
    const sx = dw / 2 + 24 + (vw - dw - 48) * gx / 8, sy = vh * 0.2 + vh * 0.62 * gy / 6;
    const s = cover(sx, sy + y) * 4000 + Math.hypot(sx - nearX, sy - nearY) * 0.6;
    if (s < bs) { bs = s; best = [sx, sy]; }
  }
  const clear = cover(best[0], best[1] + y) < 0.06;
  loiter.perch = !clear;
  [loiter.sx, loiter.sy] = clear ? best : [vw + dw * 0.05, vh * 0.34];
  loiter.at = E.t;
  return loiter;
}

// a path's shape on top of the Hermite base: offsets in px, enveloped to vanish at both ends
const MOVES = {
  glide: (u, d) => [0, -Math.min(170, 40 + d * 0.28) * Math.sin(Math.PI * u)],
  reveal: (u, d) => [0, Math.min(190, 60 + d * 0.3) * Math.sin(Math.PI * u)],
  orbit: (u, d) => { const R = Math.min(110, 50 + d * 0.12), w = Math.sin(Math.PI * u); return [R * Math.sin(2 * Math.PI * u) * w, R * (Math.cos(2 * Math.PI * u) - 1) * w]; },
};
const E = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, sy: 0, sv: 0, pb: 0, yaw: Math.PI * 1.5, pitch: 0, roll: 0, on: null, init: false, path: null, key: '', t: 0 };
const wrapPI = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function escort(y, dt) {
  const vw = innerWidth;
  E.t += dt;
  // scroll speed: a path is planned in its target's own frame (page for a dock, screen for a
  // loiter spot), so the drone's velocity has to be carried across when the frame changes
  E.sv += ((y - E.sy) / Math.max(dt, 1e-3) - E.sv) * (1 - Math.exp(-dt * 12)); E.sy = y;
  // the dock in charge: the last one that has come up past 88% of the screen, held until it
  // nears the top fifth (the last dock, the form, is held for good). Starting that early gives
  // the drone time to get there even when the reader is scrolling quickly.
  let i = -1;
  for (let k = 0; k < docks.length && docks[k].y - y <= vh * 0.88; k++) i = k;
  const d = docks[i], last = i === docks.length - 1;
  const held = !!d && (last || d.y - y > vh * 0.22);
  E.pb += ((!held && loiter.perch ? 1 : 0) - E.pb) * (1 - Math.exp(-dt * 3));     // perch blend
  let key, tx, ty, move = 'glide';
  if (held) { key = 'd' + i; tx = d.x; ty = d.y; move = d.move; }
  else { const s = loiterSpot(y, E.init ? E.x : vw * 0.75, E.init ? E.y - y : vh * 0.4); key = 'l' + s.sx.toFixed(0) + ',' + s.sy.toFixed(0); tx = s.sx; ty = s.sy + y; }
  const land = held && last ? smooth(clamp((vh * 0.66 - (d.y - y)) / (vh * 0.22))) : 0;
  ty += land * droneW * 0.06;
  if (!E.init) { E.x = vw + droneW; E.y = y + vh * 0.35; E.init = true; }
  // a new target starts a new path from where the drone is and how it is already moving
  const scr = key[0] === 'l';                                   // loiter spots live on screen
  if (key !== E.key || !E.path) {
    const x0 = E.x, y0 = scr ? E.y - y : E.y, ty0 = scr ? ty - y : ty;
    const dist = Math.hypot(tx - x0, ty0 - y0);
    // quicker legs while the page is moving fast, so it keeps up instead of trailing behind
    const dur = clamp(0.55 + dist / 1100, 0.6, 1.9) / (1 + Math.abs(E.sv) / 1400);
    // carried velocity, in the new frame, capped so a fast scroll never flings it out of view
    let mx = E.vx * dur, my = (scr ? E.vy - E.sv : E.vy) * dur;
    const m = Math.hypot(mx, my), cap = 120 + dist * 0.5;
    if (m > cap) { mx *= cap / m; my *= cap / m; }
    E.path = { x0, y0, mx, my, t0: E.t, dur, scr, move: scr ? 'glide' : move, dist };
    E.key = key;
  }
  const p = E.path;
  if (p.scr) ty -= y;                                            // evaluate in the path's frame
  const u = clamp((E.t - p.t0) / p.dur);
  // cubic Hermite: leaves with the velocity it had, arrives at rest
  const h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h00 = 1 - h01;
  const [ox, oy] = MOVES[p.move](u, p.dist);
  const idle = smooth(clamp((E.t - p.t0 - p.dur) / 0.8)) * (1 - land);      // hover once arrived
  let nx = h00 * p.x0 + h10 * p.mx + h01 * tx + ox + Math.sin(E.t * 0.7) * 7 * idle;
  let ny = h00 * p.y0 + h10 * p.my + h01 * ty + oy + Math.sin(E.t * 1.1) * 5 * idle + (p.scr ? y : 0);
  // never out of view: whatever the path does, the drone stays inside the frame, clear of the bar
  const dh = droneW * 0.46, top = barH + dh / 2 + 8;
  nx = clamp(nx, droneW / 2 + 8, lerp(vw - droneW / 2 - 8, vw + droneW * 0.1, E.pb));
  ny = clamp(ny - y, top, vh - dh / 2 - 12) + y;
  const vx = (nx - E.x) / Math.max(dt, 1e-3), vy = (ny - E.y) / Math.max(dt, 1e-3);
  // velocity is the drone's actual motion (page px/s); only the acceleration that tilts it is smoothed
  const k = 1 - Math.exp(-dt * 6);
  E.ax += ((vx - E.vx) / Math.max(dt, 1e-3) - E.ax) * k; E.ay += ((vy - E.vy) / Math.max(dt, 1e-3) - E.ay) * k;
  E.vx = vx; E.vy = vy;
  E.x = nx; E.y = ny;
  // attitude: nose toward travel, settling to face the anchor; it tips into acceleration the way
  // a quadcopter does, and banks through turns
  const speed = Math.hypot(E.vx, E.vy), move01 = clamp(speed / 700);
  const travel = E.vx >= 0 ? Math.PI / 2 : Math.PI * 1.5;
  let yawT = held ? d.face + wrapPI(travel - d.face) * move01 : travel;
  if (!held && move01 < 0.2) yawT = E.pb > 0.5 ? Math.PI * 1.5 + 0.35 : 0.35;   // loitering: looks at you; perched: peers in
  yawT += wrapPI(0 - yawT) * land;                                         // landed: faces you
  E.yaw += wrapPI(yawT - E.yaw) * (1 - Math.exp(-dt * 3.2));
  const fwdA = E.ax * Math.sin(E.yaw), sideA = E.ax * Math.cos(E.yaw);
  E.pitch += (0.05 + clamp(fwdA / 2600, -1, 1) * 0.32 + clamp(-E.ay / 4000, -1, 1) * 0.06 - E.pitch) * (1 - Math.exp(-dt * 5));
  E.roll += (-clamp(sideA / 2600, -1, 1) * 0.38 - clamp(E.vx * Math.cos(E.yaw) / 1600, -1, 1) * 0.12 - E.roll) * (1 - Math.exp(-dt * 5));
  // reticle and feed: once the drone has settled at a dock
  const on = held && u >= 1 && land < 0.5 ? d : null;
  if (on !== E.on) {
    E.on = on;
    if (on) {
      const [l, t, r, b] = on.frame;
      Object.assign(reticle.style, { left: l - 16 + 'px', top: t - 12 + 'px', width: r - l + 32 + 'px', height: b - t + 24 + 'px' });
    }
    reticle.classList.toggle('on', !!on);
    showFeed(on && on.feed);
  }
  if (on && on.feed) {
    feedEl.style.transform = `translate(${(on.x - feedW / 2).toFixed(1)}px, ${(on.y - y + droneW * 0.23 + 8).toFixed(1)}px)`;
    feedEl.style.width = feedW + 'px';
    const s = Math.floor(E.ft = (E.ft || 0) + dt);
    feedTc.textContent = `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  return {
    x: E.x, y: E.y - y, w: droneW * (1 - 0.4 * E.pb), yaw: E.yaw, pitch: E.pitch, roll: E.roll,
    thr: lerp(0.6 + move01 * 0.32 + clamp(-E.vy / 900) * 0.12, 0, land),
    gim: -0.3, land,
  };
}

let relayout = 0, lastW = innerWidth;
function scheduleLayout() { if (!relayout) relayout = requestAnimationFrame(() => { relayout = 0; layout(); }); }
layout();
addEventListener('load', scheduleLayout);
// FAQ answers opening, the form switching paths: anything that moves copy moves the docks
new ResizeObserver(scheduleLayout).observe(document.body);

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
  const entered = (y + vh - lightTop) / vh;   // 0 as the block's top meets the foot of the screen
  const left = (lightBottom - y) / vh;        // 0 as the block's bottom clears the top of the screen
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
  if (!reduce && hours.length > 1) {
    const label = hourLabel(hourAt(y));
    if (clock.textContent !== label) clock.textContent = label;
  }
  // word-by-word statement
  if (scrubWords.length) {
    const p = clamp((y - introTop - vh * 0.1) / Math.max(1, introH - vh * 1.2));
    const n = scrubWords.length;
    scrubWords.forEach((w, k) => { w.style.opacity = (0.42 + 0.58 * clamp(p * (n + 3) - k)).toFixed(3); });
  }
  // chapters, HUD, rail
  chapters.forEach((c, i) => {
    const o = chapterOpacity(f, windows[i]);
    c.style.opacity = o.toFixed(3);
    c.style.transform = `translateY(${((1 - o) * 26).toFixed(1)}px)`;
    c.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
    if (c.inert !== o < 0.5) c.inert = o < 0.5;
  });
  const inFlight = T >= 2 ? f : 0;
  const alt = String(Math.round(lerp(118, 64, inFlight))).padStart(3, '0'), dist = String(Math.round(lerp(640, 0, inFlight))).padStart(3, '0');
  if (hudAlt.textContent !== alt) hudAlt.textContent = alt;
  if (hudDist.textContent !== dist) hudDist.textContent = dist;
  railFill.style.transform = `scaleY(${inFlight.toFixed(3)})`;
  // the click
  if (f > 0.94 && !fired) { fired = true; fireShutter(); } else if (f < 0.88) fired = false;
}
let fired = false;
function fireShutter() {
  if (reduce) return;
  if (sound) sound.click();
  shutter.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.1 }, { opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.22,.61,.36,1)' });
}

/* ---------- sound: off until asked for ---------- */
const soundBtn = $('#sound-btn');
let sound = null, soundP = null, audioCtx = null;
soundBtn.addEventListener('click', async () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume().catch(() => { /* resumed on the next gesture */ });
  soundP ||= import('./sound.js').then((m) => (sound = m.createSound(audioCtx)));
  const snd = await soundP;
  snd.set(!snd.on);
  soundBtn.setAttribute('aria-pressed', String(snd.on));
});
document.addEventListener('visibilitychange', () => { if (sound && sound.on && document.hidden) { sound.set(false); soundBtn.setAttribute('aria-pressed', 'false'); } });

/* ---------- hero: the visitor can turn the drone by hand ---------- */
// Drag spins it with momentum; let go and it drifts back to its pose. Horizontal drags only on
// touch (the hero is pan-y), so a vertical swipe still scrolls into the flight.
const hero = $('#hero');
const spin = { yaw: 0, pitch: 0, vy: 0, vp: 0, drag: null };
hero.addEventListener('pointerdown', (e) => {
  if (reduce || e.button || e.target.closest('a,button')) return;
  spin.drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  hero.setPointerCapture(e.pointerId);
  hero.classList.add('dragging');
});
hero.addEventListener('pointermove', (e) => {
  const d = spin.drag;
  if (!d || e.pointerId !== d.id) return;
  const now = performance.now(), dts = Math.max(0.008, (now - d.t) / 1000);
  const dyaw = (e.clientX - d.x) * 0.009, dp = (e.clientY - d.y) * 0.004;
  spin.yaw += dyaw; spin.pitch = clamp(spin.pitch + dp, -0.4, 0.4);
  spin.vy = lerp(spin.vy, dyaw / dts, 0.5); spin.vp = 0;
  Object.assign(d, { x: e.clientX, y: e.clientY, t: now });
});
const endDrag = () => { spin.drag = null; hero.classList.remove('dragging'); };
hero.addEventListener('pointerup', endDrag);
hero.addEventListener('pointercancel', endDrag);
function spinStep(dt) {
  if (spin.drag) return;
  spin.yaw = Math.atan2(Math.sin(spin.yaw), Math.cos(spin.yaw));   // come home the short way
  const w = 1.7;
  spin.vy += (-w * w * spin.yaw - 2 * w * 0.55 * spin.vy) * dt; spin.yaw += spin.vy * dt;
  spin.vp += (-w * w * spin.pitch - 2 * w * spin.vp) * dt; spin.pitch += spin.vp * dt;
}

/* ---------- case study: survey → finished ---------- */
$$('.ba').forEach((ba) => {
  const r = $('.ba-range', ba);
  r.addEventListener('input', () => ba.style.setProperty('--split', r.value + '%'));
});

/* ---------- the film: sections 1-5 play a shot cut in After Effects, scrubbed by scroll ----------
   tools/film/ builds it from aerial clips and the property render; the frames are in assets/film/
   (l/ 1600 px, s/ 960 px for phones). They load coarse to fine, every 8th first, and until a frame
   has arrived the nearest loaded one is drawn. The 3D drone flies over it. */
const FILM_N = 183, FILM_FPS = 12;
// scroll timeline T -> seconds into the film; the fog-bank cuts land between the flight chapters
const FILM_MAP = [[0, 0], [1.85, 3.45], [2.05, 5.3], [2.32, 7.2], [2.42, 9.05], [2.66, 10.95], [2.76, 12.8], [3, 15.17]];
const plateEl = $('#plate');
const film = (() => {
  const ctx = plateEl.getContext('2d');
  const dir = 'assets/film/' + (innerWidth < 900 ? 's/' : 'l/');
  const frames = new Array(FILM_N);
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const order = reduce ? [0] : [0, FILM_N - 1];
  if (!reduce) for (const step of saveData ? [8, 4] : [8, 4, 2, 1]) for (let i = 0; i < FILM_N; i += step) if (!order.includes(i)) order.push(i);
  const coarse = Math.ceil(FILM_N / 8) + 2;    // the first pass: enough to scrub, loaded at once
  let failed = false, settled = document.readyState === 'complete';
  if (!settled) addEventListener('load', () => { settled = true; setTimeout(pump, 300); }, { once: true });
  let shown = -1, inflight = 0, next = 0;
  function pump() {
    while (inflight < 6 && next < order.length && (settled || next < coarse)) {
      const i = order[next++], im = new Image();
      inflight++;
      im.onload = () => { frames[i] = im; inflight--; if (i === 0) steps.film = true; shown = -1; pump(); };
      im.onerror = () => { inflight--; if (i === 0) { failed = true; steps.film = true; } pump(); };
      im.src = dir + String(i).padStart(3, '0') + '.webp';
    }
  }
  pump();
  function size() {
    const d = Math.min(devicePixelRatio || 1, 1.5);
    plateEl.width = Math.round(innerWidth * d); plateEl.height = Math.round(innerHeight * d); shown = -1;
  }
  size(); addEventListener('resize', size);
  return {
    get ready() { return !!frames[0]; },
    get failed() { return failed; },
    draw(T) {
      let t = FILM_MAP[FILM_MAP.length - 1][1];
      for (let i = 1; i < FILM_MAP.length; i++) {
        if (T <= FILM_MAP[i][0]) { const [a, ta] = FILM_MAP[i - 1], [b, tb] = FILM_MAP[i]; t = ta + (tb - ta) * clamp((T - a) / (b - a)); break; }
      }
      const want = Math.min(FILM_N - 1, Math.round(t * FILM_FPS));
      let j = -1;
      for (let d = 0; d < FILM_N && j < 0; d++) j = frames[want - d] ? want - d : frames[want + d] ? want + d : -1;
      if (j < 0 || j === shown) return;
      shown = j;
      const im = frames[j], s = Math.max(plateEl.width / im.width, plateEl.height / im.height), w = im.width * s, h = im.height * s;
      ctx.drawImage(im, (plateEl.width - w) / 2, (plateEl.height - h) / 2, w, h);
    },
  };
})();

/* ---------- 3D ---------- */
let world = null, drone = null, lastDock = null;
async function boot3D() {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const THREE = await import('three');
    const [{ buildDrone }, { createWorld }] = await Promise.all([import('./drone.js'), import('./scene.js')]);
    drone = buildDrone(THREE);
    const saveData = (navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''))) || false;
    const quality = small
      ? { dpr: 1.5, seg: 110, dust: 220, aa: false, city: saveData ? 200 : 400 }
      : { dpr: 2, seg: 220, dust: 520, aa: true, city: 900 };
    world = createWorld({ canvas, drone, quality });
    world.update({ T: 0, time: 0, dt: 0, light: 0, film: true });
    root.classList.add('world-on');
    if (!reduce) root.classList.add('gl'); // sections go transparent so the drone flies behind them
  } catch (err) {
    console.warn('3D scene unavailable, showing static page.', err);
    root.classList.remove('gl');
    root.classList.add('no-gl');
    Object.keys(steps).forEach((k) => (steps[k] = true));
  }
}

/* ---------- sky layer and shadow, behind and under the drone once it flies in front ---------- */
const skyEl = $('#sky'), shadowEl = $('#drone-shadow');
function paintSky([top, mid, foot], d) {
  // a warm pool on the sky where the drone is, and its shadow cast on the page beneath it
  const glow = d ? `radial-gradient(${Math.round(d.w * 1.6)}px ${Math.round(d.w * 1.1)}px at ${d.x.toFixed(0)}px ${d.y.toFixed(0)}px, rgba(216,119,76,.16), transparent 70%),` : '';
  skyEl.style.background = `${glow}linear-gradient(180deg, ${top} 0%, ${mid} 50%, ${foot} 100%)`;
  if (!d) return;
  const lift = 1 - d.land;
  shadowEl.style.width = d.w * 0.8 + 'px';
  shadowEl.style.transform = `translate(${(d.x - d.w * 0.4).toFixed(1)}px, ${(d.y + d.w * (0.2 + 0.32 * lift)).toFixed(1)}px)`;
  shadowEl.style.opacity = (0.55 - 0.25 * lift).toFixed(2);
}

/* ---------- main loop ---------- */
let cur = scrollY, last = performance.now(), time = 0, frames = 0, slow = 0, dprDropped = false, landed = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (lenis) lenis.raf(now);
  const y = scrollY;
  // Lenis already smooths the scroll; this only softens touch flicks and jumps
  cur += (y - cur) * (reduce ? 1 : 1 - Math.exp(-dt * (lenis ? 9 : 5.2)));
  if (Math.abs(y - cur) < 0.1) cur = y;
  const T = timelineT(cur);
  updateDom(T, cur);
  film.draw(reduce ? 0 : T);
  // the film gives way to the page's dusk sky as the escort begins
  const po = reduce ? clamp(1 - y / (vh * 0.9)) : 1 - clamp((T - 3) / 0.3);
  if (plateEl.style.opacity !== String(po)) plateEl.style.opacity = String(po);

  if (world && !root.classList.contains('no-gl')) {
    if (reduce) {
      canvas.style.opacity = String(clamp(1 - y / (vh * 0.9)));
      if (!loop.drawn && (film.ready || film.failed)) { world.update({ T: 0, time: 1, dt: 0, light: 0, film: !film.failed }); loop.drawn = true; }
    } else if (!document.hidden) {
      const mix = lightMix(y);
      // Whenever the canvas is anything but full ink, dark sections hold their own background:
      // at full daylight the next dark section is already on screen, and left transparent it
      // shows bone through its own copy. Only true ink lets them go back to the canvas.
      root.classList.toggle('crossing', mix > 0.002);
      const dock = T >= 3 ? escort(y, dt) : null;
      lastDock = dock;
      spinStep(dt);
      const front = T >= 3.4;
      root.classList.toggle('front', front);
      if (!introAt && loaderDone) introAt = now + 250;    // the fly-in starts once the page is showing
      const intro = introAt ? clamp((now - introAt) / 2600) : 0;
      world.update({ T, time, dt, light: mix, dock, hour: hourAt(y), spin, front, intro, film: !film.failed });
      if (T >= 2.9) paintSky(world.skyStops(mix), front ? dock : null);
      if (sound && sound.on) {
        const seen = !dock || (dock.x > -60 && dock.x < innerWidth + 60 && dock.y > -60 && dock.y < vh + 60);
        sound.update(dock ? dock.thr : 0.75 + 0.25 * clamp(T - 2), seen ? 1 : 0.15);
        if (dock && dock.land > 0.92 && !landed) { landed = true; sound.click(); } else if (!dock || dock.land < 0.5) landed = false;
      }
      // adaptive quality: if the first second is slow, drop the pixel ratio once
      if (++frames > 20 && frames < 90) { slow += dt > 0.032 ? 1 : 0; }
      if (frames === 90 && slow > 40 && !dprDropped) { dprDropped = true; world.renderer.setPixelRatio(1); world.resize(); }
    }
  }
  requestAnimationFrame(loop);
}

addEventListener('resize', () => {
  // a phone's toolbar collapsing changes only the height: re-laying the page out for it would make
  // the timeline jump mid-scroll, so only a width change (or a desktop resize) counts
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && innerWidth === lastW) return;
  lastW = innerWidth;
  scheduleLayout();
  if (world) { world.resize(); if (reduce) loop.drawn = false; }
});

boot3D().then(() => {
  requestAnimationFrame((n) => { last = n; loop(n); });
  if (location.search.includes('debug')) window.__vc = { get T() { return timelineT(cur); }, get info() { return world && world.info(); }, get frames() { return frames; }, get docks() { return docks; }, get dock() { return lastDock; }, get lenis() { return lenis; }, get E() { return E; }, cover, get obstacles() { return obstacles; }, get loiter() { return loiter; }, drone, world };
});

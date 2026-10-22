// VizClix — the drone's sound, synthesised in the browser, so there is nothing to download.
// Off by default: it starts only when the visitor switches it on, which browsers require anyway.
export function createSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);

  // rotor wash: looping noise through a band-pass whose centre rises with the throttle
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 0.9;
  const wash = ctx.createGain(); wash.gain.value = 0.55;
  noise.connect(band).connect(wash).connect(master);

  // blade tone: two slightly detuned saws, low-passed, so the rotors beat against each other
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
  const hum = ctx.createGain(); hum.gain.value = 0.16;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
  o1.type = o2.type = 'sawtooth';
  o1.connect(lp); o2.connect(lp); lp.connect(hum).connect(master);
  noise.start(); o1.start(); o2.start();

  let on = false;
  return {
    get on() { return on; },
    set(v) {
      on = v;
      if (v) ctx.resume();
      else { master.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => { if (!on) ctx.suspend(); }, 900); }
    },
    // thr 0..1 is the throttle; near 0..1 is how present the drone is on screen
    update(thr, near) {
      if (!on) return;
      const t = ctx.currentTime;
      band.frequency.setTargetAtTime(360 + thr * 950, t, 0.15);
      o1.frequency.setTargetAtTime(68 + thr * 72, t, 0.15);
      o2.frequency.setTargetAtTime(70.5 + thr * 73, t, 0.15);
      master.gain.setTargetAtTime((0.04 + 0.14 * near) * (0.45 + 0.55 * thr), t, 0.2);
    },
    // the shutter: two short, bright mechanical ticks
    click() {
      if (!on) return;
      const t = ctx.currentTime;
      for (const [d, f] of [[0, 3200], [0.07, 2100]]) {
        const s = ctx.createBufferSource(); s.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + d);
        g.gain.linearRampToValueAtTime(0.3, t + d + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.06);
        s.connect(hp).connect(g).connect(ctx.destination);
        s.start(t + d, Math.random(), 0.08);
      }
    },
  };
}

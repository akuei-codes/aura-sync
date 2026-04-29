// Procedural DJ SFX using Web Audio API. No samples, no licensing concerns.
// Used during transitions, drops, intros, and crowd-energy moments.

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
  }
  if (_ctx.state === "suspended") void _ctx.resume();
  return _ctx;
}

/** Rising whoosh that climbs into the drop. */
export function playRiser(durationMs = 2800, peakGain = 0.4) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = durationMs / 1000;

  const buffer = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(8000, now + d);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + d * 0.95);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + d);

  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(1800, now + d);
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(peakGain * 0.4, now + d * 0.9);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + d);

  noise.connect(filter).connect(gain).connect(c.destination);
  osc.connect(oscGain).connect(c.destination);
  noise.start(now); osc.start(now);
  noise.stop(now + d); osc.stop(now + d);
}

/** Heavy bass drop / impact. */
export function playDrop(peakGain = 0.55) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;

  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(140, now);
  sub.frequency.exponentialRampToValueAtTime(35, now + 0.7);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(peakGain, now);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
  sub.connect(subGain).connect(c.destination);
  sub.start(now); sub.stop(now + 1.3);

  const buf = c.createBuffer(1, c.sampleRate * 0.18, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const nf = c.createBiquadFilter();
  nf.type = "lowpass"; nf.frequency.value = 700;
  const ng = c.createGain();
  ng.gain.value = peakGain * 0.7;
  noise.connect(nf).connect(ng).connect(c.destination);
  noise.start(now);
}

/** Vinyl scratch — quick back-and-forth. */
export function playScratch(peakGain = 0.35) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = 0.5;

  const osc = c.createOscillator();
  osc.type = "sawtooth";
  // Wobble: up, down, up — classic scratch
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.linearRampToValueAtTime(1400, now + 0.12);
  osc.frequency.linearRampToValueAtTime(200, now + 0.28);
  osc.frequency.linearRampToValueAtTime(900, now + 0.42);
  osc.frequency.exponentialRampToValueAtTime(80, now + d);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass"; filter.Q.value = 10; filter.frequency.value = 1500;
  const gain = c.createGain();
  gain.gain.setValueAtTime(peakGain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(now); osc.stop(now + d);
}

/** Punchy impact hit (crash + sub thump). */
export function playImpact(peakGain = 0.5) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  // Crash (white noise burst)
  const buf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.15));
  const noise = c.createBufferSource(); noise.buffer = buf;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
  const ng = c.createGain(); ng.gain.value = peakGain * 0.6;
  noise.connect(hp).connect(ng).connect(c.destination);
  noise.start(now);
  // Sub thump
  const sub = c.createOscillator(); sub.type = "sine";
  sub.frequency.setValueAtTime(100, now);
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.4);
  const sg = c.createGain();
  sg.gain.setValueAtTime(peakGain, now);
  sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  sub.connect(sg).connect(c.destination);
  sub.start(now); sub.stop(now + 0.6);
}

/** Filter-sweep down (used during crossfade out). */
export function playSweepDown(durationMs = 2000, peakGain = 0.28) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = durationMs / 1000;
  const buf = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(8000, now);
  f.frequency.exponentialRampToValueAtTime(120, now + d);
  const g = c.createGain();
  g.gain.setValueAtTime(peakGain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  src.connect(f).connect(g).connect(c.destination);
  src.start(now); src.stop(now + d);
}

/** Airhorn — classic hype call. */
export function playAirhorn(peakGain = 0.35) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = 0.9;
  const osc1 = c.createOscillator(); osc1.type = "sawtooth"; osc1.frequency.value = 440;
  const osc2 = c.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = 660;
  const osc3 = c.createOscillator(); osc3.type = "square"; osc3.frequency.value = 220;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peakGain, now + 0.05);
  g.gain.setValueAtTime(peakGain, now + d - 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
  osc1.connect(lp); osc2.connect(lp); osc3.connect(lp);
  lp.connect(g).connect(c.destination);
  osc1.start(now); osc2.start(now); osc3.start(now);
  osc1.stop(now + d); osc2.stop(now + d); osc3.stop(now + d);
}

/** Full intro sequence: airhorn -> riser -> drop. ~4.5s total. */
export function playIntroSequence() {
  playAirhorn(0.32);
  setTimeout(() => playRiser(2600, 0.42), 700);
  setTimeout(() => { playDrop(0.6); playImpact(0.4); }, 3300);
}

/** Full transition sequence: scratch -> sweep -> riser -> drop. */
export function playTransitionSequence() {
  playScratch(0.32);
  setTimeout(() => playSweepDown(1800, 0.28), 250);
  setTimeout(() => playRiser(2200, 0.4), 800);
  setTimeout(() => playDrop(0.55), 2900);
}

/** Unlocks the AudioContext after a user gesture. Required by browsers. */
export function unlockSfx() {
  const c = ctx();
  if (c && c.state === "suspended") void c.resume();
}

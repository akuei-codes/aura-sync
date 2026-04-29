// Procedural DJ SFX using Web Audio API. No samples, no licensing concerns.
// Used during transitions and crowd-energy moments.

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

/** Master output node — call .connect(destination) once for routing/ducking. */
export function sfxDestination(): AudioNode | null {
  const c = ctx();
  return c ? c.destination : null;
}

/** Rising whoosh that climbs into the drop. ~3s. */
export function playRiser(durationMs = 2800, peakGain = 0.35) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = durationMs / 1000;

  // Filtered white noise rising
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

  // Pitch sweep tone for body
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
  noise.start(now);
  osc.start(now);
  noise.stop(now + d);
  osc.stop(now + d);
}

/** Heavy bass drop / impact. ~1.2s. */
export function playDrop(peakGain = 0.5) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;

  // Sub-bass thump
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(120, now);
  sub.frequency.exponentialRampToValueAtTime(35, now + 0.6);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(peakGain, now);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  sub.connect(subGain).connect(c.destination);
  sub.start(now);
  sub.stop(now + 1.2);

  // Noise burst for click
  const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = 600;
  const ng = c.createGain();
  ng.gain.value = peakGain * 0.6;
  noise.connect(nf).connect(ng).connect(c.destination);
  noise.start(now);
}

/** Vinyl scratch / record stop swoosh. ~0.6s. */
export function playScratch(peakGain = 0.3) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = 0.6;

  const osc = c.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + d);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 8;
  filter.frequency.value = 1200;
  const gain = c.createGain();
  gain.gain.setValueAtTime(peakGain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + d);
}

/** Filter-sweep down (used during crossfade out). */
export function playSweepDown(durationMs = 2000, peakGain = 0.25) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime;
  const d = durationMs / 1000;
  const buf = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(8000, now);
  f.frequency.exponentialRampToValueAtTime(120, now + d);
  const g = c.createGain();
  g.gain.setValueAtTime(peakGain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  src.connect(f).connect(g).connect(c.destination);
  src.start(now);
  src.stop(now + d);
}

/** Unlocks the AudioContext after a user gesture. Required by browsers. */
export function unlockSfx() {
  const c = ctx();
  if (c && c.state === "suspended") void c.resume();
}

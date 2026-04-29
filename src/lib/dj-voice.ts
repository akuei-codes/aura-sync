// AI DJ voice callouts via ElevenLabs TTS.
// All requests go through the server route /api/elevenlabs/tts (never exposes the API key).
// Phrases are pre-cached as audio blobs at startup so transitions are instant.

const VOICES = [
  "XSr0HH9U8dbZZaKq4Rmh", // Custom ZYNK DJ voice
];

const TRANSITION_LINES = [
  "This next one goes crazy.",
  "Keep that energy locked in!",
  "Here we go!",
  "Fresh one incoming.",
  "Let it ride.",
  "Hands up — this one's special.",
  "Yeah, drop it!",
  "We just getting started!",
];

const ENERGY_LINES = [
  "I feel that energy!",
  "Y'all are alive tonight!",
  "That's what I'm talking about!",
  "Are we having fun?",
  "Let me hear you!",
];

const VOTE_LINES = [
  "Crowd's voting — coming right up.",
  "You asked, you got it.",
  "This one's by request.",
];

const FIRE_LINES = [
  "Fire!",
  "Whew!",
  "Goes hard!",
  "Turn it up!",
];

const IGNITE_LINES = [
  "The room is open. Let's go!",
  "ZYNK is live — let's get it!",
];

export type CalloutKind = "transition" | "energy" | "vote" | "fire" | "ignite";

const ALL_LINES: Record<CalloutKind, readonly string[]> = {
  transition: TRANSITION_LINES,
  energy: ENERGY_LINES,
  vote: VOTE_LINES,
  fire: FIRE_LINES,
  ignite: IGNITE_LINES,
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let pickedVoice: string | null = null;
function chosenVoice(): string {
  if (!pickedVoice) pickedVoice = pick(VOICES);
  return pickedVoice;
}

// ---- Cache layer: pre-fetched audio blobs (per text) ----
const audioCache = new Map<string, Promise<Blob>>();

async function fetchTtsBlob(text: string, voiceId: string, attempt = 0): Promise<Blob> {
  try {
    const res = await fetch("/api/elevenlabs/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId }),
    });
    if (!res.ok) {
      // Retry on 429 / 5xx with backoff
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        return fetchTtsBlob(text, voiceId, attempt + 1);
      }
      throw new Error(`TTS ${res.status}`);
    }
    return await res.blob();
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return fetchTtsBlob(text, voiceId, attempt + 1);
    }
    throw e;
  }
}

function cacheKey(text: string, voiceId: string) {
  return `${voiceId}::${text}`;
}

function getCachedBlob(text: string, voiceId: string): Promise<Blob> {
  const key = cacheKey(text, voiceId);
  let p = audioCache.get(key);
  if (!p) {
    p = fetchTtsBlob(text, voiceId);
    audioCache.set(key, p);
    p.catch(() => audioCache.delete(key)); // allow retry on next call
  }
  return p;
}

/** Pre-warm the cache on app boot — fire all common phrases in parallel. */
let prewarmStarted = false;
export function prewarmDjVoice() {
  if (prewarmStarted) return;
  prewarmStarted = true;
  const voice = chosenVoice();
  const all = [
    ...TRANSITION_LINES, ...ENERGY_LINES, ...VOTE_LINES, ...FIRE_LINES, ...IGNITE_LINES,
  ];
  // Stagger so we don't 429 the upstream
  all.forEach((line, i) => {
    setTimeout(() => { void getCachedBlob(line, voice).catch(() => {}); }, i * 250);
  });
}

let lastCalloutAt = 0;
const MIN_GAP_MS = 5000;
let activeAudio: HTMLAudioElement | null = null;

export async function speakCallout(
  kind: CalloutKind,
  opts: { trackTitle?: string; onDuck?: () => void; onUnduck?: () => void; force?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - lastCalloutAt < MIN_GAP_MS) return;
  lastCalloutAt = now;

  const text = pick(ALL_LINES[kind]);
  const voice = chosenVoice();

  try {
    const blob = await getCachedBlob(text, voice);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 1.0;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const actx = new AC();
        const src = actx.createMediaElementSource(audio);
        const g = actx.createGain();
        g.gain.value = 2.4;
        src.connect(g).connect(actx.destination);
      }
    } catch { /* fall back */ }
    activeAudio = audio;

    opts.onDuck?.();
    await new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      void audio.play().catch(() => resolve());
    });
    opts.onUnduck?.();
    if (activeAudio === audio) activeAudio = null;
  } catch {
    // Silent fail — callout layer must never block playback
    opts.onUnduck?.();
  }
}

export function stopCallout() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
}

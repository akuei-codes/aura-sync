// AI DJ voice — ElevenLabs TTS only.
// All requests are routed through /api/elevenlabs/tts (the API key never
// leaves the server). Phrases are pre-cached as audio blobs at startup so
// transitions are instant. Do not fall back to browser SpeechSynthesis — it
// sounds like the wrong DJ voice.

// HARD-LOCKED custom ZYNK DJ voice. Do not override at runtime.
export const ZYNK_DJ_VOICE_ID = "XSr0HH9U8dbZZaKq4Rmh";

// ---- Personality lines ----------------------------------------------------
// High-energy, charismatic, a little unhinged. Short, punchy, memorable.

const TRANSITION_LINES = [
  "Aight — strap in, this next one's a problem.",
  "Hold my drink, here we go.",
  "I'ma let it ride — y'all ready?",
  "Switch up! Don't blink.",
  "Next one snapped my headphones in half.",
  "If you got a partner, grab 'em. If not — grab a stranger.",
  "This one ain't legal in three states.",
  "Mix in… now!",
];

const ENERGY_LINES = [
  "I see you in the back — yeah you, with the moves!",
  "The floor is liquid right now, watch your step.",
  "Whoever brought this energy, marry me.",
  "Y'all about to break this building, I love it.",
  "Energy check — passed. Crushed it.",
];

const VOTE_LINES = [
  "Crowd spoke. I listen. Pulling it up.",
  "Yo somebody just called this in — granted.",
  "Request just hit my deck — say less.",
];

const FIRE_LINES = [
  "Ohhh nah, that part right there.",
  "Whew — somebody open a window.",
  "That's the one. That's THE one.",
  "Hands up if you felt that!",
];

const IGNITE_LINES = [
  "ZYNK is live. The room is ours. Let's get weird.",
  "Doors open. Floor hot. Let's go!",
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

// ---- Provider mode --------------------------------------------------------
type Provider = "elevenlabs";
const provider: Provider = "elevenlabs";

// ---- Cache layer: pre-fetched audio blobs (per text) ---------------------
const audioCache = new Map<string, Promise<Blob>>();

async function fetchTtsBlob(text: string): Promise<Blob> {
  const res = await fetch("/api/elevenlabs/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Note: we intentionally do NOT send voiceId — the server pins the voice.
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS http ${res.status}`);
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    let payload: { fallback?: boolean; error?: string } = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    if (payload.fallback) {
      throw new Error(`TTS fallback: ${payload.error ?? "unknown"}`);
    }
    throw new Error("TTS returned JSON without fallback");
  }
  return await res.blob();
}

function getCachedBlob(text: string): Promise<Blob> {
  let p = audioCache.get(text);
  if (!p) {
    p = fetchTtsBlob(text);
    audioCache.set(text, p);
    p.catch(() => audioCache.delete(text));
  }
  return p;
}

/** Pre-warm common phrases on first user gesture. Staggered to avoid 429. */
let prewarmStarted = false;
export function prewarmDjVoice() {
  if (prewarmStarted) return;
  prewarmStarted = true;
  const all = [
    ...TRANSITION_LINES, ...ENERGY_LINES, ...VOTE_LINES, ...FIRE_LINES, ...IGNITE_LINES,
  ];
  all.forEach((line, i) => {
    setTimeout(() => { void getCachedBlob(line).catch(() => {}); }, i * 350);
  });
}

// ---- Sequential audio queue ----------------------------------------------
type QueueJob = () => Promise<void>;
const queue: QueueJob[] = [];
let queueRunning = false;
async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try { await job(); } catch { /* swallow */ }
    }
  } finally {
    queueRunning = false;
  }
}
function enqueue(job: QueueJob) {
  queue.push(job);
  void runQueue();
}

// ---- Premium playback ----------------------------------------------------
let activeAudio: HTMLAudioElement | null = null;
let sharedActx: AudioContext | null = null;

async function speakPremium(text: string): Promise<void> {
  const blob = await getCachedBlob(text);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.crossOrigin = "anonymous";
  audio.volume = 1.0;
  try {
    if (typeof window !== "undefined") {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        if (!sharedActx) sharedActx = new AC();
        if (sharedActx.state === "suspended") await sharedActx.resume();
        const src = sharedActx.createMediaElementSource(audio);
        const g = sharedActx.createGain();
        g.gain.value = 2.4;
        src.connect(g).connect(sharedActx.destination);
      }
    }
  } catch { /* fall back to default routing */ }
  activeAudio = audio;
  await new Promise<void>((resolve) => {
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    void audio.play().catch(() => resolve());
  });
  if (activeAudio === audio) activeAudio = null;
}

let lastCalloutAt = 0;
const MIN_GAP_MS = 18000; // hard floor: never speak more than once per ~18s

/**
 * Mixing modes:
 *  - "over"  : speak OVER the music with a light duck (default; most lines)
 *  - "pause" : deep duck for emphasis (used sparingly — ignite + occasional fire)
 */
export type MixMode = "over" | "pause";

export async function speakCallout(
  kind: CalloutKind,
  opts: {
    trackTitle?: string;
    onDuck?: (mode: MixMode) => void;
    onUnduck?: () => void;
    force?: boolean;
    mode?: MixMode;
  } = {},
): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - lastCalloutAt < MIN_GAP_MS) return;
  lastCalloutAt = now;

  const text = pick(ALL_LINES[kind]);
  // Default mixing mode by kind
  const mode: MixMode = opts.mode ?? (kind === "ignite" ? "pause" : "over");

  enqueue(async () => {
    opts.onDuck?.(mode);
    try {
      await speakPremium(text);
    } finally {
      opts.onUnduck?.();
    }
  });
}

export function stopCallout() {
  if (activeAudio) {
    try { activeAudio.pause(); } catch { /* ignore */ }
    activeAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
  queue.length = 0;
}

export function getDjVoiceProvider(): Provider { return provider; }

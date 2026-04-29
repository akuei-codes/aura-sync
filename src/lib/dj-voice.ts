// AI DJ voice — ElevenLabs TTS with browser SpeechSynthesis fallback.
// All requests are routed through /api/elevenlabs/tts (the API key never
// leaves the server). Phrases are pre-cached as audio blobs at startup so
// transitions are instant. If ElevenLabs is unavailable, we fall back to the
// browser's SpeechSynthesisUtterance for the rest of the session.

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

// ---- Provider mode (premium ElevenLabs vs browser fallback) ---------------
type Provider = "premium" | "browser";
let provider: Provider = "premium";
let consecutiveFailures = 0;

// ---- Cache layer: pre-fetched audio blobs (per text) ---------------------
const audioCache = new Map<string, Promise<Blob>>();

async function fetchTtsBlob(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch("/api/elevenlabs/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!res.ok) throw new Error(`TTS http ${res.status}`);
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    // Server signaled fallback — flip to browser provider permanently this session.
    let payload: { fallback?: boolean; error?: string } = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    if (payload.fallback) {
      provider = "browser";
      throw new Error(`TTS fallback: ${payload.error ?? "unknown"}`);
    }
    throw new Error("TTS returned JSON without fallback");
  }
  return await res.blob();
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
    p.catch(() => audioCache.delete(key));
  }
  return p;
}

/** Pre-warm common phrases on first user gesture. Staggered to avoid 429. */
let prewarmStarted = false;
export function prewarmDjVoice() {
  if (prewarmStarted) return;
  prewarmStarted = true;
  const voice = chosenVoice();
  const all = [
    ...TRANSITION_LINES, ...ENERGY_LINES, ...VOTE_LINES, ...FIRE_LINES, ...IGNITE_LINES,
  ];
  all.forEach((line, i) => {
    setTimeout(() => { void getCachedBlob(line, voice).catch(() => {}); }, i * 350);
  });
}

// ---- Sequential audio queue: one DJ utterance at a time -------------------
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

// ---- Browser fallback ----------------------------------------------------
function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.05;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

// ---- Premium playback (ElevenLabs blob through Web Audio for loudness) ---
let activeAudio: HTMLAudioElement | null = null;
let sharedActx: AudioContext | null = null;

async function speakPremium(text: string, voice: string): Promise<void> {
  const blob = await getCachedBlob(text, voice);
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
const MIN_GAP_MS = 5000;

export async function speakCallout(
  kind: CalloutKind,
  opts: { trackTitle?: string; onDuck?: () => void; onUnduck?: () => void; force?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - lastCalloutAt < MIN_GAP_MS) return;
  lastCalloutAt = now;

  const text = pick(ALL_LINES[kind]);
  const voice = chosenVoice();

  enqueue(async () => {
    opts.onDuck?.();
    try {
      if (provider === "premium") {
        try {
          await speakPremium(text, voice);
          consecutiveFailures = 0;
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 2) provider = "browser";
          await speakBrowser(text);
        }
      } else {
        await speakBrowser(text);
      }
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

/** Diagnostic: which provider are we on? */
export function getDjVoiceProvider(): Provider { return provider; }

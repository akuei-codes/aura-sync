// AI DJ voice callouts via ElevenLabs TTS, played as a ducked overlay above the music.
// Throttled and event-driven so it never feels spammy.

const VOICES = [
  "iP95p4xoKVk53GoZ742B", // Chris — confident, clubby
  "nPczCjzI2devNBz1zQrb", // Brian — deep host vibe
  "TX3LPaxmHKxFdv7VOQHJ", // Liam — energetic
];

const TRANSITION_LINES = [
  "This next one goes crazy.",
  "Keep that energy locked in.",
  "Here we go!",
  "Fresh one incoming.",
  "Let it ride.",
  "Hands up — this one's special.",
  "Yeah, drop it.",
  "We're just getting started.",
];

const ENERGY_LINES = [
  "I feel that energy!",
  "Y'all are alive tonight!",
  "That's what I'm talking about.",
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
  "Goes hard.",
];

export type CalloutKind = "transition" | "energy" | "vote" | "fire" | "ignite";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateLine(kind: CalloutKind, ctx?: { trackTitle?: string }): string {
  switch (kind) {
    case "transition":
      return ctx?.trackTitle && Math.random() < 0.3
        ? `${pick(TRANSITION_LINES)} ${ctx.trackTitle}.`
        : pick(TRANSITION_LINES);
    case "energy": return pick(ENERGY_LINES);
    case "vote": return pick(VOTE_LINES);
    case "fire": return pick(FIRE_LINES);
    case "ignite": return "The room is open. Let's go!";
  }
}

let lastCalloutAt = 0;
const MIN_GAP_MS = 5000; // never two callouts within 5s — keep the host alive
let pickedVoice: string | null = null;

function chosenVoice(): string {
  if (!pickedVoice) pickedVoice = pick(VOICES);
  return pickedVoice;
}

let activeAudio: HTMLAudioElement | null = null;

/**
 * Speak a line through ElevenLabs and play it. Returns a promise that resolves
 * when playback finishes (or immediately rejects/skips if throttled).
 *
 * onDuck/onUnduck let you lower Spotify volume during voice and restore it after.
 */
export async function speakCallout(
  kind: CalloutKind,
  opts: { trackTitle?: string; onDuck?: () => void; onUnduck?: () => void; force?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - lastCalloutAt < MIN_GAP_MS) return;
  lastCalloutAt = now;

  const text = generateLine(kind, { trackTitle: opts.trackTitle });
  try {
    const res = await fetch("/api/elevenlabs/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId: chosenVoice() }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 1.0;
    // Boost via WebAudio gain for true loudness above music
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (AC) {
        const actx = new AC();
        const src = actx.createMediaElementSource(audio);
        const g = actx.createGain();
        g.gain.value = 2.4; // amplify above 1.0
        src.connect(g).connect(actx.destination);
      }
    } catch { /* fall back to plain audio */ }
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
    // network / rate limit — silently skip
  }
}

export function stopCallout() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
}

// AI DJ engine — picks the next track and narrates the transition.
//
// Heuristic part (deterministic, free):
//   - Score each pending queue candidate against the currently-playing track using
//     Camelot wheel key compatibility, BPM proximity, and energy curve target.
//   - Top score wins.
//
// LLM part (Lovable AI Gateway, optional):
//   - Generates a short hype callout label and transition style name.
//   - Falls back to deterministic copy if LOVABLE_API_KEY is missing or rate-limited.

import type { AudioFeatures } from "./spotify.server";

export interface CandidateTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  key_pitch_class: number | null;
  mode: number | null;
  energy: number | null;
  vote_count: number;
}

export interface CurrentDeckState {
  bpm: number | null;
  key_pitch_class: number | null;
  mode: number | null;
  energy: number | null;
  title: string;
  artist: string;
}

// Camelot wheel: (pitch_class, mode) -> camelot number 1..12
// mode 1 = major (B side), mode 0 = minor (A side)
const CAMELOT: Record<string, { num: number; letter: "A" | "B" }> = {
  "0,0": { num: 5, letter: "A" }, "0,1": { num: 8, letter: "B" },   // C
  "1,0": { num: 12, letter: "A" }, "1,1": { num: 3, letter: "B" },  // C#/Db
  "2,0": { num: 7, letter: "A" }, "2,1": { num: 10, letter: "B" },  // D
  "3,0": { num: 2, letter: "A" }, "3,1": { num: 5, letter: "B" },   // D#/Eb
  "4,0": { num: 9, letter: "A" }, "4,1": { num: 12, letter: "B" },  // E
  "5,0": { num: 4, letter: "A" }, "5,1": { num: 7, letter: "B" },   // F
  "6,0": { num: 11, letter: "A" }, "6,1": { num: 2, letter: "B" },  // F#/Gb
  "7,0": { num: 6, letter: "A" }, "7,1": { num: 9, letter: "B" },   // G
  "8,0": { num: 1, letter: "A" }, "8,1": { num: 4, letter: "B" },   // G#/Ab
  "9,0": { num: 8, letter: "A" }, "9,1": { num: 11, letter: "B" },  // A
  "10,0": { num: 3, letter: "A" }, "10,1": { num: 6, letter: "B" }, // A#/Bb
  "11,0": { num: 10, letter: "A" }, "11,1": { num: 1, letter: "B" }, // B
};

function camelot(pitch: number | null, mode: number | null) {
  if (pitch == null || mode == null || pitch < 0) return null;
  return CAMELOT[`${pitch},${mode}`] ?? null;
}

function keyCompatibility(a: ReturnType<typeof camelot>, b: ReturnType<typeof camelot>): number {
  if (!a || !b) return 0.5; // unknown — neutral
  if (a.num === b.num && a.letter === b.letter) return 1;          // perfect match
  if (a.num === b.num) return 0.92;                                  // relative major/minor
  const diff = Math.min(Math.abs(a.num - b.num), 12 - Math.abs(a.num - b.num));
  if (diff === 1 && a.letter === b.letter) return 0.85;             // ±1 same letter
  if (diff === 0) return 0.9;
  return Math.max(0.2, 1 - diff * 0.12);
}

function bpmCompatibility(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0.5;
  const diff = Math.abs(a - b);
  // Up to ±4 BPM is a clean mix; double/half-time also work
  const halfDouble = Math.min(diff, Math.abs(a - b * 2), Math.abs(a * 2 - b));
  return Math.max(0, 1 - halfDouble / 20);
}

function energyAlignment(candidate: number | null, target: number): number {
  if (candidate == null) return 0.5;
  return 1 - Math.min(1, Math.abs(candidate - target) * 1.2);
}

export interface PickResult {
  candidateId: string;
  score: number;
  reasons: { key: number; bpm: number; energy: number; popularity: number };
}

/**
 * Pick the best next track. Energy target is the desired energy *after* this transition
 * (autopilot supplies a target curve based on session age and crowd reactions).
 */
export function pickNextTrack(
  current: CurrentDeckState,
  candidates: CandidateTrack[],
  energyTarget: number,
): PickResult | null {
  if (candidates.length === 0) return null;
  const currentCamelot = camelot(current.key_pitch_class, current.mode);

  let best: PickResult | null = null;
  const maxVotes = Math.max(1, ...candidates.map((c) => c.vote_count));

  for (const c of candidates) {
    const cCam = camelot(c.key_pitch_class, c.mode);
    const k = keyCompatibility(currentCamelot, cCam);
    const b = bpmCompatibility(current.bpm, c.bpm);
    const e = energyAlignment(c.energy, energyTarget);
    const p = c.vote_count / maxVotes;
    // Weighted: musical compatibility dominates, but crowd votes have real pull
    const score = k * 0.35 + b * 0.25 + e * 0.25 + p * 0.15;
    if (!best || score > best.score) {
      best = { candidateId: c.id, score, reasons: { key: k, bpm: b, energy: e, popularity: p } };
    }
  }
  return best;
}

/**
 * Compute the next energy target. Sessions ride a curve: warm-up → climb → peak → cool-down.
 * `sessionMinutes` is minutes since the session started.
 * `recentReactionRate` is reactions/minute over the last 2 minutes (saturates at 60).
 */
export function nextEnergyTarget(sessionMinutes: number, recentReactionRate: number): number {
  // Base curve: warm-up (0–15min) climbs from 0.45→0.7, peak (15–60min) holds 0.78–0.9,
  // cool-down (60+) eases back. Reactions push energy up.
  let base: number;
  if (sessionMinutes < 15) base = 0.45 + (sessionMinutes / 15) * 0.25;
  else if (sessionMinutes < 60) base = 0.78 + Math.sin(sessionMinutes / 8) * 0.08;
  else base = Math.max(0.55, 0.85 - (sessionMinutes - 60) * 0.005);

  const crowdBoost = Math.min(0.15, recentReactionRate / 60 * 0.15);
  return Math.max(0, Math.min(1, base + crowdBoost));
}

// ---- LLM hype callouts ------------------------------------------------------

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface HypeCopy {
  callout: string;          // short hype line, max ~40 chars
  transitionStyle: string;  // 1-2 word transition name (e.g., "vinyl scratch")
}

const FALLBACK_TRANSITIONS = [
  "vinyl scratch", "filter sweep", "bass swap", "echo out",
  "double drop", "loop chop", "slow blend", "cut on the one",
];

function fallbackHype(next: CandidateTrack): HypeCopy {
  const style = FALLBACK_TRANSITIONS[Math.floor(Math.random() * FALLBACK_TRANSITIONS.length)];
  return { callout: `${next.title.toUpperCase()} — INCOMING`, transitionStyle: style };
}

export async function generateHypeCopy(
  current: CurrentDeckState,
  next: CandidateTrack,
  energyTarget: number,
): Promise<HypeCopy> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return fallbackHype(next);

  try {
    const res = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an underground techno DJ scripting your own hype callouts. " +
              "Output is rendered on a giant LED behind the booth in monospace caps. " +
              "Be terse, confident, evocative. No emoji. No quotes.",
          },
          {
            role: "user",
            content:
              `Now playing: "${current.title}" by ${current.artist}, energy ${current.energy ?? 0.5}, ${current.bpm ?? "?"} BPM.\n` +
              `Mixing into: "${next.title}" by ${next.artist}, energy ${next.energy ?? 0.5}, ${next.bpm ?? "?"} BPM.\n` +
              `Target room energy: ${energyTarget.toFixed(2)}.\n` +
              `Return strict JSON: {"callout": "<≤40 char hype line>", "transitionStyle": "<1-3 words>"}.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_hype",
              description: "Emit the hype callout and transition style.",
              parameters: {
                type: "object",
                properties: {
                  callout: { type: "string", maxLength: 60 },
                  transitionStyle: { type: "string", maxLength: 30 },
                },
                required: ["callout", "transitionStyle"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_hype" } },
      }),
    });
    if (!res.ok) return fallbackHype(next);
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return fallbackHype(next);
    const parsed = JSON.parse(args);
    return {
      callout: String(parsed.callout ?? "").slice(0, 60).toUpperCase(),
      transitionStyle: String(parsed.transitionStyle ?? "blend").slice(0, 30).toLowerCase(),
    };
  } catch (e) {
    console.error("Hype LLM failed:", e);
    return fallbackHype(next);
  }
}

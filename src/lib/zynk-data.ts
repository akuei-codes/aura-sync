// Mock data for the ZYNK prototype.

export type Track = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  energy: number; // 0..1
  duration: number; // seconds
  requestedBy?: string;
  votes?: number;
  cover?: string;
};

export type HypeEvent = {
  id: string;
  kind: "drop" | "scratch" | "callout" | "vinyl" | "ambient" | "build";
  label: string;
  at: number;
};

export const NOW_PLAYING: Track = {
  id: "now",
  title: "MIDNIGHT PROTOCOL",
  artist: "KAITO × LUNA",
  bpm: 124,
  key: "Am",
  energy: 0.78,
  duration: 312,
};

export const NEXT_UP: Track = {
  id: "next",
  title: "GLASS HOUSE",
  artist: "VOID PARADE",
  bpm: 126,
  key: "Em",
  energy: 0.82,
  duration: 274,
};

export const QUEUE: Track[] = [
  { id: "q1", title: "BLACKOUT FREQUENCY", artist: "NULA", bpm: 128, key: "Am", energy: 0.88, duration: 248, requestedBy: "marco", votes: 47 },
  { id: "q2", title: "PARALLEL LINES", artist: "ODE", bpm: 122, key: "Bm", energy: 0.65, duration: 301, requestedBy: "sky", votes: 38 },
  { id: "q3", title: "TURBINE", artist: "AVA / JIN", bpm: 132, key: "Fm", energy: 0.92, duration: 219, requestedBy: "jules", votes: 31 },
  { id: "q4", title: "WET CONCRETE", artist: "SOMA", bpm: 118, key: "Cm", energy: 0.55, duration: 287, requestedBy: "ren", votes: 22 },
  { id: "q5", title: "NEON ARTERIES", artist: "FAULT", bpm: 130, key: "Gm", energy: 0.85, duration: 256, requestedBy: "tomo", votes: 19 },
  { id: "q6", title: "AFTERIMAGE", artist: "PILOT 7", bpm: 124, key: "Am", energy: 0.72, duration: 264, requestedBy: "iris", votes: 14 },
];

export const RECENT_HYPE: HypeEvent[] = [
  { id: "h1", kind: "drop", label: "DROP — bar 32", at: 0 },
  { id: "h2", kind: "callout", label: '"MAKE SOME NOISE"', at: 4 },
  { id: "h3", kind: "scratch", label: "scratch transition", at: 9 },
  { id: "h4", kind: "vinyl", label: "vinyl crackle layer", at: 14 },
  { id: "h5", kind: "ambient", label: "ambient pad — Am", at: 22 },
  { id: "h6", kind: "build", label: "build-up 16 bars", at: 28 },
];

export const REACTIONS = ["🔥", "🖤", "⚡", "🌀", "💀", "🫨"] as const;

export const FAKE_NAMES = [
  "marco", "sky", "jules", "ren", "tomo", "iris", "neo", "kai",
  "ada", "lux", "mira", "zed", "yuki", "rune", "vik", "noa",
];

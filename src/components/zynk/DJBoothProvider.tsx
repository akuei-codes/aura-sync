// Global DJ Booth provider. Mounts the Spotify Web Playback SDK once at the
// app root so playback survives navigation between /dj, /audience, /projection.
//
// Activates whenever a slug+token is present in the URL OR remembered in
// sessionStorage from a previous page (the host's host context).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceToNextTrack,
  getSpotifyAccessToken,
  registerDeviceId,
  resumeCurrentOnDevice,
  setPlaybackPaused,
  syncPlaybackPosition,
  getCurrentTrack,
  getSession,
} from "@/lib/sessions.functions";
import { playRiser, playDrop, playSweepDown, playScratch, playImpact, playIntroSequence, playTransitionSequence, unlockSfx } from "@/lib/sfx";
import { speakCallout, stopCallout, prewarmDjVoice } from "@/lib/dj-voice";
import "@/lib/spotify-sdk";

interface DJBoothContextValue {
  active: boolean;
  deviceReady: boolean;
  playerError: string | null;
  togglePlayPause: () => Promise<void>;
  triggerAdvance: () => Promise<void>;
  hostSlug: string | null;
  hostToken: string | null;
}

const DJBoothContext = createContext<DJBoothContextValue>({
  active: false,
  deviceReady: false,
  playerError: null,
  togglePlayPause: async () => {},
  triggerAdvance: async () => {},
  hostSlug: null,
  hostToken: null,
});

export const useDJBooth = () => useContext(DJBoothContext);

const STORAGE_KEY = "zynk_dj_host";

function readStoredHost(): { slug: string; token: string } | null {
  if (typeof window === "undefined") return null;
  try {
    // Prefer sessionStorage (current tab), fall back to localStorage (resume after close)
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.slug && parsed?.token) return parsed;
  } catch { /* ignore */ }
  return null;
}

function writeStoredHost(slug: string, token: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ slug, token }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ slug, token }));
  } catch { /* ignore */ }
}

function clearStoredHost() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function DJBoothProvider({ children }: { children: React.ReactNode }) {
  const [hostSlug, setHostSlug] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [warnFree, setWarnFree] = useState(false);

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const advancingRef = useRef(false);
  const lastPickedRef = useRef<string | null>(null);

  // ---- Pick up host context from URL or sessionStorage ---------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const params = new URLSearchParams(window.location.search);
      const urlSlug = params.get("slug");
      const urlToken = params.get("token");
      const urlWarn = params.get("warn");
      if (urlSlug && urlToken) {
        writeStoredHost(urlSlug, urlToken);
        setHostSlug(urlSlug);
        setHostToken(urlToken);
        setWarnFree(urlWarn === "free");
        return;
      }
      // Fallback to remembered host (so audio survives navigation away from /dj).
      const stored = readStoredHost();
      if (stored) {
        setHostSlug(stored.slug);
        setHostToken(stored.token);
      }
    };
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  // Resolve session id from slug
  useEffect(() => {
    if (!hostSlug) { setSessionId(null); return; }
    let cancelled = false;
    getSession({ data: { slug: hostSlug } })
      .then((s) => { if (!cancelled) setSessionId((s as { id: string }).id); })
      .catch(() => { if (!cancelled) setSessionId(null); });
    return () => { cancelled = true; };
  }, [hostSlug]);

  const active = Boolean(hostSlug && hostToken && sessionId && !warnFree);

  // ---- Spotify Web Playback SDK (mounted once at root) ---------------------
  useEffect(() => {
    if (!active || !sessionId || !hostToken) return;
    let cancelled = false;

    const loadSdk = () =>
      new Promise<void>((resolve, reject) => {
        if (window.Spotify) return resolve();
        const existing = document.getElementById("spotify-sdk");
        if (existing) {
          existing.addEventListener("load", () => resolve());
          return;
        }
        const s = document.createElement("script");
        s.id = "spotify-sdk";
        s.src = "https://sdk.scdn.co/spotify-player.js";
        s.async = true;
        s.onerror = () => reject(new Error("Spotify SDK failed to load"));
        window.onSpotifyWebPlaybackSDKReady = () => resolve();
        document.body.appendChild(s);
      });

    (async () => {
      try {
        await loadSdk();
        if (cancelled || !window.Spotify) return;
        const player = new window.Spotify.Player({
          name: "ZYNK Booth",
          getOAuthToken: (cb) => {
            getSpotifyAccessToken({ data: { sessionId, djToken: hostToken } })
              .then((t) => cb(t.accessToken))
              .catch((e) => setPlayerError(String(e)));
          },
          volume: 0.85,
        });
        playerRef.current = player;
        player.addListener("ready", async (data) => {
          const { device_id } = data as { device_id: string };
          await registerDeviceId({ data: { sessionId, djToken: hostToken, deviceId: device_id } });
          setDeviceReady(true);
        });
        player.addListener("not_ready", () => setDeviceReady(false));
        player.addListener("initialization_error", (d) => setPlayerError(String((d as { message: string }).message)));
        player.addListener("authentication_error", (d) => setPlayerError(String((d as { message: string }).message)));
        player.addListener("account_error", () => setPlayerError("Spotify Premium required."));
        player.addListener("player_state_changed", (state) => {
          const st = state as { position: number; duration: number; paused: boolean; track_window?: { previous_tracks?: unknown[] } } | null;
          if (!st) return;
          const ended = st.paused && st.position === 0 && (st.track_window?.previous_tracks?.length ?? 0) > 0;
          if (ended) doAdvance({ withSfx: true });
        });
        await player.connect();
      } catch (e) {
        setPlayerError(e instanceof Error ? e.message : "Player init failed");
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      setDeviceReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionId, hostToken]);

  // ---- Position sync back to server ---------------------------------------
  useEffect(() => {
    if (!active || !sessionId || !hostToken || !deviceReady) return;
    const t = setInterval(async () => {
      try {
        const state = await playerRef.current?.getCurrentState();
        if (!state) return;
        await syncPlaybackPosition({
          data: { sessionId, djToken: hostToken, positionMs: state.position, isPaused: state.paused },
        });
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(t);
  }, [active, sessionId, hostToken, deviceReady]);

  // ---- Smart crossfade trigger: at ~65% of duration OR <8s remaining --------
  // We don't play full songs — cut earlier to keep energy moving.
  useEffect(() => {
    if (!active || !sessionId || !hostToken) return;
    const t = setInterval(async () => {
      try {
        const ct = await getCurrentTrack({ data: { slug: hostSlug! } });
        const session = await getSession({ data: { slug: hostSlug! } });
        if (!ct || !session?.ignited || !session?.autopilot) return;
        const elapsed = Date.now() - new Date(ct.position_set_at).getTime();
        const pos = ct.is_paused ? ct.position_ms_at : ct.position_ms_at + elapsed;
        const remaining = ct.duration_ms - pos;
        const energyCutPoint = ct.duration_ms * 0.65; // play 65% of each track
        const shouldCut = (pos >= energyCutPoint) || (remaining > 0 && remaining < 8000);
        if (shouldCut && !advancingRef.current) {
          doAdvance({ withSfx: true });
        }
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionId, hostToken, hostSlug]);

  // ---- Recover playback on device after late SDK init / refresh ------------
  useEffect(() => {
    if (!active || !sessionId || !hostToken || !deviceReady || !hostSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const ct = await getCurrentTrack({ data: { slug: hostSlug } });
        const session = await getSession({ data: { slug: hostSlug } });
        if (!ct || !session?.ignited || cancelled) return;
        if (lastPickedRef.current === ct.spotify_track_id) return;
        const ageMs = Date.now() - new Date(ct.position_set_at).getTime();
        if (ageMs < 3000) { lastPickedRef.current = ct.spotify_track_id; return; }
        lastPickedRef.current = ct.spotify_track_id;
        await resumeCurrentOnDevice({ data: { sessionId, djToken: hostToken } });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [active, deviceReady, sessionId, hostToken, hostSlug]);

  // ---- Voice ducking helpers (deep duck so DJ is front-of-mix) -------------
  const duck = useCallback(async () => {
    try { await playerRef.current?.setVolume(0.08); } catch { /* ignore */ }
  }, []);
  const unduck = useCallback(async () => {
    try { await playerRef.current?.setVolume(0.85); } catch { /* ignore */ }
  }, []);

  // ---- Core advance with smart crossfade & SFX -----------------------------
  const doAdvance = useCallback(async (opts: { withSfx?: boolean } = {}) => {
    if (advancingRef.current || !sessionId || !hostToken) return;
    advancingRef.current = true;
    try {
      // Layered transition SFX (scratch -> sweep -> riser -> drop)
      const player = playerRef.current;
      if (opts.withSfx) playTransitionSequence();
      if (player && opts.withSfx) {
        // Smooth volume ramp from 0.85 -> 0.2 over ~1.4s
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const v = 0.85 - ((0.85 - 0.2) * (i + 1) / steps);
          try { await player.setVolume(v); } catch { /* ignore */ }
          await new Promise((r) => setTimeout(r, 110));
        }
      }

      const result = await advanceToNextTrack({ data: { sessionId, djToken: hostToken } });

      if (opts.withSfx) {
        setTimeout(() => playImpact(0.45), 250);
      }

      // Restore volume
      if (player) {
        const steps = 8;
        for (let i = 0; i < steps; i++) {
          const v = 0.2 + ((0.85 - 0.2) * (i + 1) / steps);
          try { await player.setVolume(v); } catch { /* ignore */ }
          await new Promise((r) => setTimeout(r, 90));
        }
      }

      // Hype callout
      const nextTitle = (result as { nextTrack?: { title?: string } })?.nextTrack?.title;
      void speakCallout("transition", { trackTitle: nextTitle, onDuck: duck, onUnduck: unduck });
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : "advance failed");
    } finally {
      setTimeout(() => { advancingRef.current = false; }, 6000);
    }
  }, [sessionId, hostToken, duck, unduck]);

  // ---- Energy/vote watchers — event-driven callouts ------------------------
  const lastEnergyRef = useRef<number>(0);
  const lastReactionCountRef = useRef<number>(0);
  const lastAmbientRef = useRef<number>(Date.now());
  const lastIgnitedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!active || !hostSlug) return;
    const t = setInterval(async () => {
      try {
        const session = await getSession({ data: { slug: hostSlug } });
        if (!session) return;
        // Detect ignite transition -> play full intro sequence + ignite callout
        if (session.ignited && !lastIgnitedRef.current) {
          lastIgnitedRef.current = true;
          unlockSfx();
          playIntroSequence();
          setTimeout(() => {
            void speakCallout("ignite", { onDuck: duck, onUnduck: unduck, force: true });
          }, 4500);
        } else if (!session.ignited) {
          lastIgnitedRef.current = false;
        }
        const e = session.crowd_energy ?? 0;
        // More sensitive: energy spikes trigger hype sooner
        if (e - lastEnergyRef.current > 0.1 && e > 0.55) {
          void speakCallout("energy", { onDuck: duck, onUnduck: unduck });
        }
        lastEnergyRef.current = e;
        const r = session.reaction_count_total ?? 0;
        if (r - lastReactionCountRef.current > 4) {
          void speakCallout("fire", { onDuck: duck, onUnduck: unduck });
        }
        lastReactionCountRef.current = r;
        // Periodic ambient hype every ~45s when ignited
        if (session.ignited && Date.now() - lastAmbientRef.current > 45000) {
          lastAmbientRef.current = Date.now();
          const kinds: Array<"energy" | "fire" | "transition"> = ["energy", "fire", "transition"];
          void speakCallout(kinds[Math.floor(Math.random() * kinds.length)], { onDuck: duck, onUnduck: unduck });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(t);
  }, [active, hostSlug, duck, unduck]);

  // ---- Public API ----------------------------------------------------------
  const togglePlayPause = useCallback(async () => {
    if (!playerRef.current || !sessionId || !hostToken) return;
    try {
      await playerRef.current.togglePlay();
      const state = await playerRef.current.getCurrentState();
      if (state) {
        await setPlaybackPaused({ data: { sessionId, djToken: hostToken, paused: state.paused, positionMs: state.position } });
      }
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : "toggle failed");
    }
  }, [sessionId, hostToken]);

  const triggerAdvance = useCallback(async () => {
    unlockSfx();
    await doAdvance({ withSfx: true });
  }, [doAdvance]);

  // Expose a way to forget the host (logout / exit)
  useEffect(() => {
    (window as unknown as { __zynkClearHost?: () => void }).__zynkClearHost = () => {
      clearStoredHost();
      setHostSlug(null);
      setHostToken(null);
      setSessionId(null);
      stopCallout();
      playerRef.current?.disconnect();
      playerRef.current = null;
      setDeviceReady(false);
    };
  }, []);

  // Unlock AudioContext on first user gesture
  useEffect(() => {
    const unlock = () => { unlockSfx(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const value = useMemo<DJBoothContextValue>(() => ({
    active,
    deviceReady,
    playerError,
    togglePlayPause,
    triggerAdvance,
    hostSlug,
    hostToken,
  }), [active, deviceReady, playerError, togglePlayPause, triggerAdvance, hostSlug, hostToken]);

  return <DJBoothContext.Provider value={value}>{children}</DJBoothContext.Provider>;
}

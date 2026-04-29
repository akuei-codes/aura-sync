import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/zynk/Logo";
import { Equalizer } from "@/components/zynk/Equalizer";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";
import { useLiveSession } from "@/hooks/useLiveSession";
import {
  advanceToNextTrack,
  registerDeviceId,
  setAutopilot as setAutopilotFn,
  setAutoApprove as setAutoApproveFn,
  igniteRoom as igniteRoomFn,
  setPlaybackPaused,
  syncPlaybackPosition,
  updateEnergy,
  getSpotifyAccessToken,
  getPendingRequests,
  approveRequest,
  rejectRequest,
} from "@/lib/sessions.functions";

export const Route = createFileRoute("/dj")({
  validateSearch: z.object({
    slug: z.string().optional(),
    token: z.string().optional(),
    warn: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "ZYNK — DJ Dashboard" },
      { name: "description", content: "Conductor's seat. Live deck, AI hype injection, queue, energy." },
    ],
  }),
  component: DJ,
});

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: unknown) => void): void;
  removeListener(event: string): void;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getCurrentState(): Promise<{ position: number; duration: number; paused: boolean } | null>;
}

function DJ() {
  const { slug, token, warn } = Route.useSearch();
  const noSession = !slug || !token;
  const { session, queue, current, hype, error } = useLiveSession(slug ?? null);
  const [autopilot, setLocalAutopilot] = useState(true);
  const [autoApprove, setLocalAutoApprove] = useState(true);
  const [energyLocal, setEnergyLocal] = useState(0.55);
  const [position, setPosition] = useState(0);
  const [deviceReady, setDeviceReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [pending, setPending] = useState<Array<{ id: string; title: string; artist: string; album_image_url: string | null; requested_by: string | null }>>([]);
  const [igniting, setIgniting] = useState(false);
  const playerRef = useRef<SpotifyPlayer | null>(null);

  // Sync local controls with server state
  useEffect(() => {
    if (session) {
      setLocalAutopilot(session.autopilot);
      setLocalAutoApprove(session.auto_approve);
      setEnergyLocal(session.crowd_energy);
    }
  }, [session?.id]);

  // Live position ticker derived from current_track sync point
  useEffect(() => {
    if (!current) return;
    const tick = () => {
      const elapsed = Date.now() - new Date(current.position_set_at).getTime();
      setPosition(Math.min(current.duration_ms, current.position_ms_at + (current.is_paused ? 0 : elapsed)));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [current?.position_set_at, current?.position_ms_at, current?.is_paused, current?.duration_ms]);

  // ---- Spotify Web Playback SDK -------------------------------------------
  useEffect(() => {
    if (!session || !token || warn === "free") return;
    let cancelled = false;

    function loadSdk(): Promise<void> {
      return new Promise((resolve, reject) => {
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
    }

    (async () => {
      try {
        await loadSdk();
        if (cancelled || !window.Spotify) return;
        const player = new window.Spotify.Player({
          name: `ZYNK Booth · ${session.title}`,
          getOAuthToken: (cb: (token: string) => void) => {
            getSpotifyAccessToken({ data: { sessionId: session.id, djToken: token! } })
              .then((t: { accessToken: string }) => cb(t.accessToken))
              .catch((e: unknown) => setPlayerError(String(e)));
          },
          volume: 0.8,
        });
        playerRef.current = player;
        player.addListener("ready", async (data) => {
          const { device_id } = data as { device_id: string };
          await registerDeviceId({ data: { sessionId: session.id, djToken: token!, deviceId: device_id } });
          setDeviceReady(true);
        });
        player.addListener("not_ready", () => setDeviceReady(false));
        player.addListener("initialization_error", (d) => setPlayerError(String((d as { message: string }).message)));
        player.addListener("authentication_error", (d) => setPlayerError(String((d as { message: string }).message)));
        player.addListener("account_error", () => setPlayerError("Spotify Premium required."));
        await player.connect();
      } catch (e) {
        setPlayerError(e instanceof Error ? e.message : "Player init failed");
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [session?.id, token, warn]);

  // Periodically sync local Spotify player position back to server so audience can follow
  useEffect(() => {
    if (!session || !token || !playerRef.current || !deviceReady) return;
    const t = setInterval(async () => {
      try {
        const state = await playerRef.current!.getCurrentState();
        if (!state) return;
        await syncPlaybackPosition({
          data: { sessionId: session.id, djToken: token, positionMs: state.position, isPaused: state.paused },
        });
      } catch {
        /* swallow */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [session?.id, token, deviceReady]);

  // Autopilot: when track approaches end, automatically advance — but only after the host ignites.
  useEffect(() => {
    if (!autopilot || !session?.ignited || !session || !token || !current) return;
    const remaining = current.duration_ms - position;
    if (remaining < 4000 && remaining > 0 && !advancing) {
      setAdvancing(true);
      advanceToNextTrack({ data: { sessionId: session.id, djToken: token } })
        .catch((e) => setPlayerError(String(e)))
        .finally(() => setTimeout(() => setAdvancing(false), 5000));
    }
  }, [autopilot, position, current?.duration_ms, session?.id, session?.ignited, token]);

  // Poll pending requests when manual approval mode is on.
  useEffect(() => {
    if (!session || !token || autoApprove) { setPending([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await getPendingRequests({ data: { sessionId: session.id, djToken: token } });
        if (!cancelled) setPending(rows as typeof pending);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [session?.id, token, autoApprove]);

  async function ignite() {
    if (!session || !token || igniting) return;
    setIgniting(true);
    try {
      await igniteRoomFn({ data: { sessionId: session.id, djToken: token } });
      await advanceToNextTrack({ data: { sessionId: session.id, djToken: token } });
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : "ignite failed");
    } finally {
      setIgniting(false);
    }
  }

  async function togglePlayPause() {
    if (!playerRef.current || !session || !token) return;
    try {
      await playerRef.current.togglePlay();
      const state = await playerRef.current.getCurrentState();
      if (state) {
        await setPlaybackPaused({ data: { sessionId: session.id, djToken: token, paused: state.paused, positionMs: state.position } });
      }
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : "toggle failed");
    }
  }

  async function approve(id: string) {
    if (!session || !token) return;
    setPending((p) => p.filter((x) => x.id !== id));
    await approveRequest({ data: { sessionId: session.id, djToken: token, queueItemId: id } }).catch(() => {});
  }
  async function reject(id: string) {
    if (!session || !token) return;
    setPending((p) => p.filter((x) => x.id !== id));
    await rejectRequest({ data: { sessionId: session.id, djToken: token, queueItemId: id } }).catch(() => {});
  }
  async function toggleAutoApprove() {
    if (!session || !token) return;
    const next = !autoApprove;
    setLocalAutoApprove(next);
    await setAutoApproveFn({ data: { sessionId: session.id, djToken: token, enabled: next } });
  }

  if (noSession) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <Logo />
          <h1 className="font-display text-3xl font-bold">No session in this URL.</h1>
          <p className="text-sm text-muted-foreground">
            The DJ booth needs <span className="font-mono">?slug=&token=</span> in the URL. Start a new room to get one.
          </p>
          <Link to="/connect" className="inline-block px-5 py-3 bg-foreground text-background font-mono uppercase text-xs tracking-[0.3em]">
            start a session
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground noise relative">
      <header className="border-b hairline px-6 py-4 flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur z-30">
        <div className="flex items-center gap-6">
          <Logo size="sm" />
          <div className="hidden md:flex items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
            <span className={`w-2 h-2 rounded-full breathe ${session?.status === "live" ? "bg-foreground" : "bg-muted-foreground"}`} />
            {session ? `${session.status.toUpperCase()} · ${session.title} · ${session.live_listeners} souls` : "loading…"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NavPill to="/audience" search={{ slug }} label="Audience" />
          <NavPill to="/projection" search={{ slug }} label="Projection" />
          <NavPill to="/recap" search={{ slug }} label="Recap" />
          <NavPill to="/" label="↩ Exit" />
        </div>
      </header>

      {(error || playerError || warn === "free") && (
        <div className="bg-foreground/10 border-b hairline px-6 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground">
          {warn === "free" && "⚠ free spotify account — playback disabled. premium needed for booth."}
          {playerError && ` · player: ${playerError}`}
          {error && ` · live: ${error}`}
        </div>
      )}

      <div className="grid grid-cols-12 gap-px bg-hairline">
        <main className="col-span-12 lg:col-span-8 bg-background p-6 lg:p-10 space-y-8">
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ now playing — deck a ]</div>
              <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                {current ? `${fmt(position)} / ${fmt(current.duration_ms)}` : "—"}
              </div>
            </div>

            <div className="grid md:grid-cols-[160px_1fr] gap-8 items-center">
              <div className="relative aspect-square bg-gradient-mono border hairline overflow-hidden">
                {current?.album_image_url ? (
                  <img src={current.album_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-2 rounded-full bg-black border hairline vinyl-spin">
                    <div className="absolute inset-[35%] rounded-full bg-gradient-zynk" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight truncate">
                  {current?.title ?? "AWAITING DROP"}
                </h2>
                <div className="mt-2 font-mono text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  {current?.artist ?? "queue a track to begin"}
                </div>
                <div className="mt-6 grid grid-cols-4 gap-4 max-w-md">
                  <Stat k="BPM" v={current?.bpm ? Math.round(current.bpm) : "—"} />
                  <Stat k="NRG" v={current?.energy != null ? Math.round(current.energy * 100) : "—"} />
                  <Stat k="DECK" v="A" />
                  <Stat k="DEV" v={deviceReady ? "✓" : "…"} />
                </div>
              </div>
            </div>

            <Waveform position={current ? position / current.duration_ms : 0} />
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ projection — live ]</div>
              <Link
                to="/projection"
                search={{ slug }}
                className="text-xs font-mono uppercase tracking-[0.3em] hover:text-foreground text-muted-foreground"
              >
                ↗ open fullscreen
              </Link>
            </div>
            <div className="relative aspect-video border hairline overflow-hidden bg-black">
              <ProjectionEngine
                energy={session?.crowd_energy ?? 0.5}
                bpm={current?.bpm ?? 124}
                mode={(session?.projection_mode ?? "auto") as "auto" | "abstract" | "silhouette"}
              />
              <div className="absolute top-3 left-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/80">
                <span className="w-1.5 h-1.5 bg-foreground rounded-full breathe" /> projecting · {session?.projection_mode ?? "auto"}
              </div>
            </div>
          </section>

          <section className="grid md:grid-cols-3 gap-6">
            <ControlCard label="AI Autopilot" value={autopilot ? "ENGAGED" : "MANUAL"} accent>
              <button
                onClick={async () => {
                  if (!session || !token) return;
                  const next = !autopilot;
                  setLocalAutopilot(next);
                  await setAutopilotFn({ data: { sessionId: session.id, djToken: token, enabled: next } });
                }}
                className={`mt-4 w-full py-3 font-mono text-xs uppercase tracking-[0.3em] border ${autopilot ? "bg-foreground text-background" : "border-foreground"}`}
              >
                {autopilot ? "release control" : "let AI take over"}
              </button>
            </ControlCard>

            <ControlCard label="Energy Floor" value={Math.round(energyLocal * 100)}>
              <input
                type="range" min={0} max={100} value={Math.round(energyLocal * 100)}
                onChange={(e) => setEnergyLocal(Number(e.target.value) / 100)}
                onMouseUp={() => session && token && updateEnergy({ data: { sessionId: session.id, djToken: token, energy: energyLocal } })}
                onTouchEnd={() => session && token && updateEnergy({ data: { sessionId: session.id, djToken: token, energy: energyLocal } })}
                className="mt-4 w-full accent-white"
              />
            </ControlCard>

            <ControlCard label="Drop Now" value={`${queue.length} queued`}>
              <button
                disabled={advancing || !deviceReady || queue.length === 0}
                onClick={async () => {
                  if (!session || !token) return;
                  setAdvancing(true);
                  try {
                    await advanceToNextTrack({ data: { sessionId: session.id, djToken: token } });
                  } catch (e) {
                    setPlayerError(e instanceof Error ? e.message : "advance failed");
                  } finally {
                    setAdvancing(false);
                  }
                }}
                className="mt-4 w-full py-3 font-mono text-xs uppercase tracking-[0.3em] border border-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-40"
              >
                {advancing ? "mixing…" : "drop now ⚡"}
              </button>
            </ControlCard>
          </section>
        </main>

        <aside className="col-span-12 lg:col-span-4 bg-card p-6 lg:p-8 space-y-8 min-h-screen">
          <section>
            <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground mb-3">[ up next — top of queue ]</div>
            {queue[0] ? (
              <div className="border hairline p-4 bg-background relative shimmer">
                <div className="font-display text-xl font-bold truncate">{queue[0].title}</div>
                <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground truncate">{queue[0].artist}</div>
                <div className="mt-3 flex gap-3 text-[10px] font-mono uppercase text-muted-foreground">
                  {queue[0].bpm != null && <span>{Math.round(queue[0].bpm)} BPM</span>}
                  {queue[0].energy != null && <span>· NRG {Math.round(queue[0].energy * 100)}</span>}
                  <span>· {queue[0].vote_count} votes</span>
                </div>
              </div>
            ) : (
              <div className="border hairline p-4 bg-background text-xs text-muted-foreground font-mono">
                queue is empty — share /audience link to get requests.
              </div>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ request queue ]</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">{queue.length} live</div>
            </div>
            <ul className="space-y-2 max-h-[40vh] overflow-y-auto">
              {queue.map((t, i) => (
                <li key={t.id} className="group border hairline p-3 bg-background hover:bg-secondary transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground w-6">#{(i + 1).toString().padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-semibold truncate">{t.title}</div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                        {t.artist}
                        {t.bpm && ` · ${Math.round(t.bpm)} BPM`}
                        {t.requested_by && ` · @${t.requested_by}`}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-display font-bold text-lg leading-none">{t.vote_count}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">votes</span>
                    </div>
                  </div>
                </li>
              ))}
              {queue.length === 0 && (
                <li className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground py-3">no requests yet</li>
              )}
            </ul>
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ AI hype ]</div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
                <Equalizer bars={3} />
                {hype.length} events
              </div>
            </div>
            <ul className="space-y-2 font-mono text-xs">
              {hype.map((h) => (
                <li key={h.id} className="flex items-start gap-3 border-l-2 border-foreground/40 pl-3 py-1">
                  <span className="uppercase tracking-[0.2em] text-muted-foreground w-20 shrink-0">{h.kind}</span>
                  <span className="text-foreground truncate">{h.label}</span>
                </li>
              ))}
              {hype.length === 0 && (
                <li className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">silence. waiting for the first drop.</li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function NavPill({ to, label, search }: { to: string; label: string; search?: Record<string, string | undefined> }) {
  return (
    <Link
      to={to}
      search={search as never}
      className="text-[10px] font-mono uppercase tracking-[0.3em] border hairline px-3 py-2 hover:bg-foreground hover:text-background transition-colors"
    >
      {label}
    </Link>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="border-l hairline pl-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{k}</div>
      <div className="font-display text-2xl font-bold tabular-nums">{v}</div>
    </div>
  );
}

function ControlCard({ label, value, children, accent }: { label: string; value: string | number; children?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`border hairline p-5 ${accent ? "bg-secondary" : "bg-card"} relative`}>
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="font-display text-3xl font-bold mt-1 tabular-nums">{value}</div>
      {children}
    </div>
  );
}

function Waveform({ position }: { position: number }) {
  const bars = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 140; i++) {
      const v =
        0.4 +
        0.5 * Math.abs(Math.sin(i * 0.21)) *
          (0.6 + 0.4 * Math.sin(i * 0.07)) +
        (i % 17 === 0 ? 0.25 : 0);
      arr.push(Math.min(1, v));
    }
    return arr;
  }, []);
  return (
    <div className="mt-8 relative h-24 border hairline bg-card overflow-hidden">
      <div className="absolute inset-0 flex items-center px-2 gap-[2px]">
        {bars.map((b, i) => {
          const past = i / bars.length < position;
          return (
            <span
              key={i}
              className={past ? "bg-foreground" : "bg-muted-foreground/40"}
              style={{ height: `${b * 100}%`, width: "3px" }}
            />
          );
        })}
      </div>
      <div className="absolute top-0 bottom-0 w-px bg-foreground" style={{ left: `${position * 100}%` }}>
        <span className="absolute -top-1 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45" />
      </div>
    </div>
  );
}

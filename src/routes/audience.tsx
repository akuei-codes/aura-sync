import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Equalizer } from "@/components/zynk/Equalizer";
import { Logo } from "@/components/zynk/Logo";
import { useLiveSession } from "@/hooks/useLiveSession";
import {
  heartbeat,
  requestTrack,
  searchPublic,
  sendReaction,
  voteForTrack,
} from "@/lib/sessions.functions";

const REACTIONS = ["🔥", "🖤", "⚡", "🌀", "💀", "🫨"] as const;

export const Route = createFileRoute("/audience")({
  validateSearch: z.object({ slug: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "ZYNK — Audience" },
      { name: "description", content: "Request, vote, react. The AI DJ feels you." },
    ],
  }),
  component: Audience,
});

type Floater = { id: number; bornAt: number; emoji: string; left: number };

function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem("zynk_cid");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("zynk_cid", id);
  }
  return id;
}

function Audience() {
  const { slug } = Route.useSearch();
  const { session, queue, current, reactions: liveReactions, error } = useLiveSession(slug ?? null);
  const [tab, setTab] = useState<"feel" | "vote" | "request">("feel");
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    id: string; name: string; artists: Array<{ name: string }>; album: { images: Array<{ url: string }> };
  }>>([]);
  const [searching, setSearching] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const clientId = useMemo(() => getClientId(), []);

  // Heartbeat presence every 15s
  useEffect(() => {
    if (!slug) return;
    const beat = () => heartbeat({ data: { slug, clientId } }).catch(() => {});
    beat();
    const t = setInterval(beat, 15000);
    return () => clearInterval(t);
  }, [slug, clientId]);

  // Render floaters from live reactions stream
  useEffect(() => {
    if (liveReactions.length === 0) return;
    const last = liveReactions[liveReactions.length - 1];
    const id = last.at + Math.floor(Math.random() * 1e6);
    setFloaters((f) => [...f, { id, bornAt: Date.now(), emoji: last.emoji, left: 10 + Math.random() * 80 }]);
  }, [liveReactions.length]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setFloaters((f) => f.filter((x) => now - x.bornAt < 3500));
    }, 800);
    return () => clearInterval(t);
  }, []);

  // Audience preview playback (30s clips)
  useEffect(() => {
    if (!current?.preview_url) {
      previewRef.current?.pause();
      return;
    }
    if (!previewRef.current) {
      previewRef.current = new Audio();
      previewRef.current.volume = 0.6;
    }
    if (previewRef.current.src !== current.preview_url) {
      previewRef.current.src = current.preview_url;
      previewRef.current.play().catch(() => { /* user gesture required */ });
    }
    return () => { previewRef.current?.pause(); };
  }, [current?.preview_url]);

  async function react(emoji: string) {
    if (!slug) return;
    setFloaters((f) => [...f, { id: Date.now() + Math.random(), bornAt: Date.now(), emoji, left: 10 + Math.random() * 80 }]);
    sendReaction({ data: { slug, emoji, clientId } }).catch(() => {});
  }

  async function vote(queueItemId: string) {
    if (!slug || voted.has(queueItemId)) return;
    setVoted((s) => new Set(s).add(queueItemId));
    voteForTrack({ data: { slug, queueItemId, clientId } }).catch(() => {});
  }

  // Debounced search
  useEffect(() => {
    if (!slug || !search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchPublic({ data: { slug, query: search.trim() } });
        setSearchResults(res as typeof searchResults);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, slug]);

  async function queueRequest(spotifyTrackId: string) {
    if (!slug) return;
    try {
      await requestTrack({ data: { slug, spotifyTrackId } });
      setSearch("");
      setSearchResults([]);
      setTab("vote");
    } catch (e) {
      console.error(e);
    }
  }

  if (!slug) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <Logo />
          <h1 className="font-display text-2xl font-bold">No room in this URL.</h1>
          <p className="text-sm text-muted-foreground">Ask the DJ for the audience link — it ends in <span className="font-mono">?slug=...</span></p>
          <Link to="/" className="inline-block px-4 py-2 border border-foreground font-mono uppercase text-[10px] tracking-[0.3em]">↩ home</Link>
        </div>
      </div>
    );
  }

  const energyPct = Math.round((session?.crowd_energy ?? 0.5) * 100);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden noise max-w-md mx-auto border-x hairline">
      <header className="px-5 pt-5 pb-4 flex items-center justify-between sticky top-0 z-30 bg-background/95 backdrop-blur border-b hairline">
        <Logo size="sm" />
        <Link to="/" className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">leave</Link>
      </header>

      {error && (
        <div className="bg-foreground/10 px-5 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground">
          {error}
        </div>
      )}

      <section className="px-5 py-6 border-b hairline">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
          <Equalizer bars={4} />
          <span>{session ? `${session.title} · now on the floor` : "joining…"}</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight leading-tight">
          {current?.title ?? "Awaiting the first drop"}
        </h1>
        <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mt-1">
          {current?.artist ?? "—"}
        </div>
        {queue[0] && (
          <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            UP NEXT · {queue[0].title} <span className="text-foreground/60">— {queue[0].artist}</span>
          </div>
        )}
      </section>

      <section className="px-5 py-6 border-b hairline relative">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">crowd energy</div>
          <div className="font-display font-bold text-xl tabular-nums">
            {energyPct}<span className="text-muted-foreground text-sm">/100</span>
          </div>
        </div>
        <div className="mt-3 relative h-3 bg-secondary border hairline overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gradient-zynk transition-all duration-700" style={{ width: `${energyPct}%` }} />
          <div className="absolute inset-y-0 left-0 bg-foreground/20" style={{ width: `${energyPct}%` }} />
        </div>
        <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          {energyPct > 80 ? "the AI is escalating →" : energyPct > 60 ? "holding the build" : "warming up..."}
        </div>
      </section>

      <nav className="grid grid-cols-3 border-b hairline sticky top-[60px] z-20 bg-background/95 backdrop-blur">
        {(["feel", "vote", "request"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 text-[11px] font-mono uppercase tracking-[0.4em] transition-colors ${
              tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "feel" && (
        <section className="px-5 py-8 relative min-h-[60vh]">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">tap to send to the AI</div>
          <p className="mt-2 font-display text-2xl font-bold leading-tight">React. The DJ feels every signal.</p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => react(r)}
                className="aspect-square border hairline bg-card text-4xl flex items-center justify-center hover:bg-secondary active:scale-95 transition-transform"
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              for (let i = 0; i < 8; i++) react(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
            }}
            className="mt-6 w-full py-5 bg-foreground text-background font-mono uppercase text-xs tracking-[0.4em] pulse-ring relative"
          >
            ⚡ HYPE THE DROP
          </button>

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {floaters.map((f) => (
              <span
                key={f.id}
                className="absolute bottom-10 text-3xl"
                style={{ left: `${f.left}%`, animation: "float-up 3.4s ease-out forwards" }}
              >
                {f.emoji}
              </span>
            ))}
          </div>
        </section>
      )}

      {tab === "vote" && (
        <section className="px-5 py-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">vote what plays next</div>
          <ul className="mt-4 space-y-2">
            {queue.map((t, i) => {
              const isVoted = voted.has(t.id);
              return (
                <li key={t.id} className="border hairline p-3 bg-card flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground w-6">#{(i + 1).toString().padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold truncate">{t.title}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                      {t.artist}{t.bpm && ` · ${Math.round(t.bpm)} BPM`}
                    </div>
                  </div>
                  <button
                    onClick={() => vote(t.id)}
                    disabled={isVoted}
                    className={`px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] border ${isVoted ? "bg-foreground text-background border-foreground" : "border-foreground hover:bg-foreground hover:text-background"} transition-colors`}
                  >
                    {isVoted ? "✓" : "↑"} {t.vote_count}
                  </button>
                </li>
              );
            })}
            {queue.length === 0 && (
              <li className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground py-6 text-center">
                empty queue. drop a request →
              </li>
            )}
          </ul>
        </section>
      )}

      {tab === "request" && (
        <section className="px-5 py-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">drop a song into the queue</div>
          <div className="mt-4 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search Spotify..."
              className="w-full bg-card border hairline px-4 py-4 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
            />
            {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">...</span>}
          </div>

          <ul className="mt-4 space-y-2">
            {searchResults.map((t) => (
              <li key={t.id} className="border hairline p-3 flex items-center gap-3 bg-card">
                {t.album.images[0] && <img src={t.album.images[0].url} alt="" className="w-10 h-10 shrink-0 object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold truncate">{t.name}</div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                    {t.artists.map((a) => a.name).join(", ")}
                  </div>
                </div>
                <button
                  onClick={() => queueRequest(t.id)}
                  className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] border border-foreground hover:bg-foreground hover:text-background transition-colors"
                >
                  + queue
                </button>
              </li>
            ))}
            {!search && queue.slice(0, 4).length > 0 && (
              <li className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground pt-2">
                trending in this room
              </li>
            )}
            {!search && queue.slice(0, 4).map((t) => (
              <li key={t.id} className="border hairline p-3 flex items-center gap-3 bg-card">
                <div className="w-10 h-10 bg-gradient-zynk shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold truncate">{t.title}</div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">{t.artist}</div>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{t.vote_count}♥</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t hairline px-5 py-4 mt-4 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
        <span className="w-1.5 h-1.5 bg-foreground rounded-full breathe" />
        {session?.live_listeners ?? 0} connected
      </footer>
    </div>
  );
}

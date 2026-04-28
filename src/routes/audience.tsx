import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Equalizer } from "@/components/zynk/Equalizer";
import { Logo } from "@/components/zynk/Logo";
import { NOW_PLAYING, NEXT_UP, QUEUE, REACTIONS, FAKE_NAMES } from "@/lib/zynk-data";

export const Route = createFileRoute("/audience")({
  head: () => ({
    meta: [
      { title: "ZYNK — Audience" },
      { name: "description", content: "Request, vote, react. The AI DJ feels you." },
    ],
  }),
  component: Audience,
});

type Floater = { id: number; bornAt: number; emoji: string; left: number; delay: number };

function Audience() {
  const [energy, setEnergy] = useState(72);
  const [tab, setTab] = useState<"feel" | "vote" | "request">("feel");
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [votes, setVotes] = useState<Record<string, number>>(
    Object.fromEntries(QUEUE.map((q) => [q.id, q.votes ?? 0]))
  );
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Synthetic crowd activity
  useEffect(() => {
    const t = setInterval(() => {
      setEnergy((e) => Math.max(20, Math.min(100, e + (Math.random() - 0.5) * 6)));
      setVotes((v) => {
        const id = QUEUE[Math.floor(Math.random() * QUEUE.length)].id;
        return { ...v, [id]: (v[id] ?? 0) + 1 };
      });
    }, 1800);
    return () => clearInterval(t);
  }, []);

  // Auto-clear floaters
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setFloaters((f) => f.filter((x) => now - x.bornAt < 3500));
    }, 800);
    return () => clearInterval(t);
  }, []);

  function react(emoji: string) {
    const bornAt = Date.now();
    const id = bornAt + Math.floor(Math.random() * 1e6);
    setFloaters((f) => [...f, { id, bornAt, emoji, left: 10 + Math.random() * 80, delay: 0 }]);
    setEnergy((e) => Math.min(100, e + 1.5));
  }

  function vote(id: string) {
    if (voted.has(id)) return;
    setVoted((s) => new Set(s).add(id));
    setVotes((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
  }

  const sortedQueue = useMemo(
    () => [...QUEUE].sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0)),
    [votes]
  );

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden noise max-w-md mx-auto border-x hairline">
      {/* Top */}
      <header className="px-5 pt-5 pb-4 flex items-center justify-between sticky top-0 z-30 bg-background/95 backdrop-blur border-b hairline">
        <Logo size="sm" />
        <Link to="/" className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">leave</Link>
      </header>

      {/* Now playing */}
      <section className="px-5 py-6 border-b hairline">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
          <Equalizer bars={4} />
          <span>now on the floor</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight leading-tight">{NOW_PLAYING.title}</h1>
        <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground mt-1">{NOW_PLAYING.artist}</div>
        <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          UP NEXT · {NEXT_UP.title} <span className="text-foreground/60">— {NEXT_UP.artist}</span>
        </div>
      </section>

      {/* Energy meter */}
      <section className="px-5 py-6 border-b hairline relative">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">crowd energy</div>
          <div className="font-display font-bold text-xl tabular-nums">{Math.round(energy)}<span className="text-muted-foreground text-sm">/100</span></div>
        </div>
        <div className="mt-3 relative h-3 bg-secondary border hairline overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gradient-zynk transition-all duration-700" style={{ width: `${energy}%` }} />
          <div className="absolute inset-y-0 left-0 bg-foreground/20" style={{ width: `${energy}%` }} />
        </div>
        <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          {energy > 80 ? "the AI is escalating →" : energy > 60 ? "holding the build" : "warming up..."}
        </div>
      </section>

      {/* Tabs */}
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

      {/* Tab content */}
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
              setEnergy((e) => Math.min(100, e + 12));
              for (let i = 0; i < 8; i++) react(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
            }}
            className="mt-6 w-full py-5 bg-foreground text-background font-mono uppercase text-xs tracking-[0.4em] pulse-ring relative"
          >
            ⚡ HYPE THE DROP
          </button>

          {/* Floating reactions */}
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
            {sortedQueue.map((t, i) => {
              const isVoted = voted.has(t.id);
              const v = votes[t.id] ?? 0;
              return (
                <li key={t.id} className="border hairline p-3 bg-card flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground w-6">#{(i + 1).toString().padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold truncate">{t.title}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">{t.artist} · {t.bpm} BPM</div>
                  </div>
                  <button
                    onClick={() => vote(t.id)}
                    disabled={isVoted}
                    className={`px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] border ${isVoted ? "bg-foreground text-background border-foreground" : "border-foreground hover:bg-foreground hover:text-background"} transition-colors`}
                  >
                    {isVoted ? "✓" : "↑"} {v}
                  </button>
                </li>
              );
            })}
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
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">⌘K</span>
          </div>

          {!search && (
            <div className="mt-6">
              <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground mb-3">trending in this room</div>
              <ul className="space-y-2">
                {QUEUE.slice(0, 4).map((t) => (
                  <li key={t.id} className="border hairline p-3 flex items-center gap-3 bg-card">
                    <div className="w-10 h-10 bg-gradient-zynk shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-bold truncate">{t.title}</div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">{t.artist}</div>
                    </div>
                    <button className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] border border-foreground hover:bg-foreground hover:text-background transition-colors">
                      + queue
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {search && (
            <div className="mt-4 border hairline p-4 bg-card text-sm text-muted-foreground font-mono">
              <div className="text-foreground font-display text-base">"{search}"</div>
              <div className="mt-2 text-xs">↳ Spotify search would surface here. Connect your account to send it to the floor.</div>
              <button className="mt-4 w-full py-3 bg-foreground text-background uppercase text-[10px] tracking-[0.3em]">
                Connect Spotify
              </button>
            </div>
          )}
        </section>
      )}

      {/* Live presence ticker */}
      <footer className="border-t hairline px-5 py-4 mt-4 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
        <span className="w-1.5 h-1.5 bg-foreground rounded-full breathe" />
        412 connected · {FAKE_NAMES.slice(0, 3).join(" · ")} just joined
      </footer>
    </div>
  );
}

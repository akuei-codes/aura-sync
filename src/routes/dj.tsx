import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/zynk/Logo";
import { Equalizer } from "@/components/zynk/Equalizer";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";
import { NOW_PLAYING, NEXT_UP, QUEUE, RECENT_HYPE } from "@/lib/zynk-data";

export const Route = createFileRoute("/dj")({
  head: () => ({
    meta: [
      { title: "ZYNK — DJ Dashboard" },
      { name: "description", content: "Conductor's seat. Live deck, AI hype injection, queue, energy." },
    ],
  }),
  component: DJ,
});

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function DJ() {
  const [position, setPosition] = useState(78);
  const [energy, setEnergy] = useState(0.78);
  const [autopilot, setAutopilot] = useState(true);
  const [mixIn, setMixIn] = useState(46); // seconds until next mix
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTick((x) => x + 1);
      setPosition((p) => (p + 1) % NOW_PLAYING.duration);
      setMixIn((m) => Math.max(0, m - 1));
      // gentle autonomous energy drift
      setEnergy((e) => {
        const target = 0.55 + 0.35 * Math.sin(Date.now() / 9000);
        return e + (target - e) * 0.04;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // synthetic crowd hype that ticks up
  const hypeRate = useMemo(() => Math.round(40 + energy * 180), [energy]);

  return (
    <div className="min-h-screen bg-background text-foreground noise relative">
      {/* Top bar */}
      <header className="border-b hairline px-6 py-4 flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur z-30">
        <div className="flex items-center gap-6">
          <Logo size="sm" />
          <div className="hidden md:flex items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
            <span className="w-2 h-2 bg-foreground rounded-full breathe" />
            LIVE · the warehouse · 412 souls
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NavPill to="/audience" label="Audience" />
          <NavPill to="/projection" label="Projection" />
          <NavPill to="/" label="↩ Exit" />
        </div>
      </header>

      <div className="grid grid-cols-12 gap-px bg-hairline">
        {/* LEFT — Decks + projection preview */}
        <main className="col-span-12 lg:col-span-8 bg-background p-6 lg:p-10 space-y-8">
          {/* Now playing */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ now playing — deck a ]</div>
              <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">{fmt(position)} / {fmt(NOW_PLAYING.duration)}</div>
            </div>

            <div className="grid md:grid-cols-[160px_1fr] gap-8 items-center">
              <div className="relative aspect-square bg-gradient-mono border hairline overflow-hidden">
                <div className="absolute inset-2 rounded-full bg-black border hairline vinyl-spin">
                  <div className="absolute inset-[35%] rounded-full bg-gradient-zynk" />
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight truncate">{NOW_PLAYING.title}</h2>
                <div className="mt-2 font-mono text-sm uppercase tracking-[0.3em] text-muted-foreground">{NOW_PLAYING.artist}</div>
                <div className="mt-6 grid grid-cols-4 gap-4 max-w-md">
                  <Stat k="BPM" v={NOW_PLAYING.bpm} />
                  <Stat k="KEY" v={NOW_PLAYING.key} />
                  <Stat k="NRG" v={`${Math.round(NOW_PLAYING.energy * 100)}`} />
                  <Stat k="DECK" v="A" />
                </div>
              </div>
            </div>

            {/* Waveform */}
            <Waveform position={position / NOW_PLAYING.duration} />
          </section>

          {/* Projection preview */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ projection — live ]</div>
              <Link to="/projection" className="text-xs font-mono uppercase tracking-[0.3em] hover:text-foreground text-muted-foreground">↗ open fullscreen</Link>
            </div>
            <div className="relative aspect-video border hairline overflow-hidden bg-black">
              <ProjectionEngine energy={energy} bpm={NOW_PLAYING.bpm} mode="auto" />
              <div className="absolute top-3 left-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/80">
                <span className="w-1.5 h-1.5 bg-foreground rounded-full breathe" /> projecting · auto-mode
              </div>
            </div>
          </section>

          {/* Mix controls */}
          <section className="grid md:grid-cols-3 gap-6">
            <ControlCard label="AI Autopilot" value={autopilot ? "ENGAGED" : "MANUAL"} accent>
              <button
                onClick={() => setAutopilot((a) => !a)}
                className={`mt-4 w-full py-3 font-mono text-xs uppercase tracking-[0.3em] border ${autopilot ? "bg-foreground text-background" : "border-foreground"}`}
              >
                {autopilot ? "release control" : "let AI take over"}
              </button>
            </ControlCard>
            <ControlCard label="Energy Floor" value={`${Math.round(energy * 100)}`}>
              <input
                type="range" min={0} max={100} value={Math.round(energy * 100)}
                onChange={(e) => setEnergy(Number(e.target.value) / 100)}
                className="mt-4 w-full accent-white"
              />
            </ControlCard>
            <ControlCard label="Next Mix In" value={`${mixIn}s`}>
              <button onClick={() => setMixIn(0)} className="mt-4 w-full py-3 font-mono text-xs uppercase tracking-[0.3em] border border-foreground hover:bg-foreground hover:text-background transition-colors">
                drop now ⚡
              </button>
            </ControlCard>
          </section>
        </main>

        {/* RIGHT — queue + hype */}
        <aside className="col-span-12 lg:col-span-4 bg-card p-6 lg:p-8 space-y-8 min-h-screen">
          {/* Up next */}
          <section>
            <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground mb-3">[ up next — deck b ]</div>
            <div className="border hairline p-4 bg-background relative shimmer">
              <div className="font-display text-xl font-bold truncate">{NEXT_UP.title}</div>
              <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">{NEXT_UP.artist}</div>
              <div className="mt-3 flex gap-3 text-[10px] font-mono uppercase text-muted-foreground">
                <span>{NEXT_UP.bpm} BPM</span>
                <span>·</span>
                <span>KEY {NEXT_UP.key}</span>
                <span>·</span>
                <span>NRG {Math.round(NEXT_UP.energy * 100)}</span>
              </div>
              <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/70">
                AI plan: build-up → drop on bar 16 with vinyl scratch transition
              </div>
            </div>
          </section>

          {/* Queue */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ request queue ]</div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">{QUEUE.length} live</div>
            </div>
            <ul className="space-y-2">
              {QUEUE.map((t, i) => (
                <li key={t.id} className="group border hairline p-3 bg-background hover:bg-secondary transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground w-6">#{(i + 1).toString().padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-semibold truncate">{t.title}</div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                        {t.artist} · {t.bpm} BPM · @{t.requestedBy}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-display font-bold text-lg leading-none">{t.votes}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">votes</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Hype feed */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">[ AI hype ]</div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
                <Equalizer bars={3} />
                {hypeRate}/min
              </div>
            </div>
            <ul className="space-y-2 font-mono text-xs">
              {RECENT_HYPE.map((h) => (
                <li key={h.id} className="flex items-center gap-3 border-l-2 border-foreground/40 pl-3 py-1">
                  <span className="text-muted-foreground tabular-nums w-10">-{h.at.toString().padStart(2, "0")}s</span>
                  <span className="uppercase tracking-[0.2em] text-muted-foreground w-20">{h.kind}</span>
                  <span className="text-foreground truncate">{h.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function NavPill({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="text-[10px] font-mono uppercase tracking-[0.3em] border hairline px-3 py-2 hover:bg-foreground hover:text-background transition-colors">
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
  // Deterministic synthetic waveform
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
      <div
        className="absolute top-0 bottom-0 w-px bg-foreground"
        style={{ left: `${position * 100}%` }}
      >
        <span className="absolute -top-1 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45" />
      </div>
    </div>
  );
}

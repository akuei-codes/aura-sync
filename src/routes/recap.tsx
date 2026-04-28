import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Logo } from "@/components/zynk/Logo";
import { QUEUE, NOW_PLAYING, FAKE_NAMES } from "@/lib/zynk-data";

export const Route = createFileRoute("/recap")({
  head: () => ({
    meta: [
      { title: "ZYNK — The Night, in Data" },
      { name: "description", content: "Your set, mapped. Energy curves, peak moments, who showed up." },
      { property: "og:title", content: "ZYNK — Recap" },
      { property: "og:description", content: "An AI DJ set, visualized." },
    ],
  }),
  component: Recap,
});

function Recap() {
  // Build a deterministic "energy curve" for the night
  const points = useMemo(() => {
    const N = 120;
    const arr: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      // Multi-stage arc: warm-up, peak 1, breakdown, peak 2, taper
      const v =
        0.25 +
        0.55 * Math.pow(Math.sin(x * Math.PI), 1.6) +
        0.25 * Math.sin(x * Math.PI * 4) * Math.sin(x * Math.PI) +
        0.08 * Math.sin(x * 23);
      arr.push(Math.max(0.05, Math.min(1, v)));
    }
    return arr;
  }, []);

  const peakIdx = points.indexOf(Math.max(...points));
  const w = 1000;
  const h = 260;
  const path = useMemo(() => {
    return points
      .map((v, i) => {
        const x = (i / (points.length - 1)) * w;
        const y = h - v * h;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;

  const moments = [
    { t: "00:14", label: "Doors. 38 souls.", kind: "open" },
    { t: "00:42", label: "First drop — vinyl crackle into Am.", kind: "drop" },
    { t: "01:10", label: "AI flips to silhouette mode.", kind: "visual" },
    { t: "01:33", label: "Peak — 412 hands in the air.", kind: "peak" },
    { t: "02:08", label: "Breakdown. 16-bar ambient pad.", kind: "calm" },
    { t: "02:51", label: "Surprise: crowd-requested 'TURBINE' wins vote.", kind: "vote" },
    { t: "03:24", label: "Final drop. Strobe, full silhouette.", kind: "drop" },
    { t: "03:58", label: "Soft taper. Lights up. ✓", kind: "close" },
  ];

  const top = [...QUEUE].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground noise relative">
      <header className="border-b hairline px-6 md:px-12 py-5 flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur z-30">
        <Logo size="sm" />
        <nav className="flex items-center gap-3">
          <Link to="/dj" className="text-[10px] font-mono uppercase tracking-[0.3em] border hairline px-3 py-2 hover:bg-foreground hover:text-background transition-colors">DJ booth</Link>
          <Link to="/" className="text-[10px] font-mono uppercase tracking-[0.3em] border hairline px-3 py-2 hover:bg-foreground hover:text-background transition-colors">↩ home</Link>
        </nav>
      </header>

      <main className="px-6 md:px-12 py-12 max-w-7xl mx-auto">
        <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">[ recap · the warehouse · friday ]</div>
        <h1 className="mt-3 font-display text-5xl md:text-8xl font-bold leading-[0.9] tracking-tight">
          The night,<br />
          <span className="text-gradient-zynk">in data.</span>
        </h1>
        <p className="mt-6 text-muted-foreground max-w-xl">
          Three hours, fifty-six minutes. The AI made 41 mix decisions.
          The room sent 8,214 reactions. Here's what the floor felt.
        </p>

        {/* Top stat strip */}
        <section className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-px bg-hairline border hairline">
          {[
            { k: "duration", v: "3h 56m" },
            { k: "souls", v: "412" },
            { k: "tracks mixed", v: "47" },
            { k: "peak energy", v: "94" },
          ].map((s) => (
            <div key={s.k} className="bg-background p-6">
              <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">{s.k}</div>
              <div className="mt-2 font-display text-4xl md:text-5xl font-bold tabular-nums">{s.v}</div>
            </div>
          ))}
        </section>

        {/* Energy curve */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">[ 01 — energy curve ]</div>
              <h2 className="font-display text-3xl md:text-4xl font-bold mt-2">How the room breathed.</h2>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">peak @ {Math.floor((peakIdx / points.length) * 236)}min</div>
          </div>

          <div className="border hairline bg-card p-4 md:p-6 grid-bg">
            <svg viewBox={`0 0 ${w} ${h + 30}`} className="w-full h-auto" preserveAspectRatio="none">
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="white" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Area fill */}
              <path d={area} fill="url(#g)" />
              {/* Line */}
              <path d={path} fill="none" stroke="white" strokeWidth="1.5" />
              {/* Peak marker */}
              <line
                x1={(peakIdx / (points.length - 1)) * w}
                x2={(peakIdx / (points.length - 1)) * w}
                y1={0}
                y2={h}
                stroke="white"
                strokeDasharray="2 4"
                opacity="0.5"
              />
              <circle
                cx={(peakIdx / (points.length - 1)) * w}
                cy={h - points[peakIdx] * h}
                r="5"
                fill="white"
              />
              {/* Hour ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                <g key={i}>
                  <line x1={p * w} x2={p * w} y1={h} y2={h + 6} stroke="white" opacity="0.3" />
                  <text x={p * w} y={h + 22} fontSize="10" fontFamily="JetBrains Mono" fill="rgba(255,255,255,0.5)" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
                    {Math.round(p * 236)}m
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>

        {/* Two columns: top tracks + moments */}
        <section className="mt-12 grid lg:grid-cols-2 gap-6">
          <div className="border hairline bg-card p-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">[ 02 — top of the night ]</div>
            <h3 className="mt-2 font-display text-2xl font-bold">Most loved tracks</h3>
            <ol className="mt-6 space-y-3">
              {[NOW_PLAYING, ...top].slice(0, 5).map((t, i) => (
                <li key={t.id} className="flex items-center gap-4 border-b hairline pb-3 last:border-0">
                  <span className="font-display text-3xl font-bold tabular-nums w-10">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold truncate">{t.title}</div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                      {t.artist} · {t.bpm} BPM · NRG {Math.round(t.energy * 100)}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground tabular-nums">
                    {(((t as any).votes ?? 50) + 30 + i * 11)}♥
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="border hairline bg-card p-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">[ 03 — defining moments ]</div>
            <h3 className="mt-2 font-display text-2xl font-bold">The set, in eight beats</h3>
            <ol className="mt-6 space-y-3">
              {moments.map((m) => (
                <li key={m.t} className="flex items-baseline gap-4 border-l-2 border-foreground/40 pl-3">
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-12 shrink-0">{m.t}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground w-14 shrink-0">{m.kind}</span>
                  <span className="text-sm">{m.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Crowd attribution */}
        <section className="mt-12 border hairline bg-card p-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">[ 04 — the crowd ]</div>
          <h3 className="mt-2 font-display text-2xl font-bold">412 souls. A few stand out.</h3>
          <div className="mt-6 flex flex-wrap gap-2">
            {FAKE_NAMES.concat(FAKE_NAMES).map((n, i) => (
              <span
                key={i}
                className="px-3 py-1.5 border hairline text-xs font-mono uppercase tracking-[0.2em]"
                style={{ opacity: 0.4 + (Math.sin(i * 1.7) + 1) * 0.3 }}
              >
                @{n}
                {i < 4 && <span className="ml-2 text-foreground">★</span>}
              </span>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t hairline pt-12">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">do it again?</div>
            <h3 className="mt-2 font-display text-3xl md:text-4xl font-bold">The next room is one click away.</h3>
          </div>
          <div className="flex gap-3">
            <Link to="/connect" className="px-6 py-4 bg-foreground text-background font-mono uppercase text-xs tracking-[0.3em] hover:bg-muted-foreground transition-colors clip-corner">
              start a new session
            </Link>
            <button className="px-6 py-4 border border-foreground font-mono uppercase text-xs tracking-[0.3em] hover:bg-foreground hover:text-background transition-colors clip-corner">
              share recap ↗
            </button>
          </div>
        </section>
      </main>

      <footer className="px-6 md:px-12 py-12 border-t hairline flex justify-between items-center text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
        <span>ZYNK · session #00471</span>
        <span>printed in shadow & light</span>
      </footer>
    </div>
  );
}

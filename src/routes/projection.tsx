import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";
import { NOW_PLAYING } from "@/lib/zynk-data";

export const Route = createFileRoute("/projection")({
  head: () => ({
    meta: [
      { title: "ZYNK — Projection" },
      { name: "description", content: "Cinematic shadow visuals. Beat-matched. Project me." },
    ],
  }),
  component: Projection,
});

function Projection() {
  const [energy, setEnergy] = useState(0.72);
  const [mode, setMode] = useState<"auto" | "abstract" | "silhouette">("auto");
  const [chrome, setChrome] = useState(true);

  // Auto-hide chrome
  useEffect(() => {
    if (!chrome) return;
    const t = setTimeout(() => setChrome(false), 4500);
    return () => clearTimeout(t);
  }, [chrome]);

  // Synthetic energy drift
  useEffect(() => {
    const t = setInterval(() => {
      setEnergy((e) => {
        const target = 0.4 + 0.5 * Math.abs(Math.sin(Date.now() / 7000));
        return e + (target - e) * 0.05;
      });
    }, 600);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden cursor-none"
      onMouseMove={() => setChrome(true)}
      onClick={() => setChrome(true)}
    >
      <ProjectionEngine energy={energy} bpm={NOW_PLAYING.bpm} mode={mode} />

      {/* Chrome overlay */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${chrome ? "opacity-100" : "opacity-0"}`}>
        {/* Top-left: track */}
        <div className="absolute top-8 left-8 pointer-events-auto">
          <div className="text-[10px] font-mono uppercase tracking-[0.5em] text-foreground/70">ZYNK · live</div>
          <div className="mt-2 font-display text-2xl font-bold text-foreground">{NOW_PLAYING.title}</div>
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-foreground/60">{NOW_PLAYING.artist}</div>
        </div>

        {/* Top-right: stats */}
        <div className="absolute top-8 right-8 text-right font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/70 space-y-1">
          <div>{NOW_PLAYING.bpm} BPM · {NOW_PLAYING.key}</div>
          <div>energy {Math.round(energy * 100)}</div>
          <div>mode · {mode}</div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-auto">
          {(["auto", "abstract", "silhouette"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 text-[10px] font-mono uppercase tracking-[0.3em] border ${mode === m ? "bg-foreground text-background border-foreground" : "border-foreground/40 text-foreground/70 hover:border-foreground hover:text-foreground"} transition-colors`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Exit */}
        <Link
          to="/dj"
          className="absolute bottom-8 right-8 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/60 hover:text-foreground pointer-events-auto"
        >
          ↩ back to booth
        </Link>

        {/* Hint */}
        <div className="absolute bottom-8 left-8 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/40">
          move mouse to show controls
        </div>
      </div>
    </div>
  );
}

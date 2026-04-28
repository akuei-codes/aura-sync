import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";
import { useLiveSession } from "@/hooks/useLiveSession";

export const Route = createFileRoute("/projection")({
  validateSearch: z.object({ slug: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "ZYNK — Projection" },
      { name: "description", content: "Cinematic shadow visuals. Beat-matched. Project me." },
    ],
  }),
  component: Projection,
});

function Projection() {
  const { slug } = Route.useSearch();
  const { session, current } = useLiveSession(slug ?? null);
  const [chrome, setChrome] = useState(true);

  useEffect(() => {
    if (!chrome) return;
    const t = setTimeout(() => setChrome(false), 4500);
    return () => clearTimeout(t);
  }, [chrome]);

  const energy = session?.crowd_energy ?? 0.5;
  const bpm = current?.bpm ?? 124;
  const mode = (session?.projection_mode ?? "auto") as "auto" | "abstract" | "silhouette";

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden cursor-none"
      onMouseMove={() => setChrome(true)}
      onClick={() => setChrome(true)}
    >
      <ProjectionEngine energy={energy} bpm={bpm} mode={mode} />

      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${chrome ? "opacity-100" : "opacity-0"}`}>
        <div className="absolute top-8 left-8 pointer-events-auto">
          <div className="text-[10px] font-mono uppercase tracking-[0.5em] text-foreground/70">
            ZYNK · {session?.status === "live" ? "live" : "standby"}
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-foreground">
            {current?.title ?? session?.title ?? "—"}
          </div>
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-foreground/60">
            {current?.artist ?? "awaiting drop"}
          </div>
        </div>

        <div className="absolute top-8 right-8 text-right font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/70 space-y-1">
          {bpm && <div>{Math.round(bpm)} BPM</div>}
          <div>energy {Math.round(energy * 100)}</div>
          <div>mode · {mode}</div>
        </div>

        <Link
          to="/dj"
          search={{ slug }}
          className="absolute bottom-8 right-8 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/60 hover:text-foreground pointer-events-auto"
        >
          ↩ back to booth
        </Link>

        <div className="absolute bottom-8 left-8 text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/40">
          {slug ? "move mouse to show controls" : "no slug — open via /dj"}
        </div>
      </div>
    </div>
  );
}

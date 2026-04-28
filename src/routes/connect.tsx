import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/zynk/Logo";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";
import { Equalizer } from "@/components/zynk/Equalizer";
import { createSession } from "@/lib/sessions.functions";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "ZYNK — Connect" },
      { name: "description", content: "Connect Spotify, name the room, hand the night to the AI." },
      { property: "og:title", content: "ZYNK — Connect & start a session" },
      { property: "og:description", content: "Connect Spotify and start a live AI DJ session in seconds." },
    ],
  }),
  component: Connect,
});

type Step = "room" | "spotify";

function Connect() {
  const [step, setStep] = useState<Step>("room");
  const [room, setRoom] = useState("the warehouse");
  const [vibe, setVibe] = useState<"deep" | "peak" | "afterhours">("peak");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ sessionId: string; slug: string; djToken: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function stageRoom() {
    setErr(null);
    setCreating(true);
    try {
      const res = await createSession({
        data: { title: room.trim() || "untitled room", vibe },
      });
      setCreated(res);
      setStep("spotify");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create session.");
    } finally {
      setCreating(false);
    }
  }

  function connectSpotify() {
    if (!created) return;
    const url = `/api/spotify/login?session=${encodeURIComponent(created.sessionId)}&token=${encodeURIComponent(created.djToken)}`;
    window.location.href = url;
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden noise">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <ProjectionEngine energy={created ? 0.95 : 0.45} bpm={124} mode={created ? "silhouette" : "abstract"} />
      </div>
      <div className="absolute inset-0 bg-gradient-spotlight pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <Logo />
        <Link to="/" className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
          ↩ back
        </Link>
      </header>

      <main className="relative z-10 px-6 md:px-12 max-w-3xl mx-auto pt-12 pb-24">
        <div className="flex items-center gap-3 mb-6 text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
          <Equalizer bars={3} />
          <span>start a session</span>
        </div>

        <ol className="flex items-center gap-3 mb-12 text-[10px] font-mono uppercase tracking-[0.3em]">
          {(["room", "spotify"] as Step[]).map((s, i) => {
            const active = step === s;
            const done = (["room", "spotify"] as Step[]).indexOf(step) > i;
            return (
              <li key={s} className="flex items-center gap-3">
                <span className={`w-6 h-6 border hairline flex items-center justify-center ${active ? "bg-foreground text-background" : done ? "bg-foreground/40 text-background" : "text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <span className={active ? "text-foreground" : "text-muted-foreground"}>{s}</span>
                {i < 1 && <span className="w-8 h-px bg-hairline" />}
              </li>
            );
          })}
        </ol>

        {step === "room" && (
          <section>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight">
              Name the<br />
              <span className="text-muted-foreground italic font-light">room.</span>
            </h1>

            <div className="mt-10">
              <label className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">venue / vibe label</label>
              <input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                maxLength={80}
                className="mt-2 w-full bg-card border hairline px-4 py-4 font-display text-2xl focus:outline-none focus:border-foreground"
              />
            </div>

            <div className="mt-8">
              <label className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">opening mood</label>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {([
                  { k: "deep", t: "Deep", d: "slow build, dub textures" },
                  { k: "peak", t: "Peak", d: "drop early, hold the room" },
                  { k: "afterhours", t: "Afterhours", d: "hypnotic, weightless" },
                ] as const).map((v) => (
                  <button
                    key={v.k}
                    onClick={() => setVibe(v.k)}
                    className={`p-4 text-left border hairline transition-colors ${vibe === v.k ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
                  >
                    <div className="font-display font-bold text-lg">{v.t}</div>
                    <div className={`text-[10px] font-mono uppercase tracking-[0.2em] mt-1 ${vibe === v.k ? "text-background/80" : "text-muted-foreground"}`}>{v.d}</div>
                  </button>
                ))}
              </div>
            </div>

            {err && <div className="mt-6 text-xs font-mono text-red-400">{err}</div>}

            <div className="mt-10 flex gap-3">
              <button
                onClick={stageRoom}
                disabled={creating}
                className="px-6 py-4 bg-foreground text-background font-mono uppercase text-xs tracking-[0.3em] hover:bg-muted-foreground transition-colors clip-corner disabled:opacity-50"
              >
                {creating ? "staging..." : "stage the room →"}
              </button>
            </div>
          </section>
        )}

        {step === "spotify" && created && (
          <section>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight">
              Hand us<br />
              <span className="text-muted-foreground italic font-light">your library.</span>
            </h1>
            <p className="mt-6 text-muted-foreground max-w-lg">
              ZYNK reads your Spotify catalog, the room's votes, and the crowd energy
              to mix you a night that feels personal — and inevitable.
            </p>

            <div className="mt-8 border hairline bg-card p-6">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">room</div>
                  <div className="font-display text-xl font-bold mt-1">{room}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">opening mood</div>
                  <div className="font-display text-xl font-bold mt-1 capitalize">{vibe}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">audience link (share this)</div>
                  <div className="font-mono text-xs mt-1 break-all text-foreground">
                    {typeof window !== "undefined" ? window.location.origin : ""}/audience?slug={created.slug}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={connectSpotify}
              className="mt-10 w-full py-6 bg-foreground text-background font-mono uppercase text-sm tracking-[0.5em] pulse-ring relative clip-corner"
            >
              ⚡ connect spotify & ignite
            </button>

            <p className="mt-4 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              Spotify Premium required for in-booth playback. Audience hears 30s previews.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

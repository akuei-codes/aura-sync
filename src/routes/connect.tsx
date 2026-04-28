import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/zynk/Logo";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";
import { Equalizer } from "@/components/zynk/Equalizer";

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

type Step = "spotify" | "room" | "ignite";

function Connect() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("spotify");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState("the warehouse");
  const [vibe, setVibe] = useState<"deep" | "peak" | "afterhours">("peak");
  const [igniting, setIgniting] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!igniting) return;
    if (countdown <= 0) {
      navigate({ to: "/dj" });
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [igniting, countdown, navigate]);

  function fakeConnect() {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
      setTimeout(() => setStep("room"), 600);
    }, 1400);
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden noise">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <ProjectionEngine energy={igniting ? 0.95 : 0.45} bpm={124} mode={igniting ? "silhouette" : "abstract"} />
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

        {/* Step indicator */}
        <ol className="flex items-center gap-3 mb-12 text-[10px] font-mono uppercase tracking-[0.3em]">
          {(["spotify", "room", "ignite"] as Step[]).map((s, i) => {
            const active = step === s;
            const done = (["spotify", "room", "ignite"] as Step[]).indexOf(step) > i;
            return (
              <li key={s} className="flex items-center gap-3">
                <span className={`w-6 h-6 border hairline flex items-center justify-center ${active ? "bg-foreground text-background" : done ? "bg-foreground/40 text-background" : "text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <span className={active ? "text-foreground" : "text-muted-foreground"}>{s}</span>
                {i < 2 && <span className="w-8 h-px bg-hairline" />}
              </li>
            );
          })}
        </ol>

        {step === "spotify" && (
          <section>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight">
              Hand us<br />
              <span className="text-muted-foreground italic font-light">your library.</span>
            </h1>
            <p className="mt-6 text-muted-foreground max-w-lg">
              ZYNK reads your Spotify catalog, the room's votes, and the crowd energy
              to mix you a night that feels personal — and inevitable.
            </p>

            <button
              onClick={fakeConnect}
              disabled={connecting || connected}
              className={`mt-10 inline-flex items-center gap-3 px-6 py-4 font-mono uppercase text-xs tracking-[0.3em] clip-corner transition-colors ${
                connected ? "bg-foreground/40 text-background" : "bg-foreground text-background hover:bg-muted-foreground"
              }`}
            >
              <span className="w-3 h-3 rounded-full bg-background/80" />
              {connecting ? "linking..." : connected ? "✓ Spotify linked" : "Connect Spotify"}
            </button>

            {connected && (
              <button
                onClick={() => setStep("room")}
                className="ml-3 mt-10 inline-flex items-center px-6 py-4 border border-foreground font-mono uppercase text-xs tracking-[0.3em] hover:bg-foreground hover:text-background transition-colors clip-corner"
              >
                continue →
              </button>
            )}

            <p className="mt-6 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              prototype · no real auth happens
            </p>
          </section>
        )}

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

            <div className="mt-10 flex gap-3">
              <button
                onClick={() => setStep("spotify")}
                className="px-6 py-4 border border-foreground/40 font-mono uppercase text-xs tracking-[0.3em] hover:border-foreground transition-colors clip-corner"
              >
                ← back
              </button>
              <button
                onClick={() => setStep("ignite")}
                className="px-6 py-4 bg-foreground text-background font-mono uppercase text-xs tracking-[0.3em] hover:bg-muted-foreground transition-colors clip-corner"
              >
                stage the room →
              </button>
            </div>
          </section>
        )}

        {step === "ignite" && (
          <section>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight">
              <span className="text-muted-foreground italic font-light">Lights down.</span><br />
              <span className="text-gradient-zynk">Hand it over.</span>
            </h1>

            <div className="mt-8 border hairline bg-card p-6">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">room</div>
                  <div className="font-display text-xl font-bold mt-1">{room || "untitled"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">opening mood</div>
                  <div className="font-display text-xl font-bold mt-1 capitalize">{vibe}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">source</div>
                  <div className="font-display text-xl font-bold mt-1">Spotify · linked</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">audience link</div>
                  <div className="font-mono text-xs mt-1 break-all text-foreground">zynk.live/r/{room.toLowerCase().replace(/\s+/g, "-") || "room"}</div>
                </div>
              </div>
            </div>

            {!igniting ? (
              <button
                onClick={() => setIgniting(true)}
                className="mt-10 w-full py-6 bg-foreground text-background font-mono uppercase text-sm tracking-[0.5em] pulse-ring relative clip-corner"
              >
                ⚡ ignite the room
              </button>
            ) : (
              <div className="mt-10 text-center">
                <div className="font-display text-[12rem] font-bold leading-none tabular-nums text-gradient-zynk">
                  {countdown > 0 ? countdown : "GO"}
                </div>
                <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.5em] text-muted-foreground">
                  routing you to the booth...
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

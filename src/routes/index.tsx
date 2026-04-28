import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/zynk/Logo";
import { Equalizer } from "@/components/zynk/Equalizer";
import { ProjectionEngine } from "@/components/zynk/ProjectionEngine";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden noise">
      {/* Ambient projection peeking from background */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <ProjectionEngine energy={0.55} bpm={124} mode="abstract" />
      </div>
      <div className="absolute inset-0 bg-gradient-spotlight pointer-events-none" />

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#views" className="hover:text-foreground transition-colors">The views</a>
          <Link to="/dj" className="hover:text-foreground transition-colors">DJ booth</Link>
          <Link to="/recap" className="hover:text-foreground transition-colors">Recap</Link>
        </nav>
        <Link
          to="/connect"
          className="text-xs font-mono uppercase tracking-[0.3em] border border-foreground px-4 py-2 hover:bg-foreground hover:text-background transition-colors clip-corner"
        >
          Start a session →
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 md:px-12 pt-12 md:pt-24 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8 text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground">
            <Equalizer />
            <span>Live · 412 listeners · global</span>
          </div>

          <h1 className="font-display font-bold leading-[0.85] tracking-tight">
            <span className="block text-[clamp(3.5rem,12vw,12rem)] text-gradient-zynk">AN AI DJ</span>
            <span className="block text-[clamp(3.5rem,12vw,12rem)]">THAT FEELS</span>
            <span className="block text-[clamp(3.5rem,12vw,12rem)] italic font-light text-muted-foreground">the room.</span>
          </h1>

          <div className="mt-12 grid md:grid-cols-2 gap-12 max-w-5xl">
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl">
              ZYNK takes the songs your crowd loves, mixes them in real time,
              and projects a cinematic shadow performance behind the music.
              Every drop. Every silence. Every person in the room.
            </p>
            <div className="flex flex-col gap-4 md:items-end">
              <div className="flex gap-3">
                <Link to="/connect" className="px-6 py-4 bg-foreground text-background font-mono uppercase text-xs tracking-[0.3em] hover:bg-muted-foreground transition-colors clip-corner">
                  Start a session
                </Link>
                <Link to="/audience" className="px-6 py-4 border border-foreground font-mono uppercase text-xs tracking-[0.3em] hover:bg-foreground hover:text-background transition-colors clip-corner">
                  Join as audience
                </Link>
              </div>
              <div className="flex gap-4 text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                <Link to="/projection" className="hover:text-foreground transition-colors">↳ projection</Link>
                <Link to="/dj" className="hover:text-foreground transition-colors">↳ booth</Link>
                <Link to="/recap" className="hover:text-foreground transition-colors">↳ recap</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="relative z-10 border-y hairline overflow-hidden py-6 bg-background">
        <div className="marquee whitespace-nowrap flex gap-12 font-display text-3xl md:text-5xl uppercase tracking-tight">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-12 items-center shrink-0">
              {["LIVE MIXING", "★", "CROWD ENERGY", "★", "SHADOW VISUALS", "★", "VINYL CALLOUTS", "★", "BATTLE MODE", "★", "BUILD-UPS", "★"].map((w, i) => (
                <span key={i} className={i % 2 === 1 ? "text-muted-foreground" : "text-foreground"}>{w}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Three views */}
      <section id="views" className="relative z-10 px-6 md:px-12 py-24">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-12 gap-6 flex-wrap">
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground mb-3">[ 01 — surfaces ]</div>
              <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight max-w-2xl">Three screens. One performance.</h2>
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground max-w-sm">
              Built for a room with a projector, a phone in every pocket, and someone curating the night.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <ViewCard num="01" title="DJ Dashboard" desc="Conductor's seat. Live deck, AI hype injection, queue, energy controls." to="/dj" />
            <ViewCard num="02" title="Audience" desc="Phone-first. Request, vote, react, push energy to the AI in real time." to="/audience" />
            <ViewCard num="03" title="Projection" desc="The wall. Cinematic shadow visuals beat-matched to the floor." to="/projection" />
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="relative z-10 px-6 md:px-12 py-24 border-t hairline">
        <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <div className="text-xs font-mono uppercase tracking-[0.4em] text-muted-foreground mb-3">[ 02 — flow ]</div>
            <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">A live AI performance, end to end.</h2>
          </div>
          <ol className="md:col-span-8 space-y-12">
            {[
              { n: "01", t: "Connect Spotify", d: "Authenticate. Drop a playlist or send the search bar to the floor." },
              { n: "02", t: "AI reads the room", d: "BPM, key, energy, vote signal, hype emoji rate — all become a single mood vector." },
              { n: "03", t: "It mixes you", d: "Creative transitions, build-ups, vinyl callouts, ambient pads. Never a crossfade twice." },
              { n: "04", t: "The room sees it", d: "Shadow figures pulse on the beat. Drops trigger explosive choreography." },
            ].map((s) => (
              <li key={s.n} className="grid grid-cols-[auto_1fr] gap-8 items-baseline border-b hairline pb-8">
                <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
                <div>
                  <div className="font-display text-2xl md:text-3xl font-semibold">{s.t}</div>
                  <p className="mt-2 text-muted-foreground max-w-xl">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="relative z-10 px-6 md:px-12 py-12 border-t hairline flex justify-between items-center text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
        <span>ZYNK — performance system v0.1</span>
        <span>black · white · grey · everything in between</span>
      </footer>
    </div>
  );
}

function ViewCard({ num, title, desc, to }: { num: string; title: string; desc: string; to: string }) {
  return (
    <Link to={to} className="group relative block border hairline bg-card p-6 hover:bg-secondary transition-colors clip-corner overflow-hidden min-h-[280px]">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <ProjectionEngine energy={0.7} bpm={124} mode={num === "03" ? "auto" : "abstract"} />
        <div className="absolute inset-0 bg-background/60" />
      </div>
      <div className="relative">
        <div className="flex justify-between items-start">
          <span className="font-mono text-xs text-muted-foreground tracking-[0.3em]">{num}</span>
          <span className="font-mono text-xs text-muted-foreground">→</span>
        </div>
        <h3 className="mt-16 font-display text-3xl font-bold">{title}</h3>
        <p className="mt-3 text-sm text-muted-foreground max-w-xs">{desc}</p>
      </div>
    </Link>
  );
}

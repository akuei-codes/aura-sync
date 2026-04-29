import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/zynk/Logo";
import { getHostSessions } from "@/lib/sessions.functions";

export const Route = createFileRoute("/sessions")({
  head: () => ({
    meta: [
      { title: "ZYNK — Your Sessions" },
      { name: "description", content: "Resume any past or active session you hosted." },
    ],
  }),
  component: SessionsPage,
});

interface HostSession {
  sessionId: string;
  slug: string;
  title: string;
  vibe: string;
  status: string;
  djToken: string;
  ignited: boolean;
  started_at: string | null;
  created_at: string;
  vote_count_total: number;
  mix_drop_count: number;
}

interface StoredEntry { sessionId: string; djToken: string; slug: string; title: string; createdAt: string }

function readStored(): StoredEntry[] {
  try {
    const raw = localStorage.getItem("zynk_host_sessions");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeStored(list: StoredEntry[]) {
  try { localStorage.setItem("zynk_host_sessions", JSON.stringify(list)); } catch { /* ignore */ }
}

function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<HostSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = readStored();
    if (stored.length === 0) { setLoading(false); return; }
    getHostSessions({ data: { entries: stored.map((s) => ({ sessionId: s.sessionId, djToken: s.djToken })) } })
      .then((rows) => {
        setSessions(rows as HostSession[]);
        // Prune entries that no longer resolve server-side
        const valid = new Set(rows.map((r) => (r as HostSession).sessionId));
        const pruned = stored.filter((s) => valid.has(s.sessionId));
        if (pruned.length !== stored.length) writeStored(pruned);
      })
      .catch(() => { /* leave empty */ })
      .finally(() => setLoading(false));
  }, []);

  function resume(s: HostSession) {
    navigate({ to: "/dj", search: { slug: s.slug, token: s.djToken } });
  }

  function forget(sessionId: string) {
    const pruned = readStored().filter((s) => s.sessionId !== sessionId);
    writeStored(pruned);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }

  return (
    <div className="min-h-screen bg-background text-foreground noise">
      <header className="border-b hairline px-6 py-5 flex items-center justify-between">
        <Logo size="sm" />
        <nav className="flex gap-3">
          <Link to="/connect" className="text-[10px] font-mono uppercase tracking-[0.3em] border hairline px-3 py-2 hover:bg-foreground hover:text-background">+ new session</Link>
          <Link to="/" className="text-[10px] font-mono uppercase tracking-[0.3em] border hairline px-3 py-2 hover:bg-foreground hover:text-background">↩ home</Link>
        </nav>
      </header>

      <main className="px-6 md:px-12 py-12 max-w-5xl mx-auto">
        <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">[ host · your rooms ]</div>
        <h1 className="mt-3 font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight">
          Pick up where<br /><span className="text-muted-foreground italic font-light">you left off.</span>
        </h1>
        <p className="mt-6 text-muted-foreground max-w-xl">
          Every room you've staged on this device. Resume any of them and the booth picks up the music, the queue, and the votes — exactly where they were.
        </p>

        <div className="mt-12 space-y-3">
          {loading && (
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">loading rooms…</div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="border hairline p-8 bg-card text-center">
              <div className="text-muted-foreground font-mono text-xs uppercase tracking-[0.3em]">No sessions yet on this device.</div>
              <Link to="/connect" className="mt-4 inline-block px-5 py-3 bg-foreground text-background font-mono uppercase text-xs tracking-[0.3em]">
                stage your first room
              </Link>
            </div>
          )}
          {sessions.map((s) => (
            <div key={s.sessionId} className="border hairline p-5 bg-card flex flex-wrap items-center gap-4 justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${s.status === "live" ? "bg-foreground breathe" : "bg-muted-foreground"}`} />
                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                    {s.status} · {s.vibe} · {s.mix_drop_count} drops · {s.vote_count_total} votes
                  </span>
                </div>
                <div className="font-display text-2xl font-bold mt-1 truncate">{s.title}</div>
                <div className="text-[11px] font-mono text-muted-foreground mt-1">
                  /audience?slug={s.slug} · staged {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => resume(s)}
                  className="px-4 py-3 bg-foreground text-background font-mono uppercase text-[10px] tracking-[0.3em] hover:bg-muted-foreground"
                >
                  ↻ resume
                </button>
                <Link
                  to="/recap"
                  search={{ slug: s.slug }}
                  className="px-4 py-3 border border-foreground font-mono uppercase text-[10px] tracking-[0.3em] hover:bg-foreground hover:text-background"
                >
                  recap
                </Link>
                <button
                  onClick={() => forget(s.sessionId)}
                  className="px-3 py-3 border border-muted-foreground text-muted-foreground font-mono uppercase text-[10px] tracking-[0.3em] hover:border-foreground hover:text-foreground"
                  title="Remove from this device (does not delete the session)"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

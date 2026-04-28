// React hook: live session data via Supabase Realtime + initial fetch via server fn.
import { useEffect, useState } from "react";
import { initRealtime } from "@/lib/realtime";
import { getRealtimeConfig, getQueue, getSession } from "@/lib/sessions.functions";

export interface QueueItem {
  id: string;
  spotify_track_id: string;
  uri: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  preview_url: string | null;
  duration_ms: number;
  bpm: number | null;
  key_pitch_class: number | null;
  mode: number | null;
  energy: number | null;
  vote_count: number;
  requested_by: string | null;
  ai_picked: boolean;
}

export interface CurrentTrack {
  spotify_track_id: string;
  uri: string;
  title: string;
  artist: string;
  album_image_url: string | null;
  preview_url: string | null;
  duration_ms: number;
  bpm: number | null;
  energy: number | null;
  position_ms_at: number;
  position_set_at: string;
  is_paused: boolean;
}

export interface SessionPublic {
  id: string;
  slug: string;
  title: string;
  vibe: string;
  status: string;
  crowd_energy: number;
  autopilot: boolean;
  projection_mode: "auto" | "abstract" | "silhouette";
  reaction_count_total: number;
  vote_count_total: number;
  live_listeners: number;
  started_at: string | null;
}

export function useLiveSession(slug: string | null) {
  const [session, setSession] = useState<SessionPublic | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<CurrentTrack | null>(null);
  const [reactions, setReactions] = useState<Array<{ emoji: string; at: number }>>([]);
  const [hype, setHype] = useState<Array<{ id: string; kind: string; label: string; at: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof initRealtime>["channel"]> | null = null;

    async function bootstrap() {
      try {
        const cfg = await getRealtimeConfig();
        if (!cfg.url || !cfg.key) {
          setError("Realtime not configured (REALTIME_URL / REALTIME_PUBLISHABLE_KEY missing).");
          return;
        }
        const sb = initRealtime(cfg.url, cfg.key);
        const [s, q] = await Promise.all([getSession({ data: { slug: slug! } }), getQueue({ data: { slug: slug! } })]);
        if (cancelled) return;
        setSession(s as SessionPublic);
        setQueue(q as QueueItem[]);

        channel = sb.channel(`session:${s.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "queue_items", filter: `session_id=eq.${s.id}` }, async () => {
            const fresh = await getQueue({ data: { slug: slug! } });
            if (!cancelled) setQueue(fresh as QueueItem[]);
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${s.id}` }, (payload) => {
            if (!cancelled) setSession((prev) => (prev ? { ...prev, ...(payload.new as Partial<SessionPublic>) } : prev));
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "current_track", filter: `session_id=eq.${s.id}` }, (payload) => {
            if (!cancelled && payload.new) setCurrent(payload.new as CurrentTrack);
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `session_id=eq.${s.id}` }, (payload) => {
            const r = payload.new as { emoji: string };
            if (!cancelled) setReactions((prev) => [...prev.slice(-40), { emoji: r.emoji, at: Date.now() }]);
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "hype_events", filter: `session_id=eq.${s.id}` }, (payload) => {
            const h = payload.new as { id: string; kind: string; label: string; created_at: string };
            if (!cancelled) setHype((prev) => [{ id: h.id, kind: h.kind, label: h.label, at: h.created_at }, ...prev].slice(0, 12));
          })
          .subscribe();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load session");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
      if (channel) channel.unsubscribe();
    };
  }, [slug]);

  return { session, queue, current, reactions, hype, error };
}

// All session server functions. Trusted server-side; no RLS in the way.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sql } from "@/lib/db.server";
import { sha256Hex, randomToken } from "@/lib/crypto.server";
import {
  searchTracks,
  getAudioFeatures,
  getSessionAccessToken,
  type SpotifyTrack,
} from "@/lib/spotify.server";
import { pickNextTrack, nextEnergyTarget, generateHypeCopy } from "@/lib/ai-dj.server";

// ---- Realtime config (exposed safely to client) ----------------------------
export const getRealtimeConfig = createServerFn({ method: "GET" }).handler(async () => {
  const rawUrl = process.env.REALTIME_URL ?? process.env.SUPABASE_URL;
  const key = process.env.REALTIME_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const url = rawUrl
    ? rawUrl
        .replace(/^wss:/i, "https:")
        .replace(/^ws:/i, "http:")
        .replace(/[?#].*$/, "")
        .replace(/\/websocket\/?$/i, "")
        .replace(/\/rest\/v1\/realtime\/v1\/?$/i, "")
        .replace(/\/rest\/v1\/?$/i, "")
        .replace(/\/realtime\/v1\/?$/i, "")
        .replace(/\/$/, "")
    : null;
  return { url: url ?? null, key: key ?? null };
});

// ---- Create session --------------------------------------------------------
export const createSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      title: z.string().min(1).max(80),
      vibe: z.string().min(1).max(40),
      plannedDurationMinutes: z.number().int().min(15).max(600).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const slug = randomToken(6).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
    const djToken = randomToken(32);
    const rows = await sql<Array<{ id: string; slug: string }>>`
      insert into public.sessions (slug, title, vibe, dj_token_hash, planned_duration_minutes, status)
      values (${slug}, ${data.title}, ${data.vibe}, ${sha256Hex(djToken)}, ${data.plannedDurationMinutes ?? null}, 'live')
      returning id, slug
    `;
    return { sessionId: rows[0].id, slug: rows[0].slug, djToken };
  });

// ---- Authenticate DJ token --------------------------------------------------
async function requireDj(sessionId: string, djToken: string) {
  const rows = await sql<Array<{ id: string }>>`
    select id from public.sessions where id = ${sessionId} and dj_token_hash = ${sha256Hex(djToken)}
  `;
  if (rows.length === 0) throw new Error("Unauthorized DJ token");
}

// ---- Get session by slug (public) ------------------------------------------
export const getSession = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(32) }).parse)
  .handler(async ({ data }) => {
    const rows = await sql<
      Array<{
        id: string; slug: string; title: string; vibe: string; status: string;
        crowd_energy: number; autopilot: boolean; auto_approve: boolean; ignited: boolean;
        projection_mode: string;
        reaction_count_total: number; vote_count_total: number;
        listener_estimate: number; started_at: Date | null;
        spotify_user_id: string | null;
      }>
    >`
      select id, slug, title, vibe, status, crowd_energy, autopilot, auto_approve, ignited,
             projection_mode, reaction_count_total, vote_count_total, listener_estimate, started_at,
             spotify_user_id
      from public.sessions where slug = ${data.slug} limit 1
    `;
    if (rows.length === 0) throw new Error("Session not found");
    const s = rows[0];
    const listeners = await sql<Array<{ count: number }>>`
      select public.live_listener_count(${s.id})::int as count
    `;
    return { ...s, live_listeners: listeners[0]?.count ?? 0 };
  });

// ---- Get a Spotify access token for the DJ's browser SDK -------------------
// SECURITY: requires djToken. Returns short-lived access token only (never refresh).
export const getSpotifyAccessToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string().min(1) }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    const accessToken = await getSessionAccessToken(data.sessionId);
    return { accessToken };
  });

// ---- Search Spotify (DJ only) ----------------------------------------------
export const searchCatalog = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
      djToken: z.string().min(1),
      query: z.string().min(1).max(200),
    }).parse,
  )
  .handler(async ({ data }): Promise<SpotifyTrack[]> => {
    await requireDj(data.sessionId, data.djToken);
    const token = await getSessionAccessToken(data.sessionId);
    return searchTracks(token, data.query, 12);
  });

// ---- Public search for audience requests (uses DJ's token, but rate-limited)
// Allowed any time the session exists (draft, live, or paused) so guests can
// stack the queue before the host ignites the room.
export const searchPublic = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1), query: z.string().min(1).max(200) }).parse)
  .handler(async ({ data }) => {
    const rows = await sql<Array<{ id: string; status: string }>>`
      select id, status from public.sessions where slug = ${data.slug} limit 1
    `;
    if (rows.length === 0) throw new Error("Session not found");
    if (rows[0].status === "ended") throw new Error("Session has ended");
    const token = await getSessionAccessToken(rows[0].id);
    return searchTracks(token, data.query, 8);
  });

// ---- Request a track (audience or DJ) --------------------------------------
export const requestTrack = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      slug: z.string().min(1),
      spotifyTrackId: z.string().min(1),
      requestedBy: z.string().max(40).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const sessionRows = await sql<Array<{ id: string; auto_approve: boolean }>>`
      select id, auto_approve from public.sessions where slug = ${data.slug} limit 1
    `;
    if (sessionRows.length === 0) throw new Error("Session not found");
    const sessionId = sessionRows[0].id;
    const autoApprove = sessionRows[0].auto_approve;

    // Already in pending queue?
    const dup = await sql<Array<{ id: string; approved: boolean }>>`
      select id, approved from public.queue_items
      where session_id = ${sessionId} and spotify_track_id = ${data.spotifyTrackId} and played_at is null
      limit 1
    `;
    if (dup.length > 0) return { id: dup[0].id, duplicate: true, approved: dup[0].approved };

    const token = await getSessionAccessToken(sessionId);
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${data.spotifyTrackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!trackRes.ok) {
      throw new Error(`Could not load track from Spotify (${trackRes.status}). Try another track.`);
    }
    const track = (await trackRes.json()) as SpotifyTrack;

    let f: { tempo?: number | null; key?: number | null; mode?: number | null; energy?: number | null; danceability?: number | null } | undefined;
    try {
      const features = await getAudioFeatures(token, [data.spotifyTrackId]);
      f = features[0];
    } catch (err) {
      console.warn("Audio features unavailable for", data.spotifyTrackId, err);
      f = undefined;
    }

    const inserted = await sql<Array<{ id: string }>>`
      insert into public.queue_items (
        session_id, spotify_track_id, uri, title, artist, album_image_url, preview_url,
        duration_ms, bpm, key_pitch_class, mode, energy, danceability, requested_by, approved
      ) values (
        ${sessionId}, ${track.id}, ${track.uri ?? null}, ${track.name ?? "Unknown"},
        ${track.artists?.map((a) => a.name).join(", ") ?? "Unknown"},
        ${track.album?.images?.[0]?.url ?? null},
        ${track.preview_url ?? null},
        ${track.duration_ms ?? 0},
        ${f?.tempo ?? null},
        ${f?.key ?? null},
        ${f?.mode ?? null},
        ${f?.energy ?? null},
        ${f?.danceability ?? null},
        ${data.requestedBy ?? null},
        ${autoApprove}
      ) returning id
    `;
    return { id: inserted[0].id, duplicate: false, approved: autoApprove };
  });

// ---- Get queue -------------------------------------------------------------
export const getQueue = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1) }).parse)
  .handler(async ({ data }) => {
    const sessionRows = await sql<Array<{ id: string }>>`
      select id from public.sessions where slug = ${data.slug} limit 1
    `;
    if (sessionRows.length === 0) return [];
    return sql<Array<{
      id: string;
      spotify_track_id: string | null;
      uri: string | null;
      title: string | null;
      artist: string | null;
      album_image_url: string | null;
      preview_url: string | null;
      duration_ms: number | null;
      bpm: number | null;
      key_pitch_class: number | null;
      mode: number | null;
      energy: number | null;
      vote_count: number;
      requested_by: string | null;
      ai_picked: boolean;
    }>>`
      select id, spotify_track_id, uri, title, artist, album_image_url, preview_url,
             duration_ms, bpm, key_pitch_class, mode, energy, vote_count, requested_by, ai_picked
      from public.queue_items
      where session_id = ${sessionRows[0].id} and played_at is null and approved = true and rejected_at is null
      order by vote_count desc, created_at asc
      limit 50
    `;
  });

// ---- Get currently playing track ------------------------------------------
export const getCurrentTrack = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1) }).parse)
  .handler(async ({ data }) => {
    const rows = await sql<Array<{
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
    }>>`
      select ct.spotify_track_id, ct.uri, ct.title, ct.artist, ct.album_image_url, ct.preview_url,
             ct.duration_ms, ct.bpm, ct.energy, ct.position_ms_at, ct.position_set_at::text as position_set_at, ct.is_paused
      from public.current_track ct
      join public.sessions s on s.id = ct.session_id
      where s.slug = ${data.slug}
      limit 1
    `;
    return rows[0] ?? null;
  });

// ---- Pending requests (DJ moderation) --------------------------------------
export const getPendingRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    return sql<Array<{
      id: string; spotify_track_id: string; title: string; artist: string;
      album_image_url: string | null; requested_by: string | null; created_at: Date;
    }>>`
      select id, spotify_track_id, title, artist, album_image_url, requested_by, created_at
      from public.queue_items
      where session_id = ${data.sessionId}
        and played_at is null and approved = false and rejected_at is null
      order by created_at asc
      limit 50
    `;
  });

export const approveRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), queueItemId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.queue_items set approved = true where id = ${data.queueItemId} and session_id = ${data.sessionId}`;
    return { ok: true };
  });

export const rejectRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), queueItemId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.queue_items set rejected_at = now() where id = ${data.queueItemId} and session_id = ${data.sessionId}`;
    return { ok: true };
  });

export const setAutoApprove = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), enabled: z.boolean() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.sessions set auto_approve = ${data.enabled} where id = ${data.sessionId}`;
    // when toggling ON, auto-approve everything pending
    if (data.enabled) {
      await sql`update public.queue_items set approved = true
        where session_id = ${data.sessionId} and played_at is null and rejected_at is null and approved = false`;
    }
    return { ok: true };
  });

export const igniteRoom = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.sessions set ignited = true, autopilot = true,
      started_at = coalesce(started_at, now()), status = 'live' where id = ${data.sessionId}`;
    return { ok: true };
  });

// ---- Vote ------------------------------------------------------------------
export const voteForTrack = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      slug: z.string().min(1),
      queueItemId: z.string().uuid(),
      clientId: z.string().min(1).max(80),
    }).parse,
  )
  .handler(async ({ data }) => {
    const sessionRows = await sql<Array<{ id: string }>>`
      select id from public.sessions where slug = ${data.slug} limit 1
    `;
    if (sessionRows.length === 0) throw new Error("Session not found");
    try {
      await sql`
        insert into public.vote_records (session_id, queue_item_id, client_id)
        values (${sessionRows[0].id}, ${data.queueItemId}, ${data.clientId})
      `;
      return { voted: true };
    } catch {
      // unique violation — user already voted for this track
      return { voted: false };
    }
  });

// ---- React (drop emoji) ----------------------------------------------------
export const sendReaction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      slug: z.string().min(1),
      emoji: z.string().min(1).max(8),
      clientId: z.string().min(1).max(80),
    }).parse,
  )
  .handler(async ({ data }) => {
    const rows = await sql<Array<{ id: string }>>`
      select id from public.sessions where slug = ${data.slug} limit 1
    `;
    if (rows.length === 0) throw new Error("Session not found");
    await sql`
      insert into public.reactions (session_id, emoji, client_id)
      values (${rows[0].id}, ${data.emoji}, ${data.clientId})
    `;
    return { ok: true };
  });

// ---- Heartbeat (audience presence) -----------------------------------------
export const heartbeat = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      slug: z.string().min(1),
      clientId: z.string().min(1).max(80),
      nickname: z.string().max(40).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const rows = await sql<Array<{ id: string }>>`
      select id from public.sessions where slug = ${data.slug} limit 1
    `;
    if (rows.length === 0) return { count: 0 };
    await sql`
      insert into public.audience_presence (session_id, client_id, nickname)
      values (${rows[0].id}, ${data.clientId}, ${data.nickname ?? null})
      on conflict (session_id, client_id) do update set seen_at = now(), nickname = excluded.nickname
    `;
    const c = await sql<Array<{ count: number }>>`
      select public.live_listener_count(${rows[0].id})::int as count
    `;
    return { count: c[0]?.count ?? 0 };
  });

// ---- DJ controls -----------------------------------------------------------
export const setAutopilot = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), enabled: z.boolean() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.sessions set autopilot = ${data.enabled} where id = ${data.sessionId}`;
    return { ok: true };
  });

export const updateEnergy = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), energy: z.number().min(0).max(1) }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.sessions set crowd_energy = ${data.energy} where id = ${data.sessionId}`;
    await sql`insert into public.energy_snapshots (session_id, energy) values (${data.sessionId}, ${data.energy})`;
    return { ok: true };
  });

export const setProjectionMode = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
      djToken: z.string(),
      mode: z.enum(["auto", "abstract", "silhouette"]),
    }).parse,
  )
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.sessions set projection_mode = ${data.mode} where id = ${data.sessionId}`;
    return { ok: true };
  });

export const registerDeviceId = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), deviceId: z.string() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`update public.sessions set spotify_device_id = ${data.deviceId}, status = 'live', started_at = coalesce(started_at, now()) where id = ${data.sessionId}`;
    return { ok: true };
  });

// ---- AI DJ: pick & play next track -----------------------------------------
export const advanceToNextTrack = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);

    const session = await sql<
      Array<{ started_at: Date | null; reaction_count_total: number; spotify_device_id: string | null }>
    >`select started_at, reaction_count_total, spotify_device_id from public.sessions where id = ${data.sessionId}`;
    if (session.length === 0) throw new Error("Session not found");
    const s = session[0];

    const current = await sql<
      Array<{ title: string; artist: string; bpm: number | null; key_pitch_class: number | null; mode: number | null; energy: number | null }>
    >`select title, artist, bpm, key_pitch_class, mode, energy from public.current_track where session_id = ${data.sessionId}`;

    const candidates = await sql<
      Array<{ id: string; title: string; artist: string; bpm: number | null; key_pitch_class: number | null; mode: number | null; energy: number | null; vote_count: number; uri: string; preview_url: string | null; album_image_url: string | null; duration_ms: number; spotify_track_id: string }>
    >`
      select id, spotify_track_id, uri, title, artist, album_image_url, preview_url, duration_ms,
             bpm, key_pitch_class, mode, energy, vote_count
      from public.queue_items
      where session_id = ${data.sessionId} and played_at is null and approved = true and rejected_at is null
      order by vote_count desc, created_at asc
      limit 30
    `;
    if (candidates.length === 0) return { ok: false, reason: "queue_empty" };

    // Real reaction velocity over the last 2 minutes — this drives crowd_energy and AI target curve.
    const reactionStats = await sql<Array<{ recent: number }>>`
      select count(*)::int as recent from public.reactions
      where session_id = ${data.sessionId} and created_at > now() - interval '2 minutes'
    `;
    const reactionsPerMin = (reactionStats[0]?.recent ?? 0) / 2;
    const sessionMinutes = s.started_at ? (Date.now() - s.started_at.getTime()) / 60000 : 0;
    const energyTarget = nextEnergyTarget(sessionMinutes, reactionsPerMin);

    // Push the new energy reading back to the session so the UI/projection follows the crowd.
    await sql`update public.sessions set crowd_energy = ${energyTarget} where id = ${data.sessionId}`;
    await sql`insert into public.energy_snapshots (session_id, energy) values (${data.sessionId}, ${energyTarget})`;

    const currentDeck = current[0] ?? { title: "—", artist: "—", bpm: null, key_pitch_class: null, mode: null, energy: null };
    const pick = pickNextTrack(currentDeck, candidates, energyTarget);
    if (!pick) return { ok: false, reason: "no_pick" };

    const nextItem = candidates.find((c) => c.id === pick.candidateId)!;

    // Generate hype copy in parallel with the playback transition.
    const hypePromise = generateHypeCopy(currentDeck, nextItem, energyTarget);

    // Play it on the DJ's device (if registered).
    if (s.spotify_device_id) {
      try {
        const token = await getSessionAccessToken(data.sessionId);
        const { playTrack } = await import("@/lib/spotify.server");
        await playTrack(token, s.spotify_device_id, nextItem.uri, 0);
      } catch (e) {
        console.error("playTrack failed:", e);
      }
    }

    // Mark queue item played.
    await sql`update public.queue_items set played_at = now() where id = ${nextItem.id}`;

    // Update current_track.
    await sql`
      insert into public.current_track (
        session_id, spotify_track_id, uri, title, artist, album_image_url, preview_url,
        duration_ms, bpm, key_pitch_class, mode, energy, position_ms_at, position_set_at, is_paused, started_at
      ) values (
        ${data.sessionId}, ${nextItem.spotify_track_id}, ${nextItem.uri}, ${nextItem.title}, ${nextItem.artist},
        ${nextItem.album_image_url}, ${nextItem.preview_url}, ${nextItem.duration_ms},
        ${nextItem.bpm}, ${nextItem.key_pitch_class}, ${nextItem.mode}, ${nextItem.energy},
        0, now(), false, now()
      )
      on conflict (session_id) do update set
        spotify_track_id = excluded.spotify_track_id, uri = excluded.uri, title = excluded.title,
        artist = excluded.artist, album_image_url = excluded.album_image_url,
        preview_url = excluded.preview_url, duration_ms = excluded.duration_ms,
        bpm = excluded.bpm, key_pitch_class = excluded.key_pitch_class, mode = excluded.mode,
        energy = excluded.energy, position_ms_at = 0, position_set_at = now(),
        is_paused = false, started_at = now(), updated_at = now()
    `;

    const hype = await hypePromise;
    await sql`
      insert into public.hype_events (session_id, kind, label, meta)
      values (${data.sessionId}, 'transition', ${hype.callout}, ${JSON.stringify({ style: hype.transitionStyle, score: pick.score, reasons: pick.reasons })}::jsonb)
    `;
    await sql`update public.sessions set mix_drop_count = mix_drop_count + 1 where id = ${data.sessionId}`;

    return { ok: true, nextTrack: nextItem, hype, score: pick.score };
  });

// ---- Sync DJ playback position to current_track (called by /dj poll) -------
export const syncPlaybackPosition = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
      djToken: z.string(),
      positionMs: z.number().int().min(0),
      isPaused: z.boolean(),
    }).parse,
  )
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`
      update public.current_track set
        position_ms_at = ${data.positionMs},
        position_set_at = now(),
        is_paused = ${data.isPaused},
        updated_at = now()
      where session_id = ${data.sessionId}
    `;
    return { ok: true };
  });

// ---- Pause/resume from server (updates audience-visible current_track state) ----
export const setPlaybackPaused = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string(), paused: z.boolean(), positionMs: z.number().int().min(0) }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    await sql`
      update public.current_track set
        is_paused = ${data.paused},
        position_ms_at = ${data.positionMs},
        position_set_at = now(),
        updated_at = now()
      where session_id = ${data.sessionId}
    `;
    return { ok: true };
  });

// ---- Resume current track on the DJ's device (used after SDK becomes ready) ----
export const resumeCurrentOnDevice = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().uuid(), djToken: z.string() }).parse)
  .handler(async ({ data }) => {
    await requireDj(data.sessionId, data.djToken);
    const session = await sql<Array<{ spotify_device_id: string | null }>>`
      select spotify_device_id from public.sessions where id = ${data.sessionId}
    `;
    const ct = await sql<Array<{ uri: string | null; position_ms_at: number; position_set_at: Date; is_paused: boolean }>>`
      select uri, position_ms_at, position_set_at, is_paused
      from public.current_track where session_id = ${data.sessionId}
    `;
    if (!session[0]?.spotify_device_id || !ct[0]?.uri) return { ok: false };
    const elapsed = ct[0].is_paused ? 0 : Date.now() - new Date(ct[0].position_set_at).getTime();
    const pos = Math.max(0, ct[0].position_ms_at + elapsed);
    try {
      const token = await getSessionAccessToken(data.sessionId);
      const { playTrack } = await import("@/lib/spotify.server");
      await playTrack(token, session[0].spotify_device_id, ct[0].uri, pos);
      return { ok: true };
    } catch (e) {
      console.error("resumeCurrentOnDevice failed:", e);
      return { ok: false };
    }
  });

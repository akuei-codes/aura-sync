// Spotify Web API client. All calls happen server-side; tokens never leave the server.
// Uses Authorization Code flow (server-side, with client secret) — DJ only.
// Audience members do NOT authenticate with Spotify.

import { sql } from "./db.server";
import { encrypt, decrypt } from "./crypto.server";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_AUTH = "https://accounts.spotify.com";

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "streaming",                 // required for Web Playback SDK
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-top-read",
].join(" ");

function clientCreds() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not configured.",
    );
  }
  return { id, secret };
}

export function spotifyAuthorizeUrl(redirectUri: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: id,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: "false",
  });
  return `${SPOTIFY_AUTH}/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = clientCreds();
  const res = await fetch(`${SPOTIFY_AUTH}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const { id, secret } = clientCreds();
  const res = await fetch(`${SPOTIFY_AUTH}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`);
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

/**
 * Get a valid access token for the session, refreshing if needed.
 * Returns plain (non-encrypted) access token for immediate use.
 */
export async function getSessionAccessToken(sessionId: string): Promise<string> {
  const rows = await sql<
    Array<{
      spotify_access_token: string | null;
      spotify_refresh_token: string | null;
      spotify_access_expires_at: Date | null;
    }>
  >`
    select spotify_access_token, spotify_refresh_token, spotify_access_expires_at
    from public.sessions where id = ${sessionId} limit 1
  `;
  const row = rows[0];
  if (!row?.spotify_refresh_token) {
    throw new Error("Session is not linked to Spotify.");
  }

  const refreshToken = decrypt(row.spotify_refresh_token);
  const stillValid =
    row.spotify_access_token &&
    row.spotify_access_expires_at &&
    row.spotify_access_expires_at.getTime() > Date.now() + 30_000;

  if (stillValid && row.spotify_access_token) {
    return decrypt(row.spotify_access_token);
  }

  const fresh = await refreshAccessToken(refreshToken);
  const newAccess = fresh.access_token;
  const expiresAt = new Date(Date.now() + fresh.expires_in * 1000);
  const newRefresh = fresh.refresh_token ?? refreshToken;

  await sql`
    update public.sessions set
      spotify_access_token = ${encrypt(newAccess)},
      spotify_refresh_token = ${encrypt(newRefresh)},
      spotify_access_expires_at = ${expiresAt}
    where id = ${sessionId}
  `;
  return newAccess;
}

async function spotifyFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  preview_url: string | null;
  artists: Array<{ id: string; name: string }>;
  album: { name: string; images: Array<{ url: string; width: number; height: number }> };
}

export interface AudioFeatures {
  id: string;
  tempo: number;
  key: number;        // 0..11; -1 if unknown
  mode: number;       // 0 minor / 1 major
  energy: number;     // 0..1
  danceability: number;
  valence: number;
  loudness: number;
}

export async function searchTracks(token: string, query: string, limit = 12): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(
    token,
    `/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`,
  );
  return data.tracks.items as SpotifyTrack[];
}

export async function getTrack(token: string, trackId: string): Promise<SpotifyTrack> {
  return (await spotifyFetch(token, `/tracks/${trackId}`)) as SpotifyTrack;
}

export async function getAudioFeatures(token: string, trackIds: string[]): Promise<AudioFeatures[]> {
  if (trackIds.length === 0) return [];
  const chunks: AudioFeatures[][] = [];
  for (let i = 0; i < trackIds.length; i += 100) {
    const slice = trackIds.slice(i, i + 100);
    const data = await spotifyFetch(token, `/audio-features?ids=${slice.join(",")}`);
    chunks.push((data.audio_features as AudioFeatures[]).filter(Boolean));
  }
  return chunks.flat();
}

export async function getRecommendations(
  token: string,
  opts: { seedTracks: string[]; targetEnergy?: number; targetTempo?: number; limit?: number },
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    seed_tracks: opts.seedTracks.slice(0, 5).join(","),
    limit: String(opts.limit ?? 10),
  });
  if (opts.targetEnergy != null) params.set("target_energy", opts.targetEnergy.toFixed(2));
  if (opts.targetTempo != null) params.set("target_tempo", opts.targetTempo.toFixed(0));
  const data = await spotifyFetch(token, `/recommendations?${params.toString()}`);
  return data.tracks as SpotifyTrack[];
}

// ---- Playback control (requires Premium) -----------------------------------

export async function transferPlayback(token: string, deviceId: string, play = false) {
  await fetch(`${SPOTIFY_API}/me/player`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
}

export async function playTrack(token: string, deviceId: string, uri: string, positionMs = 0) {
  const res = await fetch(`${SPOTIFY_API}/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    if (res.status === 403 && body.includes("PREMIUM_REQUIRED")) {
      throw new Error("Spotify Premium is required for in-browser playback.");
    }
    throw new Error(`Spotify play failed: ${res.status} ${body}`);
  }
}

export async function pausePlayback(token: string, deviceId: string) {
  await fetch(`${SPOTIFY_API}/me/player/pause?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getPlaybackState(token: string) {
  const res = await fetch(`${SPOTIFY_API}/me/player`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Spotify state failed: ${res.status}`);
  return res.json() as Promise<{
    is_playing: boolean;
    progress_ms: number;
    item: SpotifyTrack | null;
    device: { id: string; name: string } | null;
  }>;
}

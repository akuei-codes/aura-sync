// Spotify OAuth — server routes for login + callback.
// Flow: DJ clicks "Connect Spotify" on /connect → /api/spotify/login?session=<id>&token=<djToken>
// → redirected to Spotify → callback hits /api/spotify/callback → tokens encrypted+stored
// → user redirected back to /dj?session=<slug>&token=<djToken>.

import { createFileRoute } from "@tanstack/react-router";
import { sql } from "@/lib/db.server";
import { sha256Hex, encrypt, randomToken } from "@/lib/crypto.server";
import { spotifyAuthorizeUrl, exchangeCode } from "@/lib/spotify.server";
import { setCookie, getCookie, deleteCookie } from "@tanstack/react-start/server";

function redirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/spotify/callback`;
}

export const Route = createFileRoute("/api/spotify/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const sessionId = url.searchParams.get("session");
          const djToken = url.searchParams.get("token");
          if (!sessionId || !djToken) {
            return new Response("Missing session or token", { status: 400 });
          }

          // Confirm Spotify creds are present BEFORE we hit the DB or set cookies
          if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
            console.error("[spotify/login] Missing SPOTIFY_CLIENT_ID/SECRET env vars");
            return new Response(
              "Spotify is not configured on the server. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET secrets.",
              { status: 500 },
            );
          }

          // Validate DJ owns this session
          let rows: Array<{ slug: string }>;
          try {
            rows = await sql<Array<{ slug: string }>>`
              select slug from public.sessions
              where id = ${sessionId} and dj_token_hash = ${sha256Hex(djToken)}
            `;
          } catch (dbErr) {
            console.error("[spotify/login] DB lookup failed:", dbErr);
            return new Response(
              `Database error while verifying session: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
              { status: 500 },
            );
          }
          if (rows.length === 0) {
            return new Response("Unauthorized — session not found or token mismatch", { status: 401 });
          }

          const state = randomToken(16);
          const cookieValue = JSON.stringify({ state, sessionId, djToken, slug: rows[0].slug });

          // setCookie can throw if called outside a request context; guard it.
          try {
            setCookie("zynk_oauth", cookieValue, {
              httpOnly: true,
              sameSite: "lax",
              secure: url.protocol === "https:",
              maxAge: 600,
              path: "/",
            });
          } catch (cookieErr) {
            console.error("[spotify/login] setCookie failed:", cookieErr);
            // Fall back to setting Set-Cookie header manually on the response.
            const authUrl = spotifyAuthorizeUrl(redirectUri(request), state);
            const secureFlag = url.protocol === "https:" ? "; Secure" : "";
            return new Response(null, {
              status: 302,
              headers: {
                Location: authUrl,
                "Set-Cookie": `zynk_oauth=${encodeURIComponent(cookieValue)}; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=600; Path=/`,
              },
            });
          }

          const authUrl = spotifyAuthorizeUrl(redirectUri(request), state);
          return new Response(null, { status: 302, headers: { Location: authUrl } });
        } catch (err) {
          console.error("[spotify/login] Unhandled error:", err);
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          return new Response(`Spotify login failed: ${msg}`, { status: 500 });
        }
      },
    },
  },
});

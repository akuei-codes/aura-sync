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
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session");
        const djToken = url.searchParams.get("token");
        if (!sessionId || !djToken) {
          return new Response("Missing session or token", { status: 400 });
        }

        // Validate DJ owns this session
        const rows = await sql<Array<{ slug: string }>>`
          select slug from public.sessions where id = ${sessionId} and dj_token_hash = ${sha256Hex(djToken)}
        `;
        if (rows.length === 0) return new Response("Unauthorized", { status: 401 });

        const state = randomToken(16);
        // Stash state + sessionId + djToken in a short-lived signed cookie
        setCookie("zynk_oauth", JSON.stringify({ state, sessionId, djToken, slug: rows[0].slug }), {
          httpOnly: true,
          sameSite: "lax",
          secure: url.protocol === "https:",
          maxAge: 600,
          path: "/",
        });

        const authUrl = spotifyAuthorizeUrl(redirectUri(request), state);
        return new Response(null, { status: 302, headers: { Location: authUrl } });
      },
    },
  },
});

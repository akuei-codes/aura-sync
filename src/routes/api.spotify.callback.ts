import { createFileRoute } from "@tanstack/react-router";
import { sql } from "@/lib/db.server";
import { encrypt } from "@/lib/crypto.server";
import { exchangeCode } from "@/lib/spotify.server";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          let cookieRaw: string | undefined;
          try {
            cookieRaw = getCookie("zynk_oauth");
            deleteCookie("zynk_oauth", { path: "/" });
          } catch (e) {
            console.error("[spotify/callback] cookie read failed:", e);
          }
          if (!cookieRaw) return new Response("OAuth state missing (cookie expired or blocked)", { status: 400 });

          let stash: { state: string; sessionId: string; djToken: string; slug: string };
          try {
            stash = JSON.parse(cookieRaw);
          } catch {
            return new Response("Bad OAuth state", { status: 400 });
          }

          if (error) {
            return new Response(null, {
              status: 302,
              headers: { Location: `/connect?error=${encodeURIComponent(error)}` },
            });
          }
          if (!code || state !== stash.state) {
            return new Response("Invalid OAuth callback", { status: 400 });
          }

          const redirectUri = `${url.origin}/api/spotify/callback`;
          let tokens;
          try {
            tokens = await exchangeCode(code, redirectUri);
          } catch (e) {
            console.error("[spotify/callback] exchangeCode failed:", e);
            return new Response(`Spotify token exchange failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
          }

          let profile: { id: string | null; product?: string } = { id: null, product: "free" };
          try {
            const profileRes = await fetch("https://api.spotify.com/v1/me", {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            if (profileRes.ok) profile = await profileRes.json();
          } catch (e) {
            console.error("[spotify/callback] profile fetch failed:", e);
          }
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

          try {
            await sql`
              update public.sessions set
                spotify_user_id = ${profile.id},
                spotify_access_token = ${encrypt(tokens.access_token)},
                spotify_refresh_token = ${encrypt(tokens.refresh_token)},
                spotify_access_expires_at = ${expiresAt}
              where id = ${stash.sessionId}
            `;
          } catch (e) {
            console.error("[spotify/callback] DB update failed:", e);
            return new Response(`DB update failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
          }

          const isPremium = profile.product === "premium";
          const dest = `/dj?slug=${encodeURIComponent(stash.slug)}&token=${encodeURIComponent(stash.djToken)}${isPremium ? "" : "&warn=free"}`;
          return new Response(null, { status: 302, headers: { Location: dest } });
        } catch (err) {
          console.error("[spotify/callback] Unhandled error:", err);
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          return new Response(`Spotify callback failed: ${msg}`, { status: 500 });
        }
      },
    },
  },
});

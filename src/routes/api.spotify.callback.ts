import { createFileRoute } from "@tanstack/react-router";
import { sql } from "@/lib/db.server";
import { encrypt } from "@/lib/crypto.server";
import { exchangeCode } from "@/lib/spotify.server";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const cookieRaw = getCookie("zynk_oauth");
        deleteCookie("zynk_oauth", { path: "/" });
        if (!cookieRaw) return new Response("OAuth state missing", { status: 400 });

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
        const tokens = await exchangeCode(code, redirectUri);

        // Fetch user profile
        const profileRes = await fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = profileRes.ok ? await profileRes.json() : { id: null, product: "free" };
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        await sql`
          update public.sessions set
            spotify_user_id = ${profile.id},
            spotify_access_token = ${encrypt(tokens.access_token)},
            spotify_refresh_token = ${encrypt(tokens.refresh_token)},
            spotify_access_expires_at = ${expiresAt}
          where id = ${stash.sessionId}
        `;

        const isPremium = profile.product === "premium";
        const dest = `/dj?slug=${encodeURIComponent(stash.slug)}&token=${encodeURIComponent(stash.djToken)}${isPremium ? "" : "&warn=free"}`;
        return new Response(null, { status: 302, headers: { Location: dest } });
      },
    },
  },
});

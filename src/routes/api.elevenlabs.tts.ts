// ElevenLabs TTS endpoint — generates short DJ voice callouts.
// Backend-only access to ELEVENLABS_API_KEY. Includes retry on 429/5xx with
// Retry-After honoring, and never returns 5xx to the client (returns a JSON
// fallback signal so the client can degrade gracefully).
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function callElevenLabs(text: string, voiceId: string, apiKey: string, attempt = 0): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.85,
            style: 0.6,
            use_speaker_boost: true,
          },
        }),
        signal: ctrl.signal,
      },
    );
    if (!upstream.ok && (upstream.status === 429 || upstream.status >= 500) && attempt < 3) {
      const ra = Number(upstream.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 400 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return callElevenLabs(text, voiceId, apiKey, attempt + 1);
    }
    return upstream;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/elevenlabs/tts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "TTS_NOT_CONFIGURED", fallback: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let body: { text?: string };
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "BAD_JSON", fallback: true }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const text = (body.text ?? "").trim();
        // Voice is HARD-LOCKED server-side. Client cannot override.
        const voiceId = "XSr0HH9U8dbZZaKq4Rmh";
        if (!text || text.length > 240) {
          return new Response(JSON.stringify({ error: "BAD_TEXT", fallback: true }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const upstream = await callElevenLabs(text, voiceId, apiKey);
          if (!upstream.ok) {
            const errTxt = await upstream.text().catch(() => "");
            console.error("ElevenLabs TTS failed:", upstream.status, errTxt.slice(0, 200));
            // Never propagate a 5xx — return a 200 JSON fallback so the client
            // can switch to the browser SpeechSynthesis layer.
            return new Response(
              JSON.stringify({ error: "TTS_UPSTREAM", status: upstream.status, fallback: true }),
              { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
            );
          }
          if (!upstream.body) {
            return new Response(JSON.stringify({ error: "EMPTY_BODY", fallback: true }), {
              status: 200, headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400, immutable",
              ...CORS,
            },
          });
        } catch (e) {
          console.error("TTS exception:", e);
          return new Response(JSON.stringify({ error: "NETWORK", fallback: true }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});

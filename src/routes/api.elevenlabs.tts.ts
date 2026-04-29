// ElevenLabs TTS endpoint — generates short DJ voice callouts.
// Backend-only access to ELEVENLABS_API_KEY. Includes retry on 429/5xx.
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function callElevenLabs(text: string, voiceId: string, apiKey: string, attempt = 0): Promise<Response> {
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.85,
          style: 0.75,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!upstream.ok && (upstream.status === 429 || upstream.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    return callElevenLabs(text, voiceId, apiKey, attempt + 1);
  }
  return upstream;
}

export const Route = createFileRoute("/api/elevenlabs/tts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let body: { text?: string; voiceId?: string };
        try { body = await request.json(); } catch {
          return new Response("Invalid JSON", { status: 400, headers: CORS });
        }

        const text = (body.text ?? "").trim();
        const voiceId = (body.voiceId ?? "iP95p4xoKVk53GoZ742B").trim();
        if (!text || text.length > 200) {
          return new Response("text required (1-200 chars)", { status: 400, headers: CORS });
        }
        if (!/^[a-zA-Z0-9_]+$/.test(voiceId)) {
          return new Response("invalid voiceId", { status: 400, headers: CORS });
        }

        try {
          const upstream = await callElevenLabs(text, voiceId, apiKey);
          if (!upstream.ok) {
            const err = await upstream.text();
            console.error("ElevenLabs TTS failed:", upstream.status, err);
            return new Response(JSON.stringify({ error: "TTS upstream failed", status: upstream.status }), {
              status: 502,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          if (!upstream.body) {
            return new Response("No audio body", { status: 502, headers: CORS });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
              ...CORS,
            },
          });
        } catch (e) {
          console.error("TTS exception:", e);
          return new Response(JSON.stringify({ error: "TTS network failure" }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});

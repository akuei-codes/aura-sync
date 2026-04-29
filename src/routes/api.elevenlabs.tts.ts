// ElevenLabs TTS endpoint — generates short DJ voice callouts.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/elevenlabs/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: { text?: string; voiceId?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const text = (body.text ?? "").trim();
        const voiceId = (body.voiceId ?? "iP95p4xoKVk53GoZ742B").trim();
        if (!text || text.length > 200) {
          return new Response("text required (1-200 chars)", { status: 400 });
        }
        if (!/^[a-zA-Z0-9_]+$/.test(voiceId)) {
          return new Response("invalid voiceId", { status: 400 });
        }

        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_turbo_v2_5",
              voice_settings: {
                stability: 0.4,
                similarity_boost: 0.75,
                style: 0.7,
                use_speaker_boost: true,
              },
            }),
          },
        );

        if (!upstream.ok) {
          const err = await upstream.text();
          console.error("ElevenLabs TTS failed:", upstream.status, err);
          return new Response(JSON.stringify({ error: "TTS upstream failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!upstream.body) {
          return new Response("No audio body", { status: 502 });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

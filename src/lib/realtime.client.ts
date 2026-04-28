// Client-side Supabase Realtime singleton. Used only for postgres_changes subscriptions.
// Credentials come from a server function (REALTIME_URL / REALTIME_PUBLISHABLE_KEY)
// — never bundled, never in VITE_ envs.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function initRealtime(url: string, key: string): SupabaseClient {
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

export function getRealtime(): SupabaseClient | null {
  return client;
}

// Server-only Postgres client. Never import from a route file or client component.
// We use postgres.js because Cloudflare Workers cannot use `pg` (raw TCP socket
// requirement). postgres.js works against Supabase's Supavisor pooler over TCP
// in Node and over the Hyperdrive-style HTTP shim in Workers.
//
// CRITICAL: import this file only from `*.server.ts` files or inside
// `createServerFn().handler(...)` bodies — the build will reject it elsewhere.

import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __zynk_sql: ReturnType<typeof postgres> | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in Lovable Cloud → Workspace settings.",
    );
  }
  return url;
}

/**
 * Singleton postgres.js client. Reused across server-function invocations.
 * Use Supabase's *pooler* connection string (port 6543) for serverless safety.
 */
export const sql =
  globalThis.__zynk_sql ??
  postgres(getDatabaseUrl(), {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required for Supabase transaction-mode pooler
    // postgres.js will negotiate SSL automatically for sslmode=require URLs.
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__zynk_sql = sql;
}

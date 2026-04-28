// Server-only Postgres client. Never import from a route file or client component.
//
// Cloudflare Workers forbid sharing I/O objects (sockets, streams) across
// different request handlers. That means we CANNOT cache a postgres.js client
// on globalThis — the second request that touches it will throw:
//   "Cannot perform I/O on behalf of a different request."
//
// Strategy: create a fresh postgres client per request, lazily, and end it
// after the call resolves. To keep call sites unchanged (`await sql\`...\``),
// we export a tagged-template proxy that builds + tears down the client on
// each invocation.
//
// CRITICAL: import this file only from `*.server.ts` files or inside
// `createServerFn().handler(...)` bodies — the build rejects it elsewhere.

import postgres from "postgres";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in Lovable Cloud → Workspace settings.",
    );
  }
  return url;
}

function makeClient() {
  return postgres(getDatabaseUrl(), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false, // required for Supabase transaction-mode pooler
  });
}

/**
 * Per-request tagged-template SQL runner.
 *
 * Usage (unchanged from before):
 *   const rows = await sql<Row[]>`select * from x where id = ${id}`;
 *
 * Each call spins up a short-lived postgres.js client, runs the query, and
 * tears it down — sidestepping Cloudflare Workers' cross-request I/O ban.
 */
export function sql<T = unknown>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const client = makeClient();
  // postgres.js exposes the same tagged-template API on the client itself.
  // Forward our template parts to it, await, then close the connection.
  return (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (client as any)(strings, ...values);
      return result as T;
    } finally {
      // Fire-and-forget; don't block the response on socket teardown.
      client.end({ timeout: 1 }).catch(() => {});
    }
  })();
}

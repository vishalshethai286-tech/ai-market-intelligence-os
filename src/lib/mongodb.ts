import "server-only";
import dns from "node:dns";
import mongoose from "mongoose";
import { validateEnv } from "@/lib/env";

/**
 * Re-validated here (mirrors the old src/lib/prisma.ts comment) because on
 * Vercel, instrumentation.ts's register() isn't guaranteed to run for every
 * serverless/edge function invocation — this module is imported by every
 * DB-touching Server Component, Server Action, and Route Handler, so a throw
 * here happens in the actual request's import graph and can't be silently
 * swallowed.
 */
validateEnv();

/**
 * A `mongodb+srv://` URI (used by MongoDB Atlas) needs a DNS SRV + TXT
 * lookup before the driver can even open a connection. Node's default
 * resolver queries the OS's configured nameserver directly over UDP — on
 * some networks that nameserver either doesn't answer SRV queries or only
 * publishes an IPv6 address Node can't reach, failing with
 * `querySrv ECONNREFUSED` even though the system's own `nslookup` resolves
 * it fine via a different path.
 *
 * Globally calling `dns.setServers()` (an earlier version of this fix) was
 * unreliable under Next.js dev (Turbopack): Server Actions can run in a
 * separate bundle/worker context that doesn't reliably inherit that global
 * mutation before its own connection attempt. Doing the SRV+TXT lookup
 * ourselves, with an isolated `dns.promises.Resolver` instance pointed at a
 * public DNS server, sidesteps that entirely — the result doesn't depend on
 * any shared global state, so it works the same regardless of which
 * worker/bundle runs it. The rewritten URI is a standard non-SRV
 * `mongodb://` string (explicit shard hosts + replicaSet/authSource from the
 * TXT record), which needs no further SRV resolution to connect.
 */
async function resolveSrvConnectionString(uri: string): Promise<string> {
  if (!uri.startsWith("mongodb+srv://")) return uri;

  const parsed = new URL(uri);
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);

  const [srvRecords, txtRecords] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${parsed.hostname}`),
    resolver.resolveTxt(parsed.hostname).catch(() => []),
  ]);

  const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
  const txtParams = new URLSearchParams(txtRecords.map((chunks) => chunks.join("")).join("&"));

  const params = new URLSearchParams(parsed.search);
  params.set("tls", "true");
  for (const [key, value] of txtParams) {
    if (!params.has(key)) params.set(key, value);
  }

  const auth = parsed.username ? `${parsed.username}:${parsed.password}@` : "";
  return `mongodb://${auth}${hosts}${parsed.pathname}?${params.toString()}`;
}

const globalForMongoose = globalThis as unknown as {
  mongooseConn: Promise<typeof mongoose> | undefined;
};

/**
 * Cached connection promise, reused across hot reloads in dev and across
 * invocations on a warm serverless instance. If the connection attempt
 * itself rejects (e.g. a transient DNS hiccup), the cached promise is
 * cleared so the *next* call retries instead of replaying the same
 * rejection forever — without this, one early failure would permanently
 * break every future request on a warm process/dev server.
 */
export function dbConnect(): Promise<typeof mongoose> {
  if (!globalForMongoose.mongooseConn) {
    globalForMongoose.mongooseConn = resolveSrvConnectionString(process.env.MONGODB_URI!)
      .then((uri) => mongoose.connect(uri))
      .catch((error) => {
        globalForMongoose.mongooseConn = undefined;
        throw error;
      });
  }
  return globalForMongoose.mongooseConn;
}

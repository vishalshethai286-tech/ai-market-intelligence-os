import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { validateEnv } from "@/lib/env";

/**
 * Re-validated here (in addition to instrumentation.ts) because on Vercel,
 * register() only runs if the platform actually loads and invokes
 * instrumentation.ts for a given serverless/edge function — which isn't
 * guaranteed the way a single long-lived `next start` process is. This
 * module is imported by every DB-touching Server Component, Server Action,
 * and Route Handler (transitively via src/auth.ts and src/proxy.ts too), so
 * a throw here happens in the actual request's import graph and can't be
 * silently swallowed the way a missing/unbundled instrumentation hook can.
 */
validateEnv();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

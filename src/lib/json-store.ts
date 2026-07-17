import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Minimal file-backed collection store for data the user wants to manage as
 * plain JSON instead of a database table (see docs on this decision in
 * PROJECT_STATUS.md). Each collection is one JSON array in one file under
 * `data/`. Not safe under concurrent writers — fine for a single-instance MVP,
 * not a substitute for Postgres once this needs to run with real concurrency.
 *
 * Records created here use an id prefixed with `json_` so service-layer code
 * can tell at a glance whether an id belongs to this store or to Prisma.
 */

const DATA_DIR = path.join(process.cwd(), "data");
export const JSON_ID_PREFIX = "json_";

export function isJsonId(id: string): boolean {
  return id.startsWith(JSON_ID_PREFIX);
}

export function newJsonId(): string {
  return `${JSON_ID_PREFIX}${crypto.randomUUID()}`;
}

function filePath(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

export async function readCollection<T>(collection: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath(collection), "utf-8");
    return JSON.parse(raw) as T[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeCollection<T>(collection: string, rows: T[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(filePath(collection), JSON.stringify(rows, null, 2), "utf-8");
}

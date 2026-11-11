// Migrations: `migrations/NNNN_name.sql`, applied in order, each in its own transaction, tracked by
// `PRAGMA user_version`. Start-up refuses a database that is newer than the code (architecture §4.3).
import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const out: Migration[] = [];
  for (const file of readdirSync(dir).sort()) {
    const m = /^(\d{4})_([a-z0-9_-]+)\.sql$/.exec(file);
    if (m === null) continue;
    out.push({ version: Number(m[1]), name: m[2] as string, sql: readFileSync(join(dir, file), "utf8") });
  }
  out.forEach((mig, i) => {
    if (mig.version !== i + 1)
      throw new Error(`migration ${mig.name}: expected version ${i + 1}, got ${mig.version}`);
  });
  return out;
}

/** The schema version this code knows. */
export function latestVersion(migrations: readonly Migration[] = loadMigrations()): number {
  return migrations.length;
}

function userVersion(db: Database): number {
  return Number((db.query("PRAGMA user_version").get() as { user_version: number }).user_version);
}

/** Apply every pending migration. Returns the versions applied. */
export function migrate(db: Database, migrations: readonly Migration[] = loadMigrations()): number[] {
  const current = userVersion(db);
  const latest = migrations.length;
  if (current > latest)
    throw new Error(`database schema v${current} is newer than this build (v${latest}); update Oak first`);
  const applied: number[] = [];
  for (const mig of migrations) {
    if (mig.version <= current) continue;
    db.transaction(() => {
      db.exec(mig.sql);
      // PRAGMA takes no bound parameter; the value is an integer from a file name.
      db.exec(`PRAGMA user_version = ${mig.version}`);
    }).immediate();
    applied.push(mig.version);
  }
  return applied;
}

/** DDL of every trigger, to drop and recreate around a bulk replace (backup import, data reset). */
export function triggerDdl(db: Database): { name: string; sql: string }[] {
  return db
    .query("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL ORDER BY name")
    .all() as { name: string; sql: string }[];
}

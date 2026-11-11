// SQLite (bun:sqlite): one connection, WAL, foreign keys on. The server is the single writer.
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.ts";

export type Db = Database;
export type Bind = SQLQueryBindings;
export type Row = Record<string, unknown>;

export interface OpenOptions {
  /** Run pending migrations (default true). */
  migrate?: boolean;
}

export function openDb(path: string, options: OpenOptions = {}): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA synchronous = NORMAL");
  if (options.migrate !== false) migrate(db);
  return db;
}

/** Run `fn` in one transaction (BEGIN IMMEDIATE); a throw rolls everything back. Nested calls join the outer one. */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.inTransaction) return fn();
  return db.transaction(fn).immediate();
}

export function all<T = Row>(db: Db, sql: string, ...params: Bind[]): T[] {
  return db.query(sql).all(...params) as T[];
}
export function get<T = Row>(db: Db, sql: string, ...params: Bind[]): T | null {
  return (db.query(sql).get(...params) as T | null) ?? null;
}
export function run(db: Db, sql: string, ...params: Bind[]): { changes: number; lastInsertRowid: number } {
  const r = db.query(sql).run(...params);
  return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
}

// --- column helpers -------------------------------------------------------------------------------

export const bool = (v: unknown): boolean => v === 1 || v === true || v === 1n;
export const int = (v: boolean): 0 | 1 => (v ? 1 : 0);
export const toJson = (v: unknown): string => JSON.stringify(v);
export const toJsonOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));

/** Parse a `*_json` column; a NULL or unreadable value gives `fallback`. */
export function fromJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== "string" || text === "") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** User tables in creation order (parents before children), without SQLite's own. */
export function tableNames(db: Db): string[] {
  return all<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
  ).map((r) => r.name);
}

export function schemaVersion(db: Db): number {
  return Number(get<{ user_version: number }>(db, "PRAGMA user_version")?.user_version ?? 0);
}

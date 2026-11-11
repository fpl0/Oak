// Server configuration: where the data lives, which ports are allowed, whether dev routes exist.
// Nothing else in the server reads `process.env` or `Bun.argv` (the API key is read by secrets.ts).
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { PORTS } from "@oak/api";

export const APP_VERSION = "0.0.0";

export interface OakConfig {
  /** Always loopback: the server never listens on another interface (contracts §11.1 rule 1). */
  hostname: "127.0.0.1";
  port: number;
  /** `OAK_DEV=1`: `/api/dev/*` exists and the Vite port is an allowed Host and Origin. */
  dev: boolean;
  /** Serve `dist/` with SPA fallback (`--serve-dist`, the production start). */
  serveDist: boolean;
  /** `OAK_DATA_DIR`, default `~/.oak`. */
  dataDir: string;
  dbPath: string;
  audioDir: string;
  albumDir: string;
  backupsDir: string;
  secretsDir: string;
  /** Repository root: `content/`, `sounds/pack/`, `dist/` and `.env.local` are found from here. */
  rootDir: string;
  distDir: string;
  soundsDir: string;
  contentDir: string;
  appVersion: string;
  /** Extra ports whose Host and Origin are allowed (the Vite proxy in dev). */
  devPorts: readonly number[];
}

export interface ConfigInput {
  env?: Record<string, string | undefined>;
  argv?: readonly string[];
  rootDir?: string;
}

/** The data directory layout of contracts §11.10 under `dataDir`. */
export function dataPaths(dataDir: string) {
  return {
    dataDir,
    dbPath: join(dataDir, "oak.db"),
    audioDir: join(dataDir, "audio"),
    albumDir: join(dataDir, "album"),
    backupsDir: join(dataDir, "backups"),
    secretsDir: join(dataDir, "secrets"),
  };
}

export function loadConfig(input: ConfigInput = {}): OakConfig {
  const env = input.env ?? process.env;
  const argv = input.argv ?? process.argv.slice(2);
  const rootDir = resolve(input.rootDir ?? join(import.meta.dir, "..", ".."));
  const dataDir = resolve(env.OAK_DATA_DIR?.trim() || join(homedir(), ".oak"));
  const dev = env.OAK_DEV === "1";
  const port = Number(env.OAK_PORT) > 0 ? Number(env.OAK_PORT) : PORTS.api;
  return {
    hostname: "127.0.0.1",
    port,
    dev,
    serveDist: argv.includes("--serve-dist"),
    ...dataPaths(dataDir),
    rootDir,
    distDir: join(rootDir, "dist"),
    soundsDir: join(rootDir, "sounds", "pack"),
    contentDir: join(rootDir, "content"),
    appVersion: APP_VERSION,
    devPorts: dev ? [PORTS.vite] : [],
  };
}

/** A configuration for tests: everything under one temp directory, no dev routes unless asked. */
export function testConfig(dataDir: string, overrides: Partial<OakConfig> = {}): OakConfig {
  const rootDir = resolve(join(import.meta.dir, "..", ".."));
  return {
    hostname: "127.0.0.1",
    port: PORTS.api,
    dev: false,
    serveDist: false,
    ...dataPaths(dataDir),
    rootDir,
    distDir: join(dataDir, "dist"),
    soundsDir: join(dataDir, "sounds"),
    contentDir: join(dataDir, "content"),
    appVersion: APP_VERSION,
    devPorts: [],
    ...overrides,
  };
}

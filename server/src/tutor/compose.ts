// The default wiring: both real backends, the selection, the service and the Hono app, with the
// CLI backend's MCP endpoint mounted beside the tutor routes. The server calls this once and adds
// its own adapters for the ports; everything else in this folder is reached through the result.
//
//   const tutor = createDefaultTutor({ ports, apiKey: () => secrets.anthropicKey() });
//   root.route("/", tutor.app);                       // /api/tutor/* and /mcp/tutor
//   Bun.serve({ hostname: "127.0.0.1", port: 8787, fetch: root.fetch });
import type { Context, Hono } from "hono";
import { type AnthropicApiOptions, createAnthropicApiBackend } from "./backends/api/index.ts";
import {
  type ClaudeCliBackend,
  type ClaudeCliDeps,
  createClaudeCliBackend,
  createMcpEndpoint,
  type TurnRegistry,
} from "./backends/cli/index.ts";
import { redactSecrets } from "./errors.ts";
import type { UsageSummary } from "./events.ts";
import { createTutorApp, type ExtraApp } from "./http/routes.ts";
import { DEFAULT_PORT, localSecurity, type SecurityOptions } from "./http/security.ts";
import type { IdleTimeoutServer } from "./http/sse.ts";
import type { TutorPorts } from "./ports.ts";
import { createTutorService } from "./service.ts";
import type { TutorLogEntry, TutorService, TutorServiceDeps } from "./service-types.ts";
import { learnerDay } from "./threads.ts";
import type { TutorBackend } from "./types.ts";

export const DEFAULT_BASE_PATH = "/api";
export const DEFAULT_MCP_PATH = "/mcp/tutor";
/** The `conversationId` of usage rows that belong to no conversation: the cache warm-up. */
export const WARM_USAGE_ID = "warm";

export interface DefaultTutorDeps {
  ports: TutorPorts;
  /**
   * The Anthropic API key, or how to read it now. A function is asked on every use, so a key
   * pasted in Settings takes effect without a restart (contracts §11.5). Never read from the
   * environment here: the server deletes it from its own environment before it spawns anything.
   */
  apiKey?: string | null | (() => string | null | undefined);
  /** The port the server listens on (127.0.0.1 only). Default 8787. */
  port?: number;
  /** Extra allowed ports, e.g. `[5173]` for the Vite proxy in dev. */
  devPorts?: readonly number[];
  /** Prefix of the tutor routes. Default `/api`. */
  basePath?: string;
  /** Where the CLI backend's tool endpoint is mounted. Must NOT be under `basePath`. Default `/mcp/tutor`. */
  mcpPath?: string;
  /** Transport options of the API backend (tests pass a cassette `fetch`). */
  api?: Pick<AnthropicApiOptions, "fetch" | "baseURL" | "maxRetries" | "contextPlacement" | "tailCache">;
  /** Process options of the CLI backend (tests pass a fake `claudePath`). */
  cli?: Omit<ClaudeCliDeps, "registry" | "mcpUrl" | "mcpHeaders" | "log">;
  log?: (entry: TutorLogEntry) => void;
  /** Where an accepted review is stored (`review_json`, contracts §10.6). */
  onReview?: TutorServiceDeps["onReview"];
  /** Default `require`: a stream is refused rather than left to Bun's 10 s idle timeout. */
  idleTimeout?: "require" | "best-effort";
  bunServer?: (c: Context) => IdleTimeoutServer | null;
  heartbeatMs?: number;
  cardDrafts?: boolean;
}

export interface DefaultTutor {
  /** Mount at the server's root: it carries `basePath` and `mcpPath` itself. */
  app: Hono;
  service: TutorService;
  /** The allowlist the tutor routes use; put `oakSecurity(security)` on the rest of `/api/*`. */
  security: SecurityOptions;
  backends: { api: TutorBackend; cli: ClaudeCliBackend };
  mcp: { url: string; path: string; registry: TurnRegistry };
  /** Call after the learner pasted or removed a key, signed in to Claude Code, or changed the backend. */
  refresh(): void;
}

/**
 * The API backend behind a key that can change while the server runs. The inner backend (and
 * with it the SDK client) is rebuilt only when the key's value changes.
 */
function keyedApiBackend(
  readKey: () => string | null | undefined,
  options: Omit<AnthropicApiOptions, "apiKey" | "client">,
): TutorBackend {
  let key: string | null = null;
  let inner: TutorBackend | null = null;
  const current = (): TutorBackend => {
    const now = readKey()?.trim() || null;
    if (inner === null || now !== key) {
      key = now;
      inner = createAnthropicApiBackend({ ...options, apiKey: now });
    }
    return inner;
  };
  return {
    id: "anthropic-api",
    available: () => current().available(),
    runTurn: (input, emit, signal) => current().runTurn(input, emit, signal),
    runStructured: (input, signal) => current().runStructured(input, signal),
    warm: async (input, signal) => current().warm?.(input, signal),
  };
}

export function createDefaultTutor(deps: DefaultTutorDeps): DefaultTutor {
  const { ports } = deps;
  const port = deps.port ?? DEFAULT_PORT;
  const basePath = deps.basePath ?? DEFAULT_BASE_PATH;
  const mcpPath = deps.mcpPath ?? DEFAULT_MCP_PATH;
  // The `claude` process sends neither Origin nor X-Oak, so its endpoint cannot live under the
  // browser rules of `basePath`; a path under it would be answered 403 on every tool call.
  if (mcpPath === basePath || mcpPath.startsWith(`${basePath}/`))
    throw new Error(`mcpPath (${mcpPath}) must be outside basePath (${basePath})`);

  const log =
    deps.log ??
    ((e: TutorLogEntry) => console.error(`[tutor] ${e.level}: ${e.msg}${e.detail ? ` (${e.detail})` : ""}`));
  const security = localSecurity(port, deps.devPorts ?? []);

  // A warm-up is a billed call with no turn to hang its usage on; it is logged as its own row so
  // the month's estimate and the soft marker see it.
  const recordWarm = (usage: UsageSummary) => {
    const now = ports.clock.now();
    const row = {
      at: now.toISOString(),
      day: learnerDay(now, ports.clock.timeZone()),
      conversationId: WARM_USAGE_ID,
      kind: "chat" as const,
      lane: "chat" as const,
      usage,
    };
    ports.usage.record(row).catch((e: unknown) => {
      log({ level: "warn", msg: "warm-up usage not recorded", detail: redactSecrets(String(e)) });
    });
  };
  const readKey = typeof deps.apiKey === "function" ? deps.apiKey : () => deps.apiKey as string | null;
  const api = keyedApiBackend(readKey, { ...deps.api, onWarmUsage: recordWarm });

  // The CLI is told the server's own address, so the endpoint accepts that Host and no dev port.
  const mcp = createMcpEndpoint({ hosts: localSecurity(port).allowedHosts });
  const mcpUrl = `http://127.0.0.1:${port}${mcpPath}`;
  const cli = createClaudeCliBackend({
    ...deps.cli,
    registry: mcp.registry,
    mcpUrl,
    log: (line) => log({ level: "warn", msg: line }),
  });

  const service = createTutorService({
    ports,
    // Selection order when the setting is `auto`: the API key first, then the logged-in CLI.
    backends: [api, cli],
    log,
    ...(deps.onReview === undefined ? {} : { onReview: deps.onReview }),
    ...(deps.cardDrafts === undefined ? {} : { cardDrafts: deps.cardDrafts }),
  });

  const extraApps: ExtraApp[] = [{ path: mcpPath, app: mcp.app, guard: "host" }];
  const app = createTutorApp({
    service,
    security,
    log,
    basePath,
    extraApps,
    idleTimeout: deps.idleTimeout ?? "require",
    ...(deps.bunServer === undefined ? {} : { bunServer: deps.bunServer }),
    ...(deps.heartbeatMs === undefined ? {} : { heartbeatMs: deps.heartbeatMs }),
  });

  return {
    app,
    service,
    security,
    backends: { api, cli },
    mcp: { url: mcpUrl, path: mcpPath, registry: mcp.registry },
    refresh() {
      cli.detector.reset();
      service.refreshBackends();
    },
  };
}

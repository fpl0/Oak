// The tutor's HTTP surface: a Hono app the server mounts at its root (`basePath: "/api"`).
//
// Two kinds of answer, and the browser can tell them apart by status alone:
//  - a turn that passed validation is ALWAYS 200 text/event-stream ending in `done` or `error`,
//    including "the tutor is off", "monthly cap reached" and "this subject is closed";
//  - 4xx/5xx JSON `{ error: { kind, message, problems? } }` means the request itself was wrong
//    (bad body, refused by the security rules) and no turn was started.
//
// Path names follow contracts §11.9 (`/tutor/warm`, `/tutor/note`) and architecture §4.4
// (`/tutor/reviews/*`); the older spellings are accepted as aliases.
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { ERROR_COPY, redactSecrets, type TutorErrorKind } from "../errors.ts";
import type { TutorLogEntry, TutorService } from "../service-types.ts";
import type { ThreadKind } from "../types.ts";
import {
  CardParams,
  NoteParams,
  parseTurnBody,
  problemsOf,
  StatusQuery,
  ThreadParams,
  ThreadQuery,
} from "./schemas.ts";
import { hostOnly, oakSecurity, type SecurityOptions } from "./security.ts";
import { bunServerOf, type IdleTimeoutServer, sseResponse } from "./sse.ts";

export const TURN_ROUTES: readonly { kind: ThreadKind; paths: readonly [string, ...string[]] }[] = [
  { kind: "chat", paths: ["/tutor/chat"] },
  { kind: "hint", paths: ["/tutor/hint"] },
  { kind: "explain", paths: ["/tutor/explain-mistake"] },
  { kind: "listening", paths: ["/tutor/note", "/tutor/listening-note"] },
  { kind: "review-capstone", paths: ["/tutor/reviews/capstone", "/tutor/review/capstone"] },
  { kind: "review-transcription", paths: ["/tutor/reviews/transcription", "/tutor/review/transcription"] },
];
export const WARM_PATHS = ["/tutor/warm", "/tutor/session-warm"] as const;

/** Learner code (40 kB) plus a full check result fit several times over. */
export const DEFAULT_MAX_BODY_BYTES = 1_000_000;

/**
 * Something that is not a tutor route but has to live on the same server: the CLI backend's MCP
 * endpoint (`createMcpEndpoint().app`, whose routes are relative to where it is mounted). The
 * backend is not imported here; the server passes its app in.
 */
export interface ExtraApp {
  /** Absolute mount point, e.g. `/mcp/tutor`. The sub-app's own routes are relative to it. */
  path: string;
  app: Hono;
  /**
   * `host` (default): Host allowlist only, and no Origin allowed: for local processes, which must
   * then authenticate themselves (the MCP endpoint's per-turn token). `browser`: the full rules.
   */
  guard?: "host" | "browser";
}

export interface TutorAppDeps {
  service: TutorService;
  security: SecurityOptions;
  log?: (entry: TutorLogEntry) => void;
  /** Tests shorten the heartbeat; production leaves it at 5 s. */
  heartbeatMs?: number;
  /** Where the Bun server is, if not `c.env` itself. */
  bunServer?: (c: Context) => IdleTimeoutServer | null;
  /**
   * `require`: a streaming route answers 500 when the Bun server cannot be reached, as in spike
   * S6. `best-effort` (default): stream anyway on the heartbeat alone and log the fact once.
   */
  idleTimeout?: "require" | "best-effort";
  maxBodyBytes?: number;
  /**
   * Prefix of the tutor routes, e.g. `/api` for `/api/tutor/chat`. Default none. Extra apps are
   * NOT under it: they keep their own absolute paths, outside the browser rules of `/api`.
   */
  basePath?: string;
  extraApps?: readonly ExtraApp[];
}

type JsonError = { error: { kind: TutorErrorKind; message: string; problems?: string[] } };

function failure(
  c: Context,
  status: 400 | 404 | 409 | 413 | 415 | 500,
  kind: TutorErrorKind,
  problems?: string[],
) {
  const body: JsonError = { error: { kind, message: ERROR_COPY[kind] } };
  if (problems !== undefined) body.error.problems = problems;
  return c.json(body, status);
}

/** A JSON body, or the response that refuses it. Only `application/json` is read at all. */
async function jsonBody(
  c: Context,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json")
    return {
      ok: false,
      response: failure(c, 415, "bad_request", ["content-type: must be application/json"]),
    };
  try {
    return { ok: true, body: await c.req.json() };
  } catch {
    return { ok: false, response: failure(c, 400, "bad_request", ["body: not valid JSON"]) };
  }
}

function parsed<T extends z.ZodType>(schema: T, value: unknown): z.output<T> | string[] {
  const res = schema.safeParse(value);
  return res.success ? res.data : problemsOf(res.error);
}

export function createTutorApp(deps: TutorAppDeps): Hono {
  const { service } = deps;
  const log =
    deps.log ?? ((e: TutorLogEntry) => console.error(`[tutor] ${e.level}: ${e.msg}`, e.detail ?? ""));
  const findServer = deps.bunServer ?? bunServerOf;
  // The tutor's own routes. Paths here are relative to `basePath`.
  const app = new Hono();

  app.use("/tutor/*", oakSecurity(deps.security));
  app.use("/tutor/*", async (c, next) => {
    await next();
    // Learner data and tutor text: never kept by a cache.
    if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
  });
  app.use(
    "/tutor/*",
    bodyLimit({
      maxSize: deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      onError: (c) => failure(c, 413, "bad_request", ["body: too large"]),
    }),
  );

  app.onError((err, c) => {
    if (err instanceof HTTPException) return failure(c, err.status === 413 ? 413 : 400, "bad_request");
    log({ level: "error", msg: "tutor route failed", detail: redactSecrets(String(err)) });
    return failure(c, 500, "internal");
  });

  let warnedNoServer = false;
  const onMissingServer = () => {
    if (warnedNoServer) return;
    warnedNoServer = true;
    log({
      level: "warn",
      msg: "Bun server not reachable from the request context: idle timeout not lifted, heartbeat only",
    });
  };

  const turnHandler = (kind: ThreadKind) => async (c: Context) => {
    const json = await jsonBody(c);
    if (!json.ok) return json.response;
    const body = parseTurnBody(kind, json.body);
    if (!body.ok) return failure(c, 400, "bad_request", body.problems);
    if (deps.idleTimeout === "require" && findServer(c) === null) {
      log({ level: "error", msg: "Bun server not reachable from the request context: stream refused" });
      return failure(c, 500, "internal");
    }
    const opts: Parameters<typeof sseResponse>[2] = {
      server: findServer,
      onMissingServer,
      onError: (e) => log({ level: "error", msg: "tutor stream failed", detail: redactSecrets(String(e)) }),
    };
    if (deps.heartbeatMs !== undefined) opts.heartbeatMs = deps.heartbeatMs;
    return sseResponse(c, (send, signal) => service.turn(body.request, send, signal), opts);
  };
  for (const route of TURN_ROUTES) for (const path of route.paths) app.post(path, turnHandler(route.kind));

  // Fire-and-forget from the browser: it never fails the page, it says what happened. Not tied to
  // the request's lifetime: a navigation away must not cancel a cache write another tab is waiting on.
  for (const path of WARM_PATHS) app.post(path, async (c) => c.json(await service.warm()));

  app.get("/tutor/status", async (c) => {
    const query = parsed(StatusQuery, c.req.query());
    if (Array.isArray(query)) return failure(c, 400, "bad_request", query);
    return c.json(await service.status({ refresh: query.refresh === "1" }));
  });

  app.get("/tutor/threads/:subjectKind/:subjectId", async (c) => {
    const subject = parsed(ThreadParams, c.req.param());
    if (Array.isArray(subject)) return failure(c, 400, "bad_request", subject);
    const query = parsed(ThreadQuery, c.req.query());
    if (Array.isArray(query)) return failure(c, 400, "bad_request", query);
    return c.json(await service.thread(subject, { limit: query.limit }));
  });

  app.post("/tutor/cards/:cardId/applied", async (c) => {
    const params = parsed(CardParams, c.req.param());
    if (Array.isArray(params)) return failure(c, 400, "bad_request", params);
    const outcome = await service.applyCard(params.cardId);
    if (outcome === "unknown") return failure(c, 404, "bad_request", ["cardId: no such card"]);
    // Preview-only is enforced here too, not only by a missing button (contracts §10.7).
    if (outcome === "refused") return failure(c, 409, "bad_request", ["card: preview only"]);
    return c.json({ status: "applied" });
  });

  app.post("/tutor/notes/:noteId/retract", async (c) => {
    const params = parsed(NoteParams, c.req.param());
    if (Array.isArray(params)) return failure(c, 400, "bad_request", params);
    await service.retractNote(params.noteId);
    return c.json({ status: "retracted" });
  });

  const root = new Hono();
  for (const extra of deps.extraApps ?? []) {
    const guard = extra.guard === "browser" ? oakSecurity(deps.security) : hostOnly(deps.security);
    root.use(extra.path, guard);
    root.use(`${extra.path}/*`, guard);
    root.route(extra.path, extra.app);
  }
  root.route(deps.basePath ?? "/", app);
  return root;
}

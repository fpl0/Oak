// The Oak server for the session area's Playwright stack, with a clock the specs can move: the same start-up as
// server/src/main.ts plus `clock`, which reads `<OAK_DATA_DIR>/clock.json` ({ "offsetMs": n }) whenever the file
// changes. Specs time-travel by writing that file (see clock.ts), so streak weeks, repair windows and return gaps
// are tested against the real server. Dev only: never used by the app.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The server's modules are loaded by computed paths so that the app's typecheck projects (which include this
// folder) do not pull the Bun server into a browser project. Their shapes, as used here:
const SERVER = new URL("../../../../server/src/", import.meta.url).href;
const load = <T>(rel: string): Promise<T> => import(/* @vite-ignore */ `${SERVER}${rel}`) as Promise<T>;
interface LessonProgressRow {
  startedAt: string | null;
  [k: string]: unknown;
}
interface E2eServer {
  app: { fetch(req: Request, env?: unknown): Response | Promise<Response> };
  deps: {
    repos: { lessons: { saveProgress(p: LessonProgressRow): unknown } };
    services: {
      gates: { lessonProgress(id: string): LessonProgressRow };
      streak: {
        qualify(kind: "review" | "sketch" | "keepalive", o: { day: string; minutes: number }): unknown;
        time: { day(): string };
      };
    };
  };
  close(): Promise<void>;
}
interface OakConfigLike {
  dev: boolean;
  dataDir: string;
  secretsDir: string;
  rootDir: string;
  contentDir: string;
  hostname: string;
  port: number;
}
const { createServer } = await load<{ createServer(o: Record<string, unknown>): Promise<E2eServer> }>(
  "app.ts",
);
const { loadConfig } = await load<{ loadConfig(): OakConfigLike }>("config.ts");
const { ContentIndex } = await load<{ ContentIndex: new (c: unknown) => { toolbox(): unknown } }>(
  "content/index.ts",
);
const { loadContent } = await load<{ loadContent(o: { contentDir: string }): Promise<unknown> }>(
  "content/loader.ts",
);
const { MAX_BINARY_BYTES } = await load<{ MAX_BINARY_BYTES: number }>("routes/define.ts");
const { serverGraderHosts } = await load<{ serverGraderHosts(o: { toolbox: () => unknown }): unknown }>(
  "seams.ts",
);
const { Secrets } = await load<{
  Secrets: new (dir: string, o: { env: unknown; rootDir: string }) => unknown;
}>("secrets.ts");

// This file runs under Bun only; the app's typecheck project has no Bun types, so the one global it uses is declared.
declare const Bun: {
  serve(o: {
    hostname: string;
    port: number;
    maxRequestBodySize: number;
    fetch(req: Request, srv: unknown): Response | Promise<Response>;
  }): { hostname: string; port: number; stop(): Promise<void> };
};

const config = loadConfig();
if (!config.dev) throw new Error("the session e2e server runs with OAK_DEV=1 only");
const log = (msg: string) => console.error(`[oak-e2e] ${msg}`);
const clockFile = join(config.dataDir, "clock.json");
let offset = 0;
let seen = -1;
const clock = {
  now(): Date {
    try {
      const m = statSync(clockFile).mtimeMs;
      if (m !== seen) {
        seen = m;
        offset = Number((JSON.parse(readFileSync(clockFile, "utf8")) as { offsetMs?: number }).offsetMs) || 0;
      }
    } catch {
      offset = 0;
      seen = -1;
    }
    return new Date(Date.now() + offset);
  },
};

const secrets = new Secrets(config.secretsDir, { env: process.env, rootDir: config.rootDir });
const content = await loadContent({ contentDir: config.contentDir });
const index = new ContentIndex(content);
const graders = serverGraderHosts({ toolbox: () => index.toolbox() });
const server = await createServer({ config, content, graders, secrets, log, clock });

/**
 * Test-only seeding on `/__e2e/*` (this file is never the app's server): mark lessons completed without playing
 * them (the U00 lessons another author is still writing), and qualify past streak days. Writes go through the
 * server's own repositories and services, in process.
 */
async function e2e(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; day?: string; kind?: string };
  const { repos, services } = server.deps;
  const now = clock.now().toISOString();
  if (url.pathname === "/__e2e/complete-lessons") {
    for (const id of body.ids ?? []) {
      const p = services.gates.lessonProgress(id);
      repos.lessons.saveProgress({
        ...p,
        status: "completed",
        startedAt: p.startedAt ?? now,
        completedAt: now,
        completedVersion: 1,
        contentHash: "e2e",
        updatedAt: now,
      });
    }
    return Response.json({ ok: true });
  }
  if (url.pathname === "/__e2e/qualify" && body.day) {
    const kind = body.kind === "review" || body.kind === "keepalive" ? body.kind : "sketch";
    return Response.json(services.streak.qualify(kind, { day: body.day, minutes: 15 }));
  }
  if (url.pathname === "/__e2e/now") return Response.json({ now, day: services.streak.time.day() });
  return new Response("not found", { status: 404 });
}

const bun = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  maxRequestBodySize: MAX_BINARY_BYTES + 1024 * 1024,
  fetch: (req, srv) =>
    new URL(req.url).pathname.startsWith("/__e2e/") ? e2e(req) : server.app.fetch(req, srv),
});
log(`listening on http://${bun.hostname}:${bun.port} (dev, movable clock); data in ${config.dataDir}`);
const stop = async () => {
  await bun.stop();
  await server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

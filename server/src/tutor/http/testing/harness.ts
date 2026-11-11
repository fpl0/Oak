// Shared set-up for the route tests: the tutor app over in-memory ports, driven through
// app.request() with the headers a same-origin browser tab would send. Test code only.
import { SseParser } from "../../events.ts";
import { createTutorService } from "../../service.ts";
import type { TutorLogEntry } from "../../service-types.ts";
import { type FakePorts, makePorts } from "../../testing/fakes.ts";
import type { TutorBackend } from "../../types.ts";
import { createTutorApp, type TutorAppDeps } from "../routes.ts";
import { localSecurity } from "../security.ts";

export const BASE = "http://127.0.0.1:8787";
export const HEADERS: Record<string, string> = {
  host: "127.0.0.1:8787",
  origin: BASE,
  "x-oak": "1",
  "content-type": "application/json",
};
/** Shaped like a real key, so a leak test fails for the right reason. */
export const SECRET = "sk-ant-api03-THIS-IS-THE-KEY-0123456789";

export function setup(
  backends: TutorBackend[],
  over: Partial<TutorAppDeps> = {},
  ports: FakePorts = makePorts(),
) {
  const logs: TutorLogEntry[] = [];
  const log = (e: TutorLogEntry) => logs.push(e);
  const service = createTutorService({ ports, backends, log });
  const app = createTutorApp({ service, security: localSecurity(8787), log, heartbeatMs: 0, ...over });
  const post = async (path: string, body?: unknown, headers: Record<string, string> = HEADERS) =>
    app.request(`${BASE}${path}`, {
      method: "POST",
      headers,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  const get = async (path: string, headers: Record<string, string> = HEADERS) =>
    app.request(`${BASE}${path}`, { headers });
  return { app, ports, service, logs, post, get };
}

export async function sse(res: Response) {
  const frames = new SseParser().push(await res.text());
  return { frames, events: frames.map((f) => f.event), last: frames.at(-1) };
}

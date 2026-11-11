// Test support (not a test file): a server over a temp data directory with the fixture content, a
// settable clock, fake grader hosts and the request headers a same-origin browser sends.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GradeResult, HintRung, LintContext, LintResult } from "@oak/content-kit";
import type { EvalResult, GradeRequest, GraderHost } from "@oak/grader";
import { createServer, type OakServer, type ServerOptions } from "../app.ts";
import { testConfig } from "../config.ts";
import { fixtureContent } from "../content/fixture.ts";
import type { ContentSource } from "../content/types.ts";
import type { GraderHosts } from "../deps.ts";
import type { Clock } from "../services/context.ts";

export class TestClock implements Clock {
  #now: number;
  constructor(iso = "2026-11-11T12:00:00.000Z") {
    this.#now = Date.parse(iso);
  }
  now(): Date {
    return new Date(this.#now);
  }
  set(iso: string): void {
    this.#now = Date.parse(iso);
  }
  advance(ms: number): void {
    this.#now += ms;
  }
  advanceDays(n: number): void {
    this.#now += n * 86_400_000;
  }
}

export function gradeResult(over: Partial<GradeResult> & { exerciseId: string }): GradeResult {
  const score = over.score ?? 1;
  return {
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status: score >= 0.8 ? "pass" : "fail",
    score,
    adjustedScore: score,
    dims: {},
    constraints: [],
    diagnostics: [],
    messages: [],
    assist: { rung: 0 as HintRung, tutorHints: 0, extraReplays: 0, revealed: false },
    ...over,
  };
}

/** A grader host that answers from canned results; it records what it was asked. */
export class FakeHost implements GraderHost {
  readonly backend = "bun-worker" as const;
  readonly calls: { op: string; arg: unknown }[] = [];
  analyzeResult: EvalResult | null = null;
  gradeResult: GradeResult | null = null;
  disposed = false;
  readonly stats = {
    backend: "bun-worker" as const,
    spawns: 0,
    kills: 0,
    crashes: 0,
    spawnMs: [],
    killMs: [],
  };
  async ready() {
    return { kind: "ready" as const, strudelVersion: "1.2.6", ms: 0 } as never;
  }
  async analyze(code: string, opts: unknown): Promise<EvalResult> {
    this.calls.push({ op: "analyze", arg: { code, opts } });
    if (this.analyzeResult !== null) return this.analyzeResult;
    return { ok: false, error: { kind: "eval", message: "fake host", line: 1 }, logs: [], lint: null, ms: 0 };
  }
  async grade(req: GradeRequest): Promise<GradeResult> {
    this.calls.push({ op: "grade", arg: req });
    return this.gradeResult ?? gradeResult({ exerciseId: req.ctx.exerciseGlobalId });
  }
  async compare(req: unknown): Promise<GradeResult> {
    this.calls.push({ op: "compare", arg: req });
    return this.gradeResult ?? gradeResult({ exerciseId: "compare" });
  }
  async lint(code: string, ctx: LintContext): Promise<LintResult> {
    this.calls.push({ op: "lint", arg: { code, ctx } });
    return { ok: true, diagnostics: [], used: [], locked: [], lockedTools: [] };
  }
  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

export interface Harness {
  server: OakServer;
  clock: TestClock;
  dir: string;
  learner: FakeHost;
  tutorHost: FakeHost;
  /** A same-origin browser request to the API. */
  req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  json<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: T }>;
  /** A destructive call: asks for the nonce first. */
  destructive(
    method: string,
    path: string,
    action: string,
    target: string,
    body?: unknown,
  ): Promise<Response>;
  close(): Promise<void>;
}

export const ORIGIN = "http://127.0.0.1:8787";
export const BROWSER = {
  host: "127.0.0.1:8787",
  origin: ORIGIN,
  "x-oak": "1",
  "sec-fetch-site": "same-origin",
};

export async function harness(
  opts: Partial<Omit<ServerOptions, "config" | "graders" | "clock">> & {
    content?: ContentSource;
    dev?: boolean;
    now?: string;
  } = {},
): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "oak-server-"));
  const clock = new TestClock(opts.now);
  const learner = new FakeHost();
  const tutorHost = new FakeHost();
  const graders: GraderHosts = { learner: () => learner, tutor: () => tutorHost };
  const server = await createServer({
    tutor: false,
    validateResponses: true,
    env: {},
    log: () => {},
    keyValidator: async (k) => (k.includes("bad") ? "invalid_key" : "ready"),
    ...opts,
    config: testConfig(dir, { dev: opts.dev ?? false }),
    content: opts.content ?? fixtureContent(),
    graders,
    clock,
  });
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const init: RequestInit = { method, headers: { ...BROWSER, ...headers } };
    if (body instanceof Uint8Array) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["content-type"] = "application/json";
    }
    // `self.server`, not the first server: a test may restart the server on the same data directory.
    return Promise.resolve(self.server.app.request(`http://127.0.0.1:8787${path}`, init));
  };
  const self: Harness = {
    server,
    clock,
    dir,
    learner,
    tutorHost,
    req,
    async json<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
      const res = await req(method, path, body, headers);
      const text = await res.text();
      return { status: res.status, body: (text === "" ? null : JSON.parse(text)) as T };
    },
    async destructive(method: string, path: string, action: string, target: string, body?: unknown) {
      const res = await req("POST", "/api/confirm", { action, target });
      const { nonce } = (await res.json()) as { nonce: string };
      return req(method, path, body, { "x-oak-confirm": nonce });
    },
    async close() {
      await self.server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return self;
}

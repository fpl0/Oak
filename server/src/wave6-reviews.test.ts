// Wave 6 reviews end to end (contracts §10.6, wave6.md §5.1–§5.2): the composed server over Bun.serve with the
// scripted fake tutor backend (OAK_DEV=1 OAK_TUTOR_FAKE=1) and the real grader hosts, from the Wave 6 dev seeds on
// the real course. C6, C7, CF-A and CF-T are each reviewed on the contract route for their released album version:
// the review lands on that version with two revisions (CF-A: three strengths, the strongest first), never states a
// verdict, its try-it code is in the piece's key (d2), and the facts the server hands the tutor carry the Wave 6
// analysis the brief is about (C6 a mode and its colour note, C7 applied and borrowed chords and a key lift, CF-A
// the devices and the length, CF-T its staged checks). No model is called; nothing leaves 127.0.0.1.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlbumTrackDetail, DevSeedResult, ReviewRecord } from "@oak/api";
import { createServer, type OakServer } from "./app.ts";
import { testConfig } from "./config.ts";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { createGraderHosts } from "./grader/host.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { BROWSER, TestClock } from "./testing/harness.ts";
import { tryKeyProblem } from "./tutor/lint/review.ts";
import { w5FactLines, w6FactLines } from "./tutor/review-facts.ts";
import { VERDICT } from "./tutor/reviews.ts";

setDefaultTimeout(300_000);

const NOW = "2026-11-14T12:00:00.000Z";
let real: ContentSource;
let hosts: ReturnType<typeof createGraderHosts>;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
  hosts = createGraderHosts({ toolbox: real.toolbox, spare: false });
});
afterAll(async () => {
  await hosts.dispose();
});

interface Stack {
  server: OakServer;
  close(): Promise<void>;
  api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
  turn(path: string, body: unknown): Promise<{ status: number; events: { event: string; data: unknown }[] }>;
}

async function stack(): Promise<Stack> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  await probe.stop(true);
  const dir = mkdtempSync(join(tmpdir(), "oak-w6-reviews-"));
  const server = await createServer({
    config: testConfig(dir, { port, dev: true, tutorFake: true }),
    content: real,
    graders: { learner: () => hosts.learner, tutor: () => hosts.tutor },
    clock: new TestClock(NOW),
    env: {},
    log: () => {},
    tutor: { heartbeatMs: 50, log: () => {} },
  });
  const bun = Bun.serve({ hostname: "127.0.0.1", port, fetch: (req, srv) => server.app.fetch(req, srv) });
  const headers = {
    ...BROWSER,
    host: `127.0.0.1:${port}`,
    origin: `http://127.0.0.1:${port}`,
    "content-type": "application/json",
  };
  const call = (method: string, path: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    server,
    async close() {
      await bun.stop(true);
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
    async api<T>(method: string, path: string, body?: unknown) {
      const res = await call(method, path, body);
      const text = await res.text();
      return { status: res.status, body: (text === "" ? null : JSON.parse(text)) as T };
    },
    async turn(path: string, body: unknown) {
      const res = await call("POST", path, body);
      const raw = await res.text();
      const events = [...raw.matchAll(/^event: (\w+)\ndata: (.*)$/gm)].map((m) => ({
        event: m[1] as string,
        data: JSON.parse(m[2] as string) as unknown,
      }));
      return { status: res.status, events };
    },
  };
}

const terminal = (events: { event: string }[]) =>
  events.filter((e) => e.event === "done" || e.event === "error").map((e) => e.event);
const has = (lines: string[], re: RegExp) =>
  expect({ re: re.source, found: lines.some((l) => re.test(l)) }).toEqual({ re: re.source, found: true });

interface Case {
  id: "C6" | "C7" | "CF-A" | "CF-T";
  point: string;
  strengths: 2 | 3;
  /** What the facts the server passes to the tutor must say about this piece. */
  facts(lines: string[], f: Record<string, unknown>): void;
}

const CASES: Case[] = [
  {
    id: "C6",
    point: "C6 released",
    strengths: 2,
    facts(lines) {
      // A Mixolydian vamp: the mode is named with its characteristic tone (♭7) heard on strong beats.
      has(lines, /^mode .*[Mm]ixolydian/);
      has(lines, /characteristic tone b7 .* [1-9]\d* on a strong beat/);
    },
  },
  {
    id: "C7",
    point: "C7 released",
    strengths: 2,
    facts(lines) {
      has(lines, /^applied: /);
      has(lines, /^borrowed: /);
      has(lines, /^key_plan: /);
      has(lines, /^key_change: bar \d+ · \w+ major to \w+ major/);
    },
  },
  {
    id: "CF-A",
    point: "core complete",
    strengths: 3,
    facts(lines) {
      has(lines, /^devices: [4-6] of the six core devices/);
      has(lines, /^length: \d+:\d\d \(\d+ s\)/);
      const len = lines.find((l) => l.startsWith("length: ")) as string;
      expect(Number(/\((\d+) s\)/.exec(len)?.[1])).toBeGreaterThanOrEqual(120);
    },
  },
  {
    id: "CF-T",
    point: "after U17.L02",
    strengths: 2,
    facts(lines, f) {
      // CF-T's order: the bass, then the changes, then the melody — every stage passed to release.
      const stages = (f.stages ?? []) as { check: string; passed: boolean }[];
      expect(stages.length).toBeGreaterThanOrEqual(3);
      expect(stages.every((s) => s.passed)).toBe(true);
      has(lines, /^check bass/);
    },
  },
];

describe.each(CASES)("$id: a review of the released album version on the fake backend", (k) => {
  test(`lands on v1 with two revisions, ${k.strengths} strengths, the piece's key and the Wave 6 facts`, async () => {
    const s = await stack();
    try {
      const seed = await s.api<DevSeedResult & { error?: { message: string } }>("POST", "/api/dev/seed", {
        point: k.point,
      });
      expect({ status: seed.status, error: seed.body.error?.message }).toEqual({
        status: 200,
        error: undefined,
      });
      const album = await s.api<{ tracks: { id: string; capstoneId: string | null }[] }>("GET", "/api/album");
      const trackId = album.body.tracks.find((t) => t.capstoneId === k.id)?.id as string;
      expect(trackId).toBeDefined();

      // What the server gives the tutor for this version (tutor-adapters: review-facts.ts, lessons.ts).
      const wiring = s.server.deps.tutor;
      expect(wiring).not.toBeNull();
      const source = await wiring?.lessons.review(
        { subjectKind: "capstone", subjectId: k.id },
        { kind: "album", trackId, version: 1 },
      );
      expect(source).not.toBeNull();
      expect(source?.revisions).toBe(2);
      const facts = source?.facts as unknown as Record<string, unknown>;
      expect(facts).not.toBeNull();
      const lines = [...w5FactLines(source?.facts as never), ...w6FactLines(source?.facts as never)];
      k.facts(lines, facts);
      const plan = (facts.keyPlan ?? []) as { key: string }[];
      const keys = plan.length > 0 ? [...new Set(plan.map((p) => p.key))] : [facts.key as string];
      expect(keys.every((x) => typeof x === "string" && x.length > 0)).toBe(true);

      const r = await s.turn("/api/tutor/reviews/capstone", {
        thread: { subjectKind: "capstone", subjectId: k.id },
        kind: "review-capstone",
        userText: "",
        albumTrackId: trackId,
        albumVersion: 1,
      });
      expect(r.status).toBe(200);
      expect(terminal(r.events)).toEqual(["done"]);
      const ev = r.events.find((e) => e.event === "review")?.data as {
        reviewKind: string;
        review: {
          strengths: unknown[];
          revisions: { tryCode?: string }[];
          linerNote: string;
        };
      };
      expect(ev.reviewKind).toBe("capstone");
      expect(ev.review.revisions).toHaveLength(2);
      expect(ev.review.strengths).toHaveLength(k.strengths);
      expect(VERDICT.test(JSON.stringify(ev.review))).toBe(false);
      // d2: every try-it plays in the piece's key (or one of its key plan's keys).
      for (const rev of ev.review.revisions)
        if (rev.tryCode !== undefined) expect(tryKeyProblem(rev.tryCode, keys)).toBeNull();

      const detail = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${trackId}`);
      expect(detail.body.versions.find((v) => v.version === 1)?.review).toEqual(ev.review as never);
      const records = (
        await s.api<{ items: ReviewRecord[] }>(
          "GET",
          `/api/tutor/reviews?subjectKind=capstone&subjectId=${k.id}`,
        )
      ).body.items;
      expect(records.map((x) => (x as Extract<ReviewRecord, { kind: "capstone" }>).track)).toEqual([
        { trackId, version: 1 },
      ]);
    } finally {
      await s.close();
    }
  });
});

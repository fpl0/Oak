// Wave 5 reviews end to end (contracts §10.6, wave5.md §5.2, §5.4): the composed server over Bun.serve with the
// scripted fake tutor backend (OAK_DEV=1 OAK_TUTOR_FAKE=1) and the real grader hosts, from the Wave 5 dev seeds.
// C3, C4 (one revision), C5 and X2 (two revisions, "from C5 on") are each reviewed on the CONTRACT route for their
// released album version: the review lands on that version, is listed with what it reviewed, never states a verdict,
// and the facts the server hands the tutor carry the Wave 5 analysis the brief is about (C3 sections and contrast,
// C4 a minor key, C5 the 12-bar form and swing, X2 its checks in order). No model is called; nothing leaves 127.0.0.1.
// The same real-grader stack also checks the pattern stimulus of song projects: a pickup song's stimulus keeps its
// pickup bar, and a song that declares swing is marked swung for realism R2 (contracts §6.12).
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AlbumTrackDetail,
  DevSeedResult,
  ReviewRecord,
  Transcription,
  TranscriptionDetail,
} from "@oak/api";
import { createServer, type OakServer } from "./app.ts";
import { testConfig } from "./config.ts";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { createGraderHosts } from "./grader/host.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { BROWSER, TestClock } from "./testing/harness.ts";
import { w5FactLines } from "./tutor/review-facts.ts";
import { VERDICT } from "./tutor/reviews.ts";

setDefaultTimeout(240_000);

const NOW = "2026-11-11T12:00:00.000Z";
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

async function stack(content: ContentSource = real): Promise<Stack> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  await probe.stop(true);
  const dir = mkdtempSync(join(tmpdir(), "oak-w5-reviews-"));
  const server = await createServer({
    config: testConfig(dir, { port, dev: true, tutorFake: true }),
    content,
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

interface Case {
  id: "C3" | "C4" | "C5" | "X2";
  point: string;
  revisions: 1 | 2;
  /** What the facts the server passes to the tutor must say about this piece. */
  facts(lines: string[], f: Record<string, unknown>): void;
}

const has = (lines: string[], re: RegExp) => expect(lines.some((l) => re.test(l))).toBe(true);

const CASES: Case[] = [
  {
    id: "C3",
    point: "C3 released",
    revisions: 1,
    facts(lines, f) {
      const form = f.form as { kind: string; letters: string; sections: { label: string }[] };
      expect(form.kind).toBe("sections");
      expect(form.letters).toBe("ABAB");
      expect(form.sections.map((s) => s.label)).toEqual(["verse", "chorus", "verse", "chorus"]);
      has(lines, /^contrast Verse vs Chorus: /);
      has(lines, /^energy_curve/);
      has(lines, /^groove_lock: /);
    },
  },
  {
    id: "C4",
    point: "C4 released",
    revisions: 1,
    facts(_lines, f) {
      expect(f.key).toBe("A minor");
      const form = f.form as { sections: unknown[] } | null;
      expect(form?.sections.length ?? 0).toBeGreaterThanOrEqual(2);
    },
  },
  {
    id: "C5",
    point: "C5 released",
    revisions: 2,
    facts(lines, f) {
      const blues = f.blues as { choruses: number; allDominant: boolean } | null;
      expect(blues).not.toBeNull();
      expect(blues?.choruses).toBeGreaterThanOrEqual(2);
      expect(blues?.allDominant).toBe(true);
      has(lines, /^blues: /);
      has(lines, /^swing: .*swung 8ths/);
    },
  },
  {
    id: "X2",
    point: "X2 released",
    revisions: 2,
    facts(lines, f) {
      const stages = (f.stages ?? []) as { check: string; passed: boolean }[];
      // X2's order (contracts §6.6): bass, then the changes, then the melody line by line — all passed to release.
      expect(stages[0]?.check).toBe("bass");
      expect(stages[1]?.check).toBe("changes");
      expect(stages.length).toBeGreaterThan(2);
      expect(stages.slice(2).every((s) => s.check.startsWith("melody"))).toBe(true);
      expect(stages.slice(0, 2).every((s) => s.passed)).toBe(true);
      has(lines, /^check bass: /);
    },
  },
];

describe.each(CASES)("$id: a review of the released album version on the fake backend", (k) => {
  test(`lands on v1 with ${k.revisions} revision(s), no verdict, and the Wave 5 facts`, async () => {
    const s = await stack();
    try {
      const seed = await s.api<DevSeedResult>("POST", "/api/dev/seed", { point: k.point });
      expect(seed.status).toBe(200);
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
      expect(source?.revisions).toBe(k.revisions);
      const facts = source?.facts as unknown as Record<string, unknown>;
      expect(facts).not.toBeNull();
      k.facts(w5FactLines(source?.facts as never), facts);

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
        review: { revisions: unknown[]; linerNote: string };
      };
      expect(ev.reviewKind).toBe("capstone");
      expect(ev.review.revisions).toHaveLength(k.revisions);
      expect(VERDICT.test(JSON.stringify(ev.review))).toBe(false);

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
      // Reviews never cross capstones: every other released track keeps none.
      for (const t of album.body.tracks.filter((x) => x.capstoneId !== k.id)) {
        const other = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${t.id}`);
        expect(other.body.versions.every((v) => v.review === null)).toBe(true);
      }
    } finally {
      await s.close();
    }
  });
});

describe("song projects' stimulus on the real grader", () => {
  test("X1's pickup song spans its pickup bar; the L6 blues is marked swung", async () => {
    // Songs open only once a human checked their answer key: here the pickup songs count as checked.
    const checked: ContentSource = {
      ...real,
      songs: real.songs.map((x) => (x.pickup === undefined ? x : { ...x, verifiedBy: "test fixture" })),
    };
    const s = await stack(checked);
    try {
      expect((await s.api("POST", "/api/dev/seed", { point: "X1 released" })).status).toBe(200);
      let pickups = 0;
      for (const def of checked.songs.filter((x) => x.pickup !== undefined)) {
        const created = await s.api<TranscriptionDetail>("POST", "/api/transcriptions", {
          sourceKind: "pd-song",
          audioId: null,
          songId: def.id,
          title: def.title,
          artist: null,
          ladderLevel: null,
          templateId: null,
        });
        expect({ song: def.id, status: created.status }).toEqual({ song: def.id, status: 200 });
        expect(created.body.given?.pickup).toEqual(def.pickup ?? null);
        // With a pickup the code's first cycle is the pickup bar: every bar of the tune is in the stimulus.
        expect({ song: def.id, bars: created.body.stimulus?.bars }).toEqual({
          song: def.id,
          bars: def.answerKey.bars + 1,
        });
        pickups++;
      }
      expect(pickups).toBeGreaterThan(0);
    } finally {
      await s.close();
    }
    const l6 = await stack();
    try {
      expect((await l6.api("POST", "/api/dev/seed", { point: "ladder L6" })).status).toBe(200);
      const list = await l6.api<{ items: Transcription[] }>("GET", "/api/transcriptions");
      const item = list.body.items.find((t) => t.ladderLevel === 6) as Transcription;
      const d = await l6.api<TranscriptionDetail>("GET", `/api/transcriptions/${item.id}`);
      expect(d.body.given?.swing).toEqual({ subdivision: 8, amount: 1 / 3 });
      expect(d.body.stimulus?.performance).toMatchObject({ target: "bass", swung: true });
    } finally {
      await l6.close();
    }
  });
});

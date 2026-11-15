// Wave 7 reviews end to end (contracts §10.6, wave7.md §5.4): the composed server over Bun.serve with the scripted
// fake tutor backend (OAK_DEV=1 OAK_TUTOR_FAKE=1) and the real grader hosts, from the Wave 7 dev seeds on the real
// course. Each of the eight track capstones — JC1–JC4, RC1, RC2, AC1, AC2 — is reviewed on the contract route for
// its released album version: the review lands on that version with two revisions, never states a verdict, its
// try-it code is in a key of the piece (d2), and the facts the server hands the tutor carry the Wave 7 views the
// brief is about, read on the tracks the capstone's own rubric names: JC1's ii–Vs into three keys, JC2's walk, JC3
// against rhythm changes, JC4 against its standard (the tune kept, three devices), RC1's pocket, RC2's clave,
// polyrhythm and bell, AC1's two versions of one tune (each comment says which), AC2's tensions and levels.
// The core capstones get none of these views. No model is called; nothing leaves 127.0.0.1.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlbumTrackDetail, DevSeedResult } from "@oak/api";
import { createServer, type OakServer } from "./app.ts";
import { testConfig } from "./config.ts";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { createGraderHosts } from "./grader/host.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { BROWSER, TestClock } from "./testing/harness.ts";
import type { ReviewSource } from "./tutor/domain.ts";
import { tryKeyProblem } from "./tutor/lint/review.ts";
import { w7FactLines } from "./tutor/review-facts-w7.ts";
import { namesVersion, VERDICT } from "./tutor/reviews.ts";

setDefaultTimeout(600_000);

const NOW = "2026-11-15T12:00:00.000Z";
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
  const dir = mkdtempSync(join(tmpdir(), "oak-w7-reviews-"));
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
// On a miss the lines read are printed with it: the facts the tutor would have been given.
const has = (lines: readonly string[], re: RegExp) => {
  const found = lines.some((l) => re.test(l));
  expect({ re: re.source, found, lines: found ? [] : lines }).toEqual({
    re: re.source,
    found: true,
    lines: [],
  });
};
const lacks = (lines: readonly string[], re: RegExp) =>
  expect({ re: re.source, found: lines.some((l) => re.test(l)) }).toEqual({ re: re.source, found: false });

type CapId = "JC1" | "JC2" | "JC3" | "JC4" | "RC1" | "RC2" | "AC1" | "AC2";
interface Case {
  id: CapId;
  /** What the facts the server passes to the tutor must say about this piece (`w7FactLines`). */
  facts(lines: string[], source: ReviewSource): void;
}

const CASES: Record<CapId, Case> = {
  JC1: {
    id: "JC1",
    facts(lines) {
      // Sixteen bars of ii–Vs (the brief's own passing piece: into C, F, B♭ and E♭): the keys each ii–V aims at,
      // and how the chords are voiced.
      has(lines, /^two_five: bar 1 Dm7 G7 aims at C major · resolves there$/);
      has(lines, /^keys_visited: .*C major.*E♭ major.* · [3-9] keys$/);
      has(lines, /^voicing: /);
      has(lines, /^tensions \(melody over its chord\): /);
      // A one-piano ballad has no clave and no walk: those views are not read for it.
      lacks(lines, /^clave: |^walking_bass: |^polyrhythm: /);
    },
  },
  JC2: {
    id: "JC2",
    facts(lines) {
      // The jazz blues in F: the bass the rubric's walking-bass rule names, bar by bar, and the comping figure.
      has(lines, /^walking_bass: bass · 24 bars · \d+ walk without a fault/);
      has(lines, /^comping: /);
      has(lines, /^two_five: /);
    },
  },
  JC3: {
    id: "JC3",
    facts(lines) {
      // Against rhythm changes as the rubric's contrafact rule writes them: every bar keeps them. The model head
      // (I Got Rhythm) has no answer key yet, so nothing is said about sharing its melody.
      has(
        lines,
        /^contrafact: the model's changes kept in 100% of bars · the melody repeats the model's head in 0%/,
      );
      // The seeded bass plays roots, not a walk: the review does not list it as 32 faulty bars.
      lacks(lines, /^walking_bass: /);
    },
  },
  JC4: {
    id: "JC4",
    facts(lines) {
      // Against the standard's own answer key: its tune kept note for note and three different devices.
      has(lines, /^reharm: the tune kept note for note · \d+ devices?, [3-4] different/);
      has(lines, /^reharm_device: /);
    },
  },
  RC1: {
    id: "RC1",
    facts(lines) {
      // The pocket: every part's place against the 16th grid.
      has(lines, /^feel: /);
      lacks(lines, /^two_five: |^clave: /);
    },
  },
  RC2: {
    id: "RC2",
    facts(lines) {
      // The tracks RC2's rubric names: son clave 3-2 on perc, 3 on perc2 against 2 on kick, the bell on perc3.
      has(lines, /^clave: perc · son 3-2 · held from bar 1 for (8|\d\d) bars/);
      has(lines, /^clave_alignment: keys · /);
      has(lines, /^polyrhythm: perc2 against kick · 3:2 together in /);
      has(lines, /^euclid: perc3 · \(5,16(,\d+)?\)/);
    },
  },
  AC1: {
    id: "AC1",
    facts(_lines, source) {
      // Two versions of one tune: both reviewed with their own facts, the same tune in both, and what moved.
      expect(source.versions?.map((v) => v.id)).toEqual(["a", "b"]);
      expect(source.versions?.map((v) => v.label)).toEqual(["Version one", "Version two"]);
      for (const v of source.versions ?? []) expect(v.facts).not.toBeNull();
      expect(source.versions?.[0]?.code).not.toBe(source.versions?.[1]?.code);
      expect(source.versionsCompared?.sameTune).toBe(true);
      expect(source.versionsCompared?.axes.length).toBeGreaterThan(0);
    },
  },
  AC2: {
    id: "AC2",
    facts(lines) {
      // The neo-soul ballad: extended chords voiced on the chord track, the tensions of the tune and the mix.
      has(lines, /^voicing: /);
      has(lines, /^tensions \(melody over its chord\): /);
      has(lines, /^levels \(against the loudest part\): /);
      has(lines, /^feel: /);
    },
  },
};

async function reviewOf(s: Stack, k: Case): Promise<void> {
  const album = await s.api<{ tracks: { id: string; capstoneId: string | null; side?: string }[] }>(
    "GET",
    "/api/album",
  );
  const track = album.body.tracks.find((t) => t.capstoneId === k.id);
  expect(track?.side).toBe("B");
  const trackId = track?.id as string;

  // What the server gives the tutor for this version (tutor-adapters: review-facts.ts, review-facts-w7.ts).
  const wiring = s.server.deps.tutor;
  expect(wiring).not.toBeNull();
  const source = (await wiring?.lessons.review(
    { subjectKind: "capstone", subjectId: k.id },
    { kind: "album", trackId, version: 1 },
  )) as ReviewSource;
  expect(source).not.toBeNull();
  expect(source.revisions).toBe(2);
  expect(source.facts).not.toBeNull();
  k.facts(w7FactLines(source.facts as never), source);
  const keyOf = (f: ReviewSource["facts"]) => {
    const plan = (f?.keyPlan ?? []) as { key: string }[];
    return plan.length > 0 ? plan.map((p) => p.key) : [f?.key as string];
  };
  const twoFiveKeys = (source.facts?.twoFives ?? []).map((t) => t.target);
  const keys = [
    ...new Set([
      ...keyOf(source.facts),
      ...twoFiveKeys,
      ...(source.versions ?? []).flatMap((v) => keyOf(v.facts)),
    ]),
  ].filter((x) => typeof x === "string" && x.length > 0);

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
      strengths: { text: string }[];
      revisions: { title: string; why: string; tryCode?: string }[];
      linerNote: string;
    };
  };
  // The review itself, not the deterministic liner-note fallback: it validated on the fake backend.
  expect(ev?.reviewKind).toBe("capstone");
  expect(ev.review.revisions).toHaveLength(2);
  expect(ev.review.strengths.length).toBeGreaterThanOrEqual(2);
  expect(VERDICT.test(JSON.stringify(ev.review))).toBe(false);
  // d2: every try-it plays in a key of the piece (a key a ii–V aims at counts, as JC1 visits three).
  for (const rev of ev.review.revisions)
    if (rev.tryCode !== undefined) expect(tryKeyProblem(rev.tryCode, keys)).toBeNull();
  if (k.id === "AC1") {
    // Each comment says which version it is about, and the review speaks of both.
    const texts = [
      ...ev.review.strengths.map((x) => x.text),
      ...ev.review.revisions.map((x) => `${x.title} ${x.why}`),
    ];
    for (const v of source.versions ?? []) expect(texts.some((t) => namesVersion(t, v))).toBe(true);
    for (const t of texts) expect((source.versions ?? []).some((v) => namesVersion(t, v))).toBe(true);
  }

  const detail = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${trackId}`);
  expect(detail.body.versions.find((v) => v.version === 1)?.review).toEqual(ev.review as never);
}

async function seeded(point: string): Promise<Stack> {
  const s = await stack();
  const seed = await s.api<DevSeedResult & { error?: { message: string } }>("POST", "/api/dev/seed", {
    point,
  });
  expect({ point, status: seed.status, error: seed.body.error?.message }).toEqual({
    point,
    status: 200,
    error: undefined,
  });
  return s;
}

// One seed per point; every capstone it holds released is reviewed on it.
const BY_POINT: [string, CapId[]][] = [
  ["JC1 released", ["JC1"]],
  ["J.CP2 due", ["JC2"]],
  ["JC4 open", ["JC3"]],
  ["RC2 open", ["RC1"]],
  ["AC2 open", ["AC1"]],
  ["whole course complete", ["JC4", "RC2", "AC2"]],
];

describe.each(BY_POINT)(
  "from %s: a review of each released track capstone on the fake backend",
  (point, ids) => {
    test(`${ids.join(", ")}: on v1, two revisions, the piece's keys and the Wave 7 facts its rubric names`, async () => {
      const s = await seeded(point);
      try {
        for (const id of ids) await reviewOf(s, CASES[id]);
      } finally {
        await s.close();
      }
    });
  },
);

describe("AC1 before its release: the review reads the latest draft of each version", () => {
  test("from AC1.S2 done: versions one and two from their own drafts, the same tune, what differs", async () => {
    const s = await seeded("AC1.S2 done");
    try {
      const rows = s.server.deps.repos.capstoneVersions.of("AC1");
      expect(rows.map((r) => r.versionId)).toEqual(["a", "b"]);
      const source = (await s.server.deps.tutor?.lessons.review(
        { subjectKind: "capstone", subjectId: "AC1" },
        null,
      )) as ReviewSource;
      CASES.AC1.facts([], source);
      const code = (id: "a" | "b") => {
        const row = rows.find((r) => r.versionId === id);
        return (
          s.server.deps.repos.sketches.version(row?.sketchId as string, row?.sketchVersion as number)?.code ??
          ""
        );
      };
      expect(source.versions?.map((v) => v.code)).toEqual([code("a"), code("b")]);
    } finally {
      await s.close();
    }
  });
});

describe("a core capstone's review reads none of the track capstones' views", () => {
  test("CF-A after the core: no ii–V, voicing, clave, walk or level lines", async () => {
    const s = await seeded("core complete, tracks untouched");
    try {
      const album = await s.api<{ tracks: { id: string; capstoneId: string | null }[] }>("GET", "/api/album");
      const trackId = album.body.tracks.find((t) => t.capstoneId === "CF-A")?.id as string;
      const source = await s.server.deps.tutor?.lessons.review(
        { subjectKind: "capstone", subjectId: "CF-A" },
        { kind: "album", trackId, version: 1 },
      );
      expect(source?.facts).not.toBeNull();
      expect(w7FactLines(source?.facts as never)).toEqual([]);
      expect(source?.versions).toBeUndefined();
    } finally {
      await s.close();
    }
  });
});

// Reviews end to end (contracts §10.6, wave4.md §5.2): the composed server over Bun.serve with the scripted fake
// tutor backend (OAK_DEV=1 OAK_TUTOR_FAKE=1) and the real grader hosts, from the Wave 4 dev seeds. A review asked on
// the CONTRACT route (`tutor.reviewCapstone` / `tutor.reviewTranscription`, the body the browser sends) of one album
// version lands on that version with its conversation; `tutor.reviews` lists it with what it reviewed; the album
// shows the note only when the learner includes it. No model is called; nothing leaves 127.0.0.1.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AlbumTrackDetail,
  AlbumTrackVersion,
  DevSeedResult,
  ReviewRecord,
  Transcription,
} from "@oak/api";
import { createServer, type OakServer } from "./app.ts";
import { testConfig } from "./config.ts";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { createGraderHosts } from "./grader/host.ts";
import { reviewTargetOf } from "./routes/tutor.ts";
import { C2_SONG } from "./services/dev-seed.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { BROWSER, TestClock } from "./testing/harness.ts";

setDefaultTimeout(120_000);

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
  port: number;
  server: OakServer;
  close(): Promise<void>;
  api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
  turn(path: string, body: unknown): Promise<{ status: number; events: { event: string; data: unknown }[] }>;
}

async function stack(): Promise<Stack> {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  await probe.stop(true);
  const dir = mkdtempSync(join(tmpdir(), "oak-w4-reviews-"));
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
    port,
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

describe("the review target on the contract routes", () => {
  test("each kind takes its own target, both album fields or neither; other turns take none", () => {
    expect(reviewTargetOf("review-capstone", {})).toEqual({});
    expect(reviewTargetOf("review-capstone", { albumTrackId: "t", albumVersion: 2 })).toEqual({
      albumTrackId: "t",
      albumVersion: 2,
    });
    expect(reviewTargetOf("review-capstone", { albumTrackId: "t" })).toBe(
      "albumTrackId and albumVersion go together",
    );
    expect(typeof reviewTargetOf("review-capstone", { transcriptionVersion: 1 })).toBe("string");
    expect(reviewTargetOf("review-transcription", { transcriptionVersion: 3 })).toEqual({
      transcriptionVersion: 3,
    });
    expect(typeof reviewTargetOf("review-transcription", { albumTrackId: "t", albumVersion: 1 })).toBe(
      "string",
    );
    expect(typeof reviewTargetOf("chat", { albumVersion: 1 })).toBe("string");
    expect(reviewTargetOf("chat", {})).toEqual({});
  });
});

describe("capstone reviews of one album version on the fake backend", () => {
  test("C2: a review of version 1 lands on version 1 with its conversation; the note shows only when included", async () => {
    const s = await stack();
    try {
      const seed = await s.api<DevSeedResult>("POST", "/api/dev/seed", { point: "C2 released" });
      expect(seed.status).toBe(200);
      const trackId = seed.body.trackId as string;
      const before = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${trackId}`);
      expect(before.body.versions[0]).toMatchObject({ version: 1, review: null, includeReviewNote: false });

      // A target on the wrong kind, or half a target, is refused before the tutor runs.
      const half = await s.api("POST", "/api/tutor/reviews/capstone", {
        thread: { subjectKind: "capstone", subjectId: "C2" },
        kind: "review-capstone",
        userText: "",
        albumTrackId: trackId,
      });
      expect(half.status).toBe(400);
      const wrong = await s.api("POST", "/api/tutor/reviews/capstone", {
        thread: { subjectKind: "capstone", subjectId: "C2" },
        kind: "review-capstone",
        userText: "",
        transcriptionVersion: 1,
      });
      expect(wrong.status).toBe(400);
      // A version of another capstone's track, or one that does not exist, gives no review source: an error event.
      const missing = await s.turn("/api/tutor/reviews/capstone", {
        thread: { subjectKind: "capstone", subjectId: "C2" },
        kind: "review-capstone",
        userText: "",
        albumTrackId: trackId,
        albumVersion: 9,
      });
      expect(terminal(missing.events)).toEqual(["error"]);
      expect(
        (
          await s.api<{ items: ReviewRecord[] }>(
            "GET",
            "/api/tutor/reviews?subjectKind=capstone&subjectId=C2",
          )
        ).body.items,
      ).toEqual([]);

      const r = await s.turn("/api/tutor/reviews/capstone", {
        thread: { subjectKind: "capstone", subjectId: "C2" },
        kind: "review-capstone",
        userText: "Does the ending land?",
        albumTrackId: trackId,
        albumVersion: 1,
      });
      expect(r.status).toBe(200);
      expect(terminal(r.events)).toEqual(["done"]);
      const reviewEvent = r.events.find((e) => e.event === "review")?.data as {
        reviewKind: string;
        review: { revisions: unknown[]; linerNote: string };
      };
      expect(reviewEvent.reviewKind).toBe("capstone");
      // C2 is a capstone with one revision asked (contracts §10.6).
      expect(reviewEvent.review.revisions).toHaveLength(1);
      // A review never states or implies pass or fail.
      expect(JSON.stringify(reviewEvent.review)).not.toMatch(/\b(pass(ed)?|fail(ed)?)\b/i);

      const after = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${trackId}`);
      const v1 = after.body.versions.find((v) => v.version === 1) as AlbumTrackVersion;
      expect(v1.review).toEqual(reviewEvent.review as never);
      expect(v1.includeReviewNote).toBe(false);

      const records = (
        await s.api<{ items: ReviewRecord[] }>("GET", "/api/tutor/reviews?subjectKind=capstone&subjectId=C2")
      ).body.items;
      expect(records).toHaveLength(1);
      const rec = records[0] as Extract<ReviewRecord, { kind: "capstone" }>;
      expect(rec.track).toEqual({ trackId, version: 1 });
      // The conversation the server stored is the one `album.attachReview` accepts.
      const attach = await s.api<AlbumTrackVersion>("PUT", `/api/album/tracks/${trackId}/versions/1/review`, {
        conversationId: rec.conversationId,
        review: rec.review,
        includeReviewNote: true,
      });
      expect(attach.status).toBe(200);
      expect(attach.body.includeReviewNote).toBe(true);
      // A review the conversation never accepted is refused.
      const forged = await s.api("PUT", `/api/album/tracks/${trackId}/versions/1/review`, {
        conversationId: rec.conversationId,
        review: { ...rec.review, linerNote: "Something else." },
        includeReviewNote: true,
      });
      expect(forged.status).toBeGreaterThanOrEqual(400);
      const off = await s.api<AlbumTrackVersion>("PATCH", `/api/album/tracks/${trackId}/versions/1`, {
        includeReviewNote: false,
      });
      expect(off.body.includeReviewNote).toBe(false);
      // The reviewed code is the seeded song, so the review was about that version.
      const sketch = await s.api<{ versions: { version: number; code: string }[] }>(
        "GET",
        `/api/sketches/${v1.sketchId}`,
      );
      expect(sketch.body.versions.find((v) => v.version === v1.sketchVersion)?.code).toBe(C2_SONG);

      // A revision released with the note included: the release dialog already appended it, the server adds it
      // only when it is missing — the album shows the note once.
      const note = rec.review.linerNote;
      const rel = await s.api<{ track: AlbumTrackDetail }>("POST", "/api/capstones/C2/release", {
        sessionId: null,
        sketchId: v1.sketchId,
        sketchVersion: v1.sketchVersion,
        title: "Four-Chord Song",
        flavour: null,
        linerNotesMd: `Second take, same song.\n\n${note}`,
        theoryTags: [],
        includeReviewNote: true,
      });
      expect(rel.status).toBe(200);
      expect(rel.body.track.currentVersion).toBe(2);
      const v2 = rel.body.track.versions.find((v) => v.version === 2) as AlbumTrackVersion;
      expect(v2.linerNotesMd.split(note).length - 1).toBe(1);
      expect(v2.includeReviewNote).toBe(true);
      // Without the note in the body, the server adds it once.
      const rel3 = await s.api<{ track: AlbumTrackDetail }>("POST", "/api/capstones/C2/release", {
        sessionId: null,
        sketchId: v1.sketchId,
        sketchVersion: v1.sketchVersion,
        title: "Four-Chord Song",
        flavour: null,
        linerNotesMd: "Third take.",
        theoryTags: [],
        includeReviewNote: true,
      });
      expect(rel3.status).toBe(200);
      const v3 = rel3.body.track.versions.find((v) => v.version === 3) as AlbumTrackVersion;
      expect(v3.linerNotesMd).toBe(`Third take.\n\n${note}`);
    } finally {
      await s.close();
    }
  });

  test("X1: a review of the released transcription capstone lands on its album version", async () => {
    const s = await stack();
    try {
      const seed = await s.api<DevSeedResult>("POST", "/api/dev/seed", { point: "X1 released" });
      expect(seed.status).toBe(200);
      const album = await s.api<{ tracks: { id: string; capstoneId: string | null }[] }>("GET", "/api/album");
      const x1 = album.body.tracks.find((t) => t.capstoneId === "X1");
      expect(x1).toBeDefined();
      const trackId = x1?.id as string;
      const r = await s.turn("/api/tutor/reviews/capstone", {
        thread: { subjectKind: "capstone", subjectId: "X1" },
        kind: "review-capstone",
        userText: "",
        albumTrackId: trackId,
        albumVersion: 1,
      });
      expect(terminal(r.events)).toEqual(["done"]);
      expect(r.events.filter((e) => e.event === "review")).toHaveLength(1);
      const detail = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${trackId}`);
      expect(detail.body.versions[0]?.review).not.toBeNull();
      const records = (
        await s.api<{ items: ReviewRecord[] }>("GET", "/api/tutor/reviews?subjectKind=capstone&subjectId=X1")
      ).body.items;
      expect(records.map((x) => (x as Extract<ReviewRecord, { kind: "capstone" }>).track)).toEqual([
        { trackId, version: 1 },
      ]);
      // The C2 track (released earlier in the seed) keeps no review: reviews never cross capstones.
      const c2 = album.body.tracks.find((t) => t.capstoneId === "C2");
      const c2Detail = await s.api<AlbumTrackDetail>("GET", `/api/album/tracks/${c2?.id}`);
      expect(c2Detail.body.versions.every((v) => v.review === null)).toBe(true);
    } finally {
      await s.close();
    }
  });
});

describe("a transcription review of one version on the fake backend", () => {
  test("own audio: the named version is reviewed, listed, and kept on the project", async () => {
    const s = await stack();
    try {
      expect((await s.api("POST", "/api/dev/seed", { point: "own-audio project" })).status).toBe(200);
      const own = (await s.api<{ items: Transcription[] }>("GET", "/api/transcriptions")).body.items.find(
        (t) => t.sourceKind === "own-audio",
      ) as Transcription;
      const wrong = await s.api("POST", "/api/tutor/reviews/transcription", {
        thread: { subjectKind: "transcription", subjectId: own.id },
        kind: "review-transcription",
        userText: "",
        albumTrackId: "x",
        albumVersion: 1,
      });
      expect(wrong.status).toBe(400);
      // Wave 5 (c11): the review records the version it was asked about, even when a newer one exists by then.
      const asked = own.currentVersion;
      const newer = await s.api("POST", `/api/transcriptions/${own.id}/versions`, {
        sessionId: null,
        code: 'setcpm(90/4)\n\nmelody: n("<[4 4 2 0] [1 2 4 2]>").scale("G4:major").s("piano")',
        result: null,
        ranOk: true,
      });
      expect(newer.status).toBe(200);
      const r = await s.turn("/api/tutor/reviews/transcription", {
        thread: { subjectKind: "transcription", subjectId: own.id },
        kind: "review-transcription",
        userText: "",
        transcriptionVersion: asked,
      });
      expect(terminal(r.events)).toEqual(["done"]);
      const review = r.events.find((e) => e.event === "review")?.data as { reviewKind: string };
      expect(review.reviewKind).toBe("transcription");
      const records = (
        await s.api<{ items: ReviewRecord[] }>(
          "GET",
          `/api/tutor/reviews?subjectKind=transcription&subjectId=${own.id}`,
        )
      ).body.items;
      expect(records).toHaveLength(1);
      expect((records[0] as Extract<ReviewRecord, { kind: "transcription" }>).version).toBe(asked);
    } finally {
      await s.close();
    }
  });
});

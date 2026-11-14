// Adversarial review of Wave 6 data, scheduling and security (review:robustness), over HTTP on the real course from
// the dev seeds (the long random walks to session 185 and beyond are wave6-sim.test.ts; these are the misbehaviours
// it does not try):
//  - the core's last session is retried every way a flaky network or a double click can: the release twice, the
//    session end twice; the core is complete once, its moment is announced once, and a backup taken that evening
//    restores the same completion with nothing announced again;
//  - CF-A.S4 left open (a draft saved, the session ended without the release): Today offers CF-A.S4 again, the core
//    stays "lessons-done", nothing else takes the slot;
//  - a retried recording upload (the same bytes again) is the take it already made, not a third one (d20); a new
//    recording is still a new take; a lesson completion sent twice counts once;
//  - every Wave 6 endpoint keeps contracts §11.1: no X-Oak, a foreign Host, a cross-origin write or a preflight is
//    403; a take's audio is a media GET (Sec-Fetch-Site same-origin, no X-Oak) and nothing else is.
import { beforeAll, describe, expect, test } from "bun:test";
import {
  type AlbumTrackVersion,
  type CoreCompletion,
  contract,
  type Session,
  type SessionPlan,
  type SessionSummary,
  WAVE6_ENDPOINTS,
} from "@oak/api";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { BROWSER, gradeResult, type Harness, harness } from "./testing/harness.ts";

let real: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
});

const NOW = "2026-11-14T12:00:00.000Z";
const DAY = 24 * 3_600_000;

async function seeded(point: string): Promise<Harness> {
  const h = await harness({ dev: true, content: real, now: NOW });
  await h.json("PUT", "/api/profile", { timezone: "UTC" });
  const r = await h.json<{ error?: { message: string } }>("POST", "/api/dev/seed", { point });
  if (r.status !== 200) throw new Error(`seed ${point}: ${r.status} ${JSON.stringify(r.body)}`);
  return h;
}
async function ok<T>(h: Harness, method: string, path: string, body?: unknown): Promise<T> {
  const r = await h.json<T>(method, path, body);
  if (r.status !== 200) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const nextDay = (h: Harness) => h.clock.set(new Date(h.clock.now().getTime() + DAY).toISOString());
const PHASES = {
  wrappedEarly: false,
  phaseMs: { warmup: 60_000, main: 600_000, make: 120_000, coda: 30_000 },
};

async function start(h: Harness): Promise<{ plan: SessionPlan; session: Session }> {
  const plan = await ok<SessionPlan>(h, "GET", "/api/session/today");
  const session = await ok<Session>(h, "POST", "/api/session/start", {
    kind: plan.kind,
    mapItemId: plan.mapItemId,
    targetMinutes: plan.targetMinutes,
  });
  return { plan, session };
}
const end = (h: Harness, id: string) => h.json<SessionSummary>("POST", `/api/session/${id}/end`, PHASES);

/** CF-A.S4 on the seed's saved draft: its brief check, then (when `release`) the release. */
async function cfaS4(h: Harness, sessionId: string, release: boolean) {
  const sketches = await ok<{ items: { id: string; originId: string | null; currentVersion: number }[] }>(
    h,
    "GET",
    "/api/sketches",
  );
  const sk = sketches.items.find((s) => s.originId === "CF-A");
  if (!sk) throw new Error("no CF-A draft in the seed");
  await ok(h, "POST", "/api/capstones/CF-A/drafts", {
    capstoneSessionId: "CF-A.S4",
    sessionId,
    sketchId: sk.id,
    sketchVersion: sk.currentVersion,
  });
  if (!release) return null;
  await ok(h, "POST", "/api/capstones/CF-A/checks", {
    sessionId,
    sketchId: sk.id,
    sketchVersion: sk.currentVersion,
    result: gradeResult({ exerciseId: "CF-A/brief", score: 0.95, mode: "capstone" }),
  });
  const body = {
    sessionId,
    sketchId: sk.id,
    sketchVersion: sk.currentVersion,
    title: "Album Single",
    flavour: null,
    linerNotesMd: "The single.",
    theoryTags: [],
    includeReviewNote: false,
  };
  const first = await h.json("POST", "/api/capstones/CF-A/release", body);
  const again = await h.json("POST", "/api/capstones/CF-A/release", body);
  return { first, again };
}

describe("the end of the core under retries, an open session and a restore", () => {
  test("CF-A.S4 released twice and ended twice: the core completes once and is announced once, also after a restore", async () => {
    const h = await seeded("CF-A.S3 done");
    try {
      nextDay(h);
      const { plan, session } = await start(h);
      expect([plan.kind, plan.mapItemId, plan.core]).toEqual(["capstone", "CF-A.S4", "lessons-done"]);
      const rel = await cfaS4(h, session.id, true);
      expect(rel?.first.status).toBe(200);
      // The retried release changes nothing: the track has one version.
      expect([200, 409]).toContain(rel?.again.status as number);
      const tracks = await ok<{ tracks: { capstoneId: string | null; currentVersion: number }[] }>(
        h,
        "GET",
        "/api/album",
      );
      expect(tracks.tracks.filter((t) => t.capstoneId === "CF-A").map((t) => t.currentVersion)).toEqual([1]);

      const s1 = await end(h, session.id);
      const s2 = await end(h, session.id);
      expect(s1.status).toBe(200);
      expect(s1.body.coreComplete?.stage).toBe("complete");
      // The retried end answers the stored summary: the same moment, not a second one and not a lost one.
      expect(s2.status).toBe(200);
      expect(s2.body.coreComplete).toEqual(s1.body.coreComplete);
      const done = await ok<CoreCompletion>(h, "GET", "/api/course/completion");
      expect(done.stage).toBe("complete");

      // A backup that evening, restored elsewhere: the same completion, and the next day announces nothing.
      const exp = await h.req("GET", "/api/backup/export");
      const archive = new Uint8Array(await exp.arrayBuffer());
      const fresh = await harness({ dev: true, content: real, now: h.clock.now().toISOString() });
      try {
        const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
        expect(imp.status).toBe(200);
        expect(await ok<CoreCompletion>(fresh, "GET", "/api/course/completion")).toEqual(done);
        for (const x of [h, fresh]) {
          nextDay(x);
          const day = await start(x);
          expect(day.plan.core).toBe("complete");
          expect(["review", "gym", "keepalive", "studio", "light"]).toContain(day.plan.kind);
          const s = await end(x, day.session.id);
          expect(s.status).toBe(200);
          expect(s.body.coreComplete ?? null).toBeNull();
        }
        // Both servers agree on the next day too.
        expect((await ok<CoreCompletion>(fresh, "GET", "/api/course/completion")).completedAt).toBe(
          done.completedAt,
        );
      } finally {
        await fresh.close();
      }
    } finally {
      await h.close();
    }
  }, 120_000);

  test("CF-A.S4 left open: Today offers it again, the core stays lessons-done, nothing is announced", async () => {
    const h = await seeded("CF-A.S3 done");
    try {
      nextDay(h);
      const { session } = await start(h);
      await cfaS4(h, session.id, false);
      const s = await end(h, session.id);
      expect(s.body.coreComplete ?? null).toBeNull();
      nextDay(h);
      const again = await ok<SessionPlan>(h, "GET", "/api/session/today");
      expect([again.kind, again.mapItemId, again.core]).toEqual(["capstone", "CF-A.S4", "lessons-done"]);
      expect((await ok<CoreCompletion>(h, "GET", "/api/course/completion")).stage).toBe("lessons-done");
    } finally {
      await h.close();
    }
  }, 120_000);
});

/** A short valid 16-bit mono WAV whose samples depend on `seed`. */
function wav(seed: number): Uint8Array {
  const n = 800;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(44 + 2 * i, Math.round(8000 * Math.sin((i * (seed + 1) * 2 * Math.PI) / 40)), true);
  return new Uint8Array(v.buffer);
}

describe("idempotent retries (d20, lessons)", () => {
  test("a retried take upload is the take it made; a new recording is a new take; nothing is lost", async () => {
    const h = await seeded("two takes (d20)");
    try {
      const album = await ok<{ tracks: { id: string; capstoneId: string | null }[] }>(h, "GET", "/api/album");
      const track = album.tracks.find((t) => t.capstoneId === "C3");
      if (!track) throw new Error("no C3 track");
      const path = `/api/album/tracks/${track.id}/versions/1/takes?durationS=0.1`;
      const a = await ok<AlbumTrackVersion>(h, "POST", path, wav(5));
      expect([a.takes?.length, a.currentTake]).toEqual([3, 3]);
      // The response was lost; the client sends the same bytes again.
      const retry = await ok<AlbumTrackVersion>(h, "POST", path, wav(5));
      expect([retry.takes?.length, retry.currentTake]).toEqual([3, 3]);
      // The PUT of the first recording is a retry too when its bytes are the newest take's.
      const put = await ok<AlbumTrackVersion>(
        h,
        "PUT",
        `/api/album/tracks/${track.id}/versions/1/audio?durationS=0.1`,
        wav(5),
      );
      expect([put.takes?.length, put.currentTake]).toEqual([3, 3]);
      // An older take chosen, then a NEW recording: a fourth take, current; every take still plays.
      await ok(h, "PUT", `/api/album/tracks/${track.id}/versions/1/take`, { take: 1 });
      const b = await ok<AlbumTrackVersion>(h, "POST", path, wav(6));
      expect([b.takes?.length, b.currentTake]).toEqual([4, 4]);
      for (const t of [1, 2, 3, 4]) {
        const r = await h.req("GET", `/api/album/tracks/${track.id}/versions/1/audio?take=${t}`);
        expect({ t, status: r.status }).toEqual({ t, status: 200 });
      }
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("idempotent retries: a lesson", () => {
  test("U12.L02 completed twice counts once, and Today moves on once", async () => {
    const h = await seeded("after X2 (U12.L02 next)");
    try {
      nextDay(h);
      const { plan, session } = await start(h);
      expect(plan.mapItemId).toBe("U12.L02");
      const before = await ok<{ mapDone: number }>(h, "GET", "/api/lessons/progress");
      const def = real.lessons.find((l) => l.id === "U12.L02");
      const { sketch: sk } = await ok<{ sketch: { id: string } }>(h, "POST", "/api/sketches", {
        title: "Make",
        code: 'chords: chord("<C^7 A7 Dm7 G7>").voicing()',
        bpm: 90,
        meter: "4/4",
        key: { tonic: "C", mode: "major" },
        originKind: "lesson-make",
        originId: "U12.L02",
        sessionId: session.id,
        analysis: null,
        note: null,
        tutorAssisted: false,
        band: null,
        flags: { lockedTools: [], previewTools: [] },
        ranOk: true,
      });
      const body = {
        sessionId: session.id,
        sketchId: sk.id,
        lessonVersion: def?.version,
        contentHash: `hash-${def?.version}`,
        splitPart: null,
      };
      const a = await h.json("POST", "/api/lessons/U12.L02/complete", body);
      const b = await h.json("POST", "/api/lessons/U12.L02/complete", body);
      expect([a.status, b.status]).toEqual([200, 200]);
      const after = await ok<{ mapDone: number }>(h, "GET", "/api/lessons/progress");
      expect(after.mapDone).toBe(before.mapDone + 1);
      await end(h, session.id);
      nextDay(h);
      expect((await ok<SessionPlan>(h, "GET", "/api/session/today")).mapItemId).toBe("U12.L03");
    } finally {
      await h.close();
    }
  }, 120_000);
});

describe("contracts §11.1 on every Wave 6 endpoint", () => {
  const paths = WAVE6_ENDPOINTS.map((name) => {
    const def = contract[name] as { method: string; path: string };
    return { name, method: def.method, path: `/api${def.path.replace(/:[a-z]+/gi, "x1")}` };
  });
  test("no X-Oak, a foreign Host, a cross-origin write, a cross-site fetch and a preflight are each 403", async () => {
    const h = await harness({ dev: true, content: real, now: NOW });
    try {
      for (const p of paths) {
        const body = p.method === "GET" ? undefined : "{}";
        const send = (method: string, headers: Record<string, string>) =>
          h.server.app.request(`http://127.0.0.1:8787${p.path}`, {
            method,
            headers: { "content-type": "application/json", ...headers },
            ...(body && method !== "OPTIONS" ? { body } : {}),
          });
        const cases: [string, string, Record<string, string>][] = [
          ["no X-Oak", p.method, { ...BROWSER, "x-oak": "" }],
          ["foreign Host", p.method, { ...BROWSER, host: "evil.example:8787" }],
          ["cross-site", p.method, { ...BROWSER, "sec-fetch-site": "cross-site" }],
          ["preflight", "OPTIONS", BROWSER],
        ];
        if (p.method !== "GET")
          cases.push(["cross-origin", p.method, { ...BROWSER, origin: "https://evil.example" }]);
        for (const [what, method, headers] of cases) {
          const r = await send(method, headers);
          expect({ endpoint: p.name, what, status: r.status }).toEqual({
            endpoint: p.name,
            what,
            status: 403,
          });
          for (const k of r.headers.keys()) expect(k.startsWith("access-control-")).toBe(false);
        }
      }
    } finally {
      await h.close();
    }
  });

  test("a take's audio is a media GET; the take endpoints are not", async () => {
    const h = await seeded("two takes (d20)");
    try {
      const album = await ok<{ tracks: { id: string; capstoneId: string | null }[] }>(h, "GET", "/api/album");
      const id = album.tracks.find((t) => t.capstoneId === "C3")?.id as string;
      const media = { host: "127.0.0.1:8787", "sec-fetch-site": "same-origin" };
      const get = (path: string, headers: Record<string, string>) =>
        h.server.app.request(`http://127.0.0.1:8787${path}`, { headers });
      expect((await get(`/api/album/tracks/${id}/versions/1/audio?take=1`, media)).status).toBe(200);
      expect(
        (
          await get(`/api/album/tracks/${id}/versions/1/audio?take=1`, {
            ...media,
            "sec-fetch-site": "cross-site",
          })
        ).status,
      ).toBe(403);
      // A take number the version does not have, or one that is not a number, is refused, never a file.
      expect((await h.req("GET", `/api/album/tracks/${id}/versions/1/audio?take=9`)).status).toBe(404);
      expect((await h.req("GET", `/api/album/tracks/${id}/versions/1/audio?take=..%2F1`)).status).toBe(400);
      expect((await h.json("PUT", `/api/album/tracks/${id}/versions/1/take`, { take: 9 })).status).toBe(404);
      expect((await h.json("PUT", `/api/album/tracks/${id}/versions/1/take`, { take: 1.5 })).status).toBe(
        400,
      );
      // The take endpoints are API calls: without X-Oak, even same-origin, they are refused.
      const post = await h.server.app.request(
        `http://127.0.0.1:8787/api/album/tracks/${id}/versions/1/takes`,
        {
          method: "POST",
          headers: { ...media, origin: BROWSER.origin },
          body: wav(9),
        },
      );
      expect(post.status).toBe(403);
      // Not audio: refused before anything is written.
      const junk = await h.req(
        "POST",
        `/api/album/tracks/${id}/versions/1/takes`,
        new TextEncoder().encode("<script>alert(1)</script>"),
      );
      expect(junk.status).toBe(400);
      const v = await ok<{ versions: AlbumTrackVersion[] }>(h, "GET", `/api/album/tracks/${id}`);
      expect(v.versions[0]?.takes?.length).toBe(2);
      // A lesson id that is not one: 404, and nothing from outside the content is read.
      expect((await h.req("GET", "/api/lessons/..%2F..%2Fpackage.json/sketch")).status).toBe(404);
    } finally {
      await h.close();
    }
  }, 120_000);

  test("the dev seeds exist only with OAK_DEV", async () => {
    const h = await harness({ dev: false, content: real, now: NOW });
    try {
      expect((await h.req("POST", "/api/dev/seed", { point: "core complete" })).status).toBe(404);
    } finally {
      await h.close();
    }
  });
});

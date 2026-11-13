// Regression tests of the Wave 4 adversarial review (review:robustness), one per defect found and fixed:
//  - the voicing gate never opens on code that reaches `voicing()` / `chord()` (or a method named at run time);
//  - a capstone check at hint rung 4 is a reveal whatever the client's flag says;
//  - capstone sessions complete in order only;
//  - a retried gym start in the same Oak session keeps its ordinal;
//  - the tutor gets a ladder item's hidden source only after its graded pass, never after one L3 stage;
//  - media GETs serve audio types only (a backup cannot turn them into a page or a script) and are sandboxed;
//  - a backup's own-audio file must hold the bytes its content-hash name says.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneSessions, DevSeedResult, GymSession, Transcription, VoicingGate } from "@oak/api";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { readZip, writeZip } from "./lib/zip.ts";
import { mediaType, sha256 } from "./services/audio-store.ts";
import { reachesGatedHelpers } from "./services/unlocks.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { gradeResult, type Harness, harness } from "./testing/harness.ts";

setDefaultTimeout(90_000);

let real: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
});

const NOW = "2026-11-11T12:00:00.000Z";
async function seeded(point: string): Promise<Harness> {
  const h = await harness({ dev: true, content: real, now: NOW });
  await h.json("PUT", "/api/profile", { timezone: "UTC" });
  const r = await h.json<DevSeedResult>("POST", "/api/dev/seed", { point });
  if (r.status !== 200) throw new Error(`seed ${point}: ${r.status} ${JSON.stringify(r.body)}`);
  return h;
}
async function ok<T>(h: Harness, method: string, path: string, body?: unknown): Promise<T> {
  const r = await h.json<T>(method, path, body);
  if (r.status < 200 || r.status >= 300)
    throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
function wav(bytes = 64): Uint8Array {
  const b = new Uint8Array(44 + bytes);
  const v = new DataView(b.buffer);
  b.set(new TextEncoder().encode("RIFF"), 0);
  v.setUint32(4, 36 + bytes, true);
  b.set(new TextEncoder().encode("WAVEfmt "), 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  b.set(new TextEncoder().encode("data"), 36);
  v.setUint32(40, bytes, true);
  for (let i = 0; i < bytes; i++) b[44 + i] = (i * 37) % 256;
  return b;
}

describe("the voicing gate reads the learner's own hand voicing only (contracts §3.1 rule 6)", () => {
  test("reachesGatedHelpers: voicing(), chord(), computed calls; never a comment or a mini-notation string", () => {
    expect(reachesGatedHelpers('chords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>")')).toBe(false);
    expect(reachesGatedHelpers('// voicing by hand, no chord() yet\nchords: note("<[c4,e4,g4]>")')).toBe(
      false,
    );
    expect(reachesGatedHelpers('chords: note("<[c4,e4,g4]>") /* chord("C") later */')).toBe(false);
    expect(reachesGatedHelpers('chords: n("[0,2,4]").scale("C4:major").s("piano") // "voicing("')).toBe(
      false,
    );
    expect(reachesGatedHelpers('chords: chord("<C F G C>").voicing()')).toBe(true);
    expect(reachesGatedHelpers('chords: n("0 1 2").chord("<C F G C>")')).toBe(true);
    expect(reachesGatedHelpers('chords: note("<[c4,e4,g4]>")["voicing"]()')).toBe(true);
    expect(reachesGatedHelpers('chords: n("0")["voi" + "cing"]()')).toBe(true);
    expect(reachesGatedHelpers('const k = "voicing"\nchords: note("c4")[k]()')).toBe(true);
    expect(reachesGatedHelpers("chords: note(`<[c4,e4,g4]>`).voicings()")).toBe(true);
  });

  test("a 0.95 attempt that calls voicing() through a computed name does not open the gate; a typed one does", async () => {
    const h = await seeded("U05.L07 gate open");
    try {
      const lesson = real.lessons.find((l) => l.id === "U05.L07");
      const step = lesson?.steps.find((s) => s.exercise?.id === "hand-voiced-cadence");
      if (step === undefined) throw new Error("U05.L07 has no gate step");
      const attempt = (code: string, score: number) =>
        ok(h, "POST", `/api/lessons/U05.L07/steps/${step.id}/attempts`, {
          sessionId: null,
          exerciseId: "hand-voiced-cadence",
          exerciseVersion: step.exercise?.version ?? 1,
          seriesNo: 0,
          params: null,
          response: { code },
          result: gradeResult({ exerciseId: "U05.L07/hand-voiced-cadence", score }),
          extraReplays: 0,
          activeMs: 1000,
          tutorAssisted: false,
        });
      await attempt(
        'bass: note("<c2 f2 g2 c2>")\nchords: n("0")["chord"]("<C F G C>")["voi" + "cing"]()',
        0.97,
      );
      let gate = await ok<VoicingGate>(h, "GET", "/api/gates/voicing");
      expect(gate.passed).toBe(false);
      expect(gate.passedCode).toBeNull();
      const typed =
        'bass: note("<c2 f2 g2 c2>")\nchords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>")';
      await attempt(typed, 0.94);
      gate = await ok<VoicingGate>(h, "GET", "/api/gates/voicing");
      expect(gate.passed).toBe(true);
      expect(gate.passedCode).toBe(typed);
    } finally {
      await h.close();
    }
  });
});

describe("capstones (wave4.md §5.1)", () => {
  test("a check sent at hint rung 4 is a reveal even when the client's flag says otherwise", async () => {
    const h = await seeded("X1 open");
    try {
      const ss = await ok<CapstoneSessions>(h, "GET", "/api/capstones/X1/sessions");
      const check = ss.sessions[0]?.checks[0];
      if (check === undefined) throw new Error("X1.S1 has no checks");
      const sk = await ok<{ sketch: { id: string; currentVersion: number } }>(h, "POST", "/api/sketches", {
        title: "X1",
        originKind: "capstone",
        originId: "X1",
        sessionId: null,
        code: 'mel: n("0 1 2").scale("C4:major")',
        bpm: 90,
        meter: "4/4",
        key: null,
        analysis: null,
        note: null,
        tutorAssisted: false,
        band: null,
        flags: { lockedTools: [], previewTools: [] },
        ranOk: true,
      });
      const result = gradeResult({ exerciseId: `X1/${check.checkId}`, score: 1, mode: "capstone" });
      result.assist = { ...result.assist, rung: 4, revealed: false };
      const after = await ok<CapstoneSessions>(h, "POST", `/api/capstones/X1/checks/${check.checkId}`, {
        capstoneSessionId: "X1.S1",
        stage: check.stage,
        sketchId: sk.sketch.id,
        sketchVersion: sk.sketch.currentVersion,
        result,
      });
      const row = after.sessions[0]?.checks.find((c) => c.checkId === check.checkId);
      expect(row).toMatchObject({ revealed: true, passed: false });
    } finally {
      await h.close();
    }
  });

  test("a later session cannot be completed before the one before it", async () => {
    const h = await seeded("C2 open");
    try {
      const sk = await ok<{ sketch: { id: string } }>(h, "POST", "/api/sketches", {
        title: "C2",
        originKind: "capstone",
        originId: "C2",
        sessionId: null,
        code: 's("bd sd")',
        bpm: 96,
        meter: "4/4",
        key: null,
        analysis: null,
        note: null,
        tutorAssisted: false,
        band: null,
        flags: { lockedTools: [], previewTools: [] },
        ranOk: true,
      });
      const body = (s: string) => ({
        sessionId: null,
        capstoneSessionId: s,
        sketchId: sk.sketch.id,
        flavour: null,
      });
      const early = await h.json<{ error: { message: string } }>(
        "POST",
        "/api/capstones/C2/sessions",
        body("C2.S2"),
      );
      expect(early.status).toBe(409);
      expect(early.body.error.message).toContain("C2.S2 opens after C2.S1");
      expect((await h.json("POST", "/api/capstones/C2/sessions", body("C2.S1"))).status).toBe(200);
      expect((await h.json("POST", "/api/capstones/C2/sessions", body("C2.S2"))).status).toBe(200);
    } finally {
      await h.close();
    }
  });
});

describe("a first release is of the code that passed its check (Wave 4 gate)", () => {
  test("a draft checked, then edited, is refused until it is checked again; the same code under a new version is fine", async () => {
    const h = await seeded("C2 open");
    try {
      const draft = (code: string) => ({
        sessionId: null,
        code,
        bpm: 96,
        meter: "4/4",
        key: { tonic: "C", mode: "major" },
        analysis: null,
        note: null,
        tutorAssisted: false,
        band: null,
        flags: { lockedTools: [], previewTools: [] },
        ranOk: true,
      });
      const passing = 'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")';
      const sk = await ok<{ sketch: { id: string; currentVersion: number } }>(h, "POST", "/api/sketches", {
        title: "C2",
        originKind: "capstone",
        originId: "C2",
        ...draft(passing),
      });
      const result = gradeResult({ exerciseId: "C2/brief", score: 1, mode: "capstone" });
      await ok(h, "POST", "/api/capstones/C2/checks", {
        sessionId: null,
        sketchId: sk.sketch.id,
        sketchVersion: 1,
        result: { ...result, status: "pass" },
      });
      await ok(h, "POST", "/api/capstones/C2/sessions", {
        sessionId: null,
        capstoneSessionId: "C2.S1",
        sketchId: sk.sketch.id,
        flavour: null,
      });
      const save = (code: string) =>
        ok<{ sketch: { currentVersion: number } }>(
          h,
          "POST",
          `/api/sketches/${sk.sketch.id}/versions`,
          draft(code),
        );
      const release = (v: number) =>
        h.json<{ error: { message: string } }>("POST", "/api/capstones/C2/release", {
          sessionId: null,
          sketchId: sk.sketch.id,
          sketchVersion: v,
          title: "Four chords",
          flavour: null,
          linerNotesMd: "I V vi IV.",
          theoryTags: [],
          includeReviewNote: false,
        });
      const edited = await save(passing.replace("[3,5,7]", "[1,3,5]"));
      const refused = await release(edited.sketch.currentVersion);
      expect(refused.status).toBe(409);
      expect(refused.body.error.message).toContain("the draft changed since its last check");
      const same = await save(passing);
      expect((await release(same.sketch.currentVersion)).status).toBe(200);
    } finally {
      await h.close();
    }
  });
});

describe("the gym (contracts §2.5)", () => {
  test("a gym start retried in the same Oak session keeps its ordinal", async () => {
    const h = await seeded("after U07.L03 (gym due)");
    try {
      const plan = await ok<{ kind: string; mapItemId: string; targetMinutes: number }>(
        h,
        "GET",
        "/api/session/today",
      );
      expect(plan.kind).toBe("gym");
      const ses = await ok<{ id: string }>(h, "POST", "/api/session/start", {
        kind: plan.kind,
        mapItemId: plan.mapItemId,
        targetMinutes: plan.targetMinutes,
      });
      const body = { sessionId: ses.id, kind: "ladder", transcriptionId: null };
      const a = await ok<GymSession>(h, "POST", "/api/gym/sessions", body);
      const b = await ok<GymSession>(h, "POST", "/api/gym/sessions", body);
      expect(b.gymId).toBe(a.gymId);
      const other = await h.json("POST", "/api/gym/sessions", { ...body, kind: "own-audio" });
      expect(other.status).toBe(409);
      const gym = await ok<{ history: GymSession[] }>(h, "GET", "/api/gym");
      expect(gym.history.filter((g) => g.gymId === a.gymId)).toHaveLength(1);
      expect(gym.history).toHaveLength(1);
    } finally {
      await h.close();
    }
  });
});

describe("the tutor never receives a hidden source below its rung (contracts §6.12, §10.5)", () => {
  test("an L3 item with only its bass stage passed gives the tutor no reference; the graded pass does", async () => {
    const h = await seeded("ladder L3");
    try {
      const items = (await ok<{ items: Transcription[] }>(h, "GET", "/api/transcriptions")).items;
      const item = items.find((t) => t.sourceKind === "generated" && t.ladderLevel === 3);
      if (item === undefined) throw new Error("the seed has no L3 item");
      const { ContentIndex } = await import("./content/index.ts");
      const { LessonContextAdapter } = await import("./tutor-adapters/lessons.ts");
      const adapter = new LessonContextAdapter(new ContentIndex(real), h.server.deps.repos);
      const submit = (stage: string) =>
        ok(h, "POST", `/api/ladder/items/${item.id}/submissions`, {
          sessionId: null,
          code: 'bass: n("0").scale("C2:major")',
          rung: 0,
          stage,
        });
      await submit("bass");
      const afterBass = await adapter.review({ subjectKind: "transcription", subjectId: item.id });
      expect(afterBass?.reference ?? null).toBeNull();
      await submit("quality");
      await submit("rn");
      const afterAll = await adapter.review({ subjectKind: "transcription", subjectId: item.id });
      expect(afterAll?.reference ?? null).not.toBeNull();
    } finally {
      await h.close();
    }
  });
});

describe("media and backups (contracts §11.1, §11.10)", () => {
  test("mediaType: an audio type, else the extension's, never a document or script type", () => {
    expect(mediaType("audio/wav", "/x/a.wav")).toBe("audio/wav");
    expect(mediaType("text/html", "/x/a.wav")).toBe("audio/wav");
    expect(mediaType("text/javascript; charset=utf-8", "/x/a.mp3")).toBe("audio/mpeg");
    expect(mediaType("image/svg+xml", "/x/a.bin")).toBe("application/octet-stream");
  });

  test("an imported audio row typed text/html is served as audio, sandboxed, and only same-origin", async () => {
    const h = await harness({ dev: true, content: real, now: NOW });
    try {
      const up = await h.req("POST", "/api/audio?name=take.wav", wav(), { "content-type": "audio/wav" });
      const file = (await up.json()) as { id: string };
      // What a hostile backup could write: the stored type of the row.
      h.server.deps.repos.db.run("UPDATE audio_files SET mime = 'text/html' WHERE id = ?", [file.id]);
      const res = await h.req("GET", `/api/audio/${file.id}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/wav");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const cross = await h.req("GET", `/api/audio/${file.id}`, undefined, {
        "sec-fetch-site": "cross-site",
      });
      expect(cross.status).toBe(403);
      const typed = await h.req("GET", `/api/audio/${file.id}`, undefined, { "sec-fetch-site": "none" });
      expect(typed.status).toBe(403);
    } finally {
      await h.close();
    }
  });

  test("an archive whose audio/<sha256> entry holds other bytes is refused before anything is replaced", async () => {
    const h = await harness({ dev: true, content: real, now: NOW });
    try {
      const up = await h.req("POST", "/api/audio?name=take.wav", wav(), { "content-type": "audio/wav" });
      const { id } = (await up.json()) as { id: string };
      const exp = await h.req("GET", "/api/backup/export");
      const files = readZip(new Uint8Array(await exp.arrayBuffer()), { maxEntries: 100, maxBytes: 1 << 24 });
      const manifest = JSON.parse(new TextDecoder().decode(files.get("backup.json"))) as {
        files: { path: string; bytes: number; sha256: string }[];
      };
      const other = wav(80);
      const hash = sha256(other);
      const path = `audio/${id}.wav`;
      manifest.files = manifest.files.map((f) =>
        f.path === path ? { path, bytes: other.length, sha256: hash } : f,
      );
      const forged = writeZip([
        { name: "backup.json", data: new TextEncoder().encode(JSON.stringify(manifest)) },
        { name: path, data: other },
      ]);
      const imp = await h.destructive("POST", "/api/backup/import", "backup.import", "*", forged);
      expect(imp.status).toBe(400);
      expect(((await imp.json()) as { error: { message: string } }).error.message).toContain(
        "does not hold the audio",
      );
      // Nothing was replaced: the learner's own file still plays.
      const still = await h.req("GET", `/api/audio/${id}`);
      expect(sha256(new Uint8Array(await still.arrayBuffer()))).toBe(id);
    } finally {
      await h.close();
    }
  });

  test("an own-audio checklist score outside 0–2 is refused (each change is self-reported evidence)", async () => {
    const h = await seeded("own-audio project");
    try {
      const items = (await ok<{ items: Transcription[] }>(h, "GET", "/api/transcriptions")).items;
      const own = items.find((t) => t.sourceKind === "own-audio");
      if (own === undefined) throw new Error("the seed has no own-audio project");
      for (const value of [5, -1, 2.5])
        expect(
          (await h.json("PATCH", `/api/transcriptions/${own.id}`, { checklist: { contour: value } })).status,
        ).toBe(400);
      expect(
        (await h.json("PATCH", `/api/transcriptions/${own.id}`, { checklist: { contour: 2 } })).status,
      ).toBe(200);
    } finally {
      await h.close();
    }
  });
});

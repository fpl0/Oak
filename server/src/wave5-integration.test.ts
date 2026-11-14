// Wave 5 integration seams the builders asked the server for (wave5.md §5; the build results' apiNotes): family
// levels never past the open level (the engine's `maxOpenLevel`, also after a checkpoint's level-setting items),
// seeded capstone drafts that run (starter markers stripped), what a pd-song project gives the learner (`given`) and a
// stimulus that keeps the pickup bar, the own-audio feel (`swing`), L6 melody lines (`passedLines`), the side-lesson
// offer line, album recording sizes in the backup info, and the guard's view of the Wave 5 answer widgets.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type {
  BackupInfo,
  DevSeedResult,
  LadderSong,
  SideLessons,
  Transcription,
  TranscriptionDetail,
} from "@oak/api";
import type { Exercise, FamilyDef } from "@oak/content-kit";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { capstoneDraftCode, lessonMakeCode } from "./services/dev-seed.ts";
import { openFamilyLevels } from "./services/family-levels.ts";
import { SIDE_LESSON_OFFERS } from "./services/side-lessons.ts";
import { CONTENT_DIR } from "./testing/course.ts";
import { type Harness, harness } from "./testing/harness.ts";
import { referenceAnswers } from "./tutor-adapters/lessons.ts";

setDefaultTimeout(120_000);

let real: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
});

const NOW = "2026-11-13T12:00:00.000Z";

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

describe("family levels (contracts §7.3 'Level and category gates')", () => {
  // Level 2 adds `b`, level 3 adds `c` (taught later) and `d`; level 4 adds nothing new; level 5's gate is two lessons.
  const fam = {
    id: "fam.test.levels",
    categories: [
      { id: "a", unlockAt: "U01.L01" },
      { id: "b", unlockAt: "U01.L02" },
      { id: "c", unlockAt: "U01.L05" },
      { id: "d", unlockAt: "U01.L03" },
    ],
    levels: [
      { categories: ["a"] },
      { categories: ["a", "b"] },
      { categories: ["a", "b", "c", "d"] },
      { categories: ["a", "b", "c", "d"] },
      { categories: ["a", "b", "c", "d"] },
    ],
    unlock: { lesson: "U01.L01", levelGates: { 5: ["U01.L06", "U01.L07"] } },
  } as unknown as FamilyDef;
  const upTo = (done: string[]) => openFamilyLevels(fam, (l) => done.includes(l));

  test("a level opens once one of its new categories is open; the family moves past it only when all are", () => {
    expect(upTo(["U01.L01"]).maxOpenLevel).toBe(1);
    expect(upTo(["U01.L01", "U01.L02"]).maxOpenLevel).toBe(2);
    // Level 3 plays from `d` alone, but level 4 waits for `c` (it would be "promoted past" level 3).
    expect(upTo(["U01.L01", "U01.L02", "U01.L03"]).maxOpenLevel).toBe(3);
    expect(upTo(["U01.L01", "U01.L02", "U01.L03", "U01.L05"]).maxOpenLevel).toBe(4);
  });

  test("a gate of several lessons needs every one of them (as the engine and the simulation read it)", () => {
    const base = ["U01.L01", "U01.L02", "U01.L03", "U01.L05"];
    expect(upTo([...base, "U01.L06"]).maxOpenLevel).toBe(4);
    expect(upTo([...base, "U01.L06", "U01.L07"]).maxOpenLevel).toBe(5);
    expect(upTo(base)).toMatchObject({ topLevel: 5, openCategories: ["a", "b", "c", "d"] });
  });

  test("after the U09–U11 checkpoints no family is recorded above its open level", async () => {
    const h = await seeded("C5 open");
    try {
      const repos = h.server.deps.repos;
      const done = (l: string) => repos.lessons.progress(l)?.status === "completed";
      const over: string[] = [];
      for (const row of repos.srs.families()) {
        const def = h.server.deps.content.family(row.familyId);
        if (def === null) continue;
        const open = openFamilyLevels(def, done).maxOpenLevel;
        if (row.level > open) over.push(`${row.familyId} ${row.level} > ${open}`);
      }
      expect(over).toEqual([]);
    } finally {
      await h.close();
    }
  });
});

describe("seeded drafts run as the learner would see them", () => {
  test("a starter's ⟪…⟫ and ⟦id⟧ markers never reach a seeded draft or Make", () => {
    const brief = {
      code: { starter: 'setcpm(80/4)\n\nchords: chord("<⟪Am F C G⟫>").voicing().s("piano")\nmel: n("⟦m1⟧")' },
    } as unknown as Exercise;
    expect(capstoneDraftCode(brief)).toBe(
      'setcpm(80/4)\n\nchords: chord("<Am F C G>").voicing().s("piano")\nmel: n("")',
    );
    expect(lessonMakeCode(brief)).not.toMatch(/[⟪⟫⟦⟧]/);
    for (const c of real.capstones) {
      const code = capstoneDraftCode(c.brief as Exercise | undefined);
      expect(code, c.id).not.toMatch(/[⟪⟫⟦⟧]/);
    }
  });

  test("every seeded capstone version in the album and every draft is marker-free", async () => {
    const h = await seeded("X2 released");
    try {
      const marked: string[] = [];
      for (const s of h.server.deps.repos.sketches.list())
        for (const v of h.server.deps.repos.sketches.versions(s.id))
          if (/[⟪⟫⟦⟧]/.test(v.code)) marked.push(`${s.title} v${v.version}`);
      expect(marked).toEqual([]);
    } finally {
      await h.close();
    }
  });
});

describe("transcriptions: givens, feel, L6 lines", () => {
  test("a pd-song project gives its pickup, feel and form; own audio keeps its feel in the settings", async () => {
    const h = await seeded("ladder L6");
    try {
      const list = await ok<{ items: Transcription[] }>(h, "GET", "/api/transcriptions");
      const song = list.items.find((t) => t.sourceKind === "pd-song" && t.ladderLevel === 6) as Transcription;
      expect(song).toBeDefined();
      const detail = await ok<TranscriptionDetail>(h, "GET", `/api/transcriptions/${song.id}`);
      const def = real.songs.find((s) => s.id === song.songId);
      expect(detail.given).toEqual({
        pickup: def?.pickup ?? null,
        swing: def?.swing ?? null,
        form: def?.form ?? null,
      });
      // Careless Love and Frankie and Johnny declare swing 8ths (the L6 and X2 givens say "Swing 8ths").
      expect(detail.given?.swing).toEqual({ subdivision: 8, amount: 1 / 3 });

      const songs = await ok<{ items: LadderSong[] }>(h, "GET", "/api/ladder/songs");
      for (const s of songs.items) {
        // L6 (and Wave 6's L8): the sections passed of the stage that is open are its lines.
        if (s.level === 6 || s.level === 8) expect(s.passedLines).toEqual(s.passedPhrases);
        else expect(s.passedLines).toBeUndefined();
      }
    } finally {
      await h.close();
    }
    const own = await seeded("own-audio project");
    try {
      const t = (await ok<{ items: Transcription[] }>(own, "GET", "/api/transcriptions")).items.find(
        (x) => x.sourceKind === "own-audio",
      ) as Transcription;
      const detail0 = await ok<TranscriptionDetail>(own, "GET", `/api/transcriptions/${t.id}`);
      expect(detail0.given).toBeUndefined();
      const swung = await ok<Transcription>(own, "PATCH", `/api/transcriptions/${t.id}`, {
        swing: { subdivision: 8, amount: 1 / 3 },
      });
      expect(swung.settings?.swing).toEqual({ subdivision: 8, amount: 1 / 3 });
      // The rest of the player settings are kept; `null` sets it straight.
      const straight = await ok<Transcription>(own, "PATCH", `/api/transcriptions/${t.id}`, { swing: null });
      expect(straight.settings?.swing).toBeNull();
      expect(straight.settings?.rate).toBe(swung.settings?.rate as number);
      const bad = await own.json("PATCH", `/api/transcriptions/${t.id}`, {
        swing: { subdivision: 8, amount: 2 },
      });
      expect(bad.status).toBe(400);
    } finally {
      await own.close();
    }
  });
});

describe("side lessons and the backup info", () => {
  test("every side lesson carries its offer line, the one Today's note quotes", async () => {
    const h = await seeded("side lesson offered");
    try {
      const side = await ok<SideLessons>(h, "GET", "/api/side-lessons");
      for (const item of side.items) expect(item.offer).toBe(SIDE_LESSON_OFFERS[item.lessonId] as string);
      const plan = await ok<{ sideLesson: { note: string } | null }>(h, "GET", "/api/session/today");
      expect(plan.sideLesson?.note).toEndWith(SIDE_LESSON_OFFERS["A1.L01"] as string);
    } finally {
      await h.close();
    }
  });

  test("the backup info lists each album recording's size; they add up to the total", async () => {
    const h = await seeded("C3 released");
    try {
      const info = await ok<BackupInfo>(h, "GET", "/api/backup");
      expect(info.albumAudio?.length ?? 0).toBeGreaterThan(0);
      expect((info.albumAudio ?? []).reduce((s, a) => s + a.bytes, 0)).toBe(info.albumAudioBytes as number);
      expect(info.albumAudio?.every((a) => a.version >= 1 && a.bytes > 0)).toBe(true);
    } finally {
      await h.close();
    }
  });
});

describe("the answer guard's view of the Wave 5 widgets (tutor-adapters/lessons.ts)", () => {
  test("a bar-grid of symbols is held back as the whole chart; a typed answer keeps its first spelling", () => {
    const grid = {
      kind: "identify",
      answer: { ui: "bar-grid", bars: 4, perRow: 4, entry: "symbol", qualities: ["7"] },
      correct: { text: ["C7", "F7", "C7", "G7"] },
    } as unknown as Exercise;
    expect(referenceAnswers(grid)).toEqual(["C7 F7 C7 G7"]);
    const typed = {
      kind: "identify",
      answer: { ui: "text" },
      correct: { text: ["dominant seventh", "dom7"] },
    } as unknown as Exercise;
    expect(referenceAnswers(typed)).toEqual(["dominant seventh"]);
    const form = {
      kind: "identify",
      answer: { ui: "form", sections: 4, vocabulary: "letters", input: "label" },
      correct: { sections: ["verse", "chorus", "verse", "chorus"] },
    } as unknown as Exercise;
    expect(referenceAnswers(form)).toEqual(["verse chorus verse chorus"]);
  });
});

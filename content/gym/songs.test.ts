// Ladder L5 and L6 items (content/gym/songs.ts) through the grader's song-ladder entry point (`gradeSongLadder`,
// contracts §2.9, §6.6 X2): every check of every item cut from a complete repertoire song is graded exactly right
// when answered with the song's answer key (pass, score 1, a graded pass), at the realism levels that change the
// item (R0, R2 which may move an L5 song, R4), and below 1 with a diagnostic that names it when one note of the
// check's own bars is changed. Also: which songs can be cut (complete entries only), the order the checks open,
// status (availableFrom, "Being checked"), determinism and transposition.
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { defineSong, type SongDef, type UnlockableId } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { PENDING_VERIFIER } from "../repertoire/fragment.ts";
import { songById } from "../repertoire/index.ts";
import { toolbox } from "../toolbox.ts";
import {
  buildSongLadderItem,
  checkKey,
  loadRepertoireSongs,
  nextSongCheck,
  type SongLadderCheck,
  type SongLadderPlan,
  type SongRealism,
  songLadderDone,
  songLadderGaps,
  songLadderPool,
  songLadderStatus,
  transposeSong,
} from "./songs.ts";

setDefaultTimeout(240_000);
await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set(toolbox.map((t) => t.id)) as Set<UnlockableId>,
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const grade = (plan: SongLadderPlan, check: SongLadderCheck, code: string) =>
  grader.gradeSongLadder({ item: check, song: plan.song, code, ctx });

/** The top-level items of a layer's `<…>` (one cycle each), with their offsets in the code. */
function cycles(code: string, label: string): { at: number; text: string }[] {
  const line = code.split("\n").find((l) => l.startsWith(`${label}:`)) as string;
  const lineAt = code.indexOf(line);
  const open = line.indexOf("<");
  const out: { at: number; text: string }[] = [];
  let depth = 0;
  let start = -1;
  for (let i = open + 1; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch === ">" && depth === 0) {
      if (start >= 0) out.push({ at: lineAt + start, text: line.slice(start, i) });
      break;
    }
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === " " && depth === 0) {
      if (start >= 0) out.push({ at: lineAt + start, text: line.slice(start, i) });
      start = -1;
    } else if (start < 0) start = i;
  }
  return out;
}
/** The check's lead-sheet bars. */
function barsOf(plan: SongLadderPlan, check: SongLadderCheck): [number, number] {
  const [a, b] = Array.isArray(check.phrase) ? check.phrase : [check.phrase, check.phrase];
  return [(plan.phrases[a - 1] as [number, number])[0], (plan.phrases[b - 1] as [number, number])[1]];
}
/**
 * The answer key with one note of the check's own layer changed, in the first bar of its window that has a note:
 * a degree one step up (`n` layers), or one chord swapped for another chord of the song (`note` chord layers).
 */
function oneNoteWrong(plan: SongLadderPlan, check: SongLadderCheck): string {
  const code = plan.song.answerKey.code;
  const label =
    check.level === 5 || check.stage === "melody" ? "mel" : check.stage === "changes" ? "chords" : "bass";
  const items = cycles(code, label);
  const [from, to] = barsOf(plan, check);
  const offset = plan.song.pickup ? 0 : -1;
  const chordLayer = items.some((x) => /^\[?[a-g]/.test(x.text));
  if (chordLayer) {
    // Chords are compared slot by slot (a chord held over several bars is one slot): change a bar that is a slot
    // of its own (a chord change on each side) to another chord of the song.
    for (let bar = from; bar <= to; bar++) {
      const i = bar + offset;
      const item = items[i];
      if (!item || items[i - 1]?.text === item.text || items[i + 1]?.text === item.text) continue;
      const other = items.find((x) => x.text !== item.text) as { text: string };
      return `${code.slice(0, item.at)}${other.text}${code.slice(item.at + item.text.length)}`;
    }
  }
  for (let bar = from; bar <= to; bar++) {
    const item = items[bar + offset];
    if (!item) continue;
    const num = /-?\d+/.exec(item.text);
    if (num) {
      const at = item.at + num.index;
      return `${code.slice(0, at)}${Number(num[0]) + 1}${code.slice(at + num[0].length)}`;
    }
  }
  throw new Error(`no note to change in bars ${from}–${to}`);
}

/** The measured table (printed at the end): one row per song, level and realism, over all its checks. */
const measured = new Map<string, { checks: number; okMin: number; wrongMax: number }>();
async function checkItem(plan: SongLadderPlan): Promise<void> {
  for (const c of plan.checks) {
    const ok = await grade(plan, c, plan.song.answerKey.code);
    const where = [plan.songId, plan.realism, checkKey(c)];
    const key = `| L${c.level} | ${plan.songId} | R${plan.realism}`;
    const m = measured.get(key) ?? { checks: 0, okMin: 1, wrongMax: 0 };
    expect([...where, ok.status, ok.score, grader.songLadderPassed(c, ok)]).toEqual([
      ...where,
      "pass",
      1,
      true,
    ]);
    const wrong = await grade(plan, c, oneNoteWrong(plan, c));
    measured.set(key, {
      checks: m.checks + 1,
      okMin: Math.min(m.okMin, ok.score),
      wrongMax: Math.max(m.wrongMax, wrong.score),
    });
    expect([...where, wrong.score < 1]).toEqual([...where, true]);
    expect([...where, wrong.diagnostics.some((d) => !d.id.startsWith("pass."))]).toEqual([...where, true]);
  }
}

const songs = await loadRepertoireSongs();
const REALISM: SongRealism[] = [0, 2, 4];

describe("which songs can be cut into items", () => {
  test("L5: the folk songs with answer keys (Aura Lee, Red River Valley, Shenandoah, Simple Gifts, Oh! Susanna)", () => {
    const ids: string[] = songLadderPool(songs, 5).map((s) => s.id);
    for (const id of [
      "song.aura-lee",
      "song.red-river-valley",
      "song.shenandoah",
      "song.simple-gifts",
      "song.oh-susanna",
    ])
      expect(ids).toContain(id);
    // Never Amazing Grace (U07.L09 reading only), never a reading fragment.
    expect(ids).not.toContain("song.amazing-grace");
    expect(ids).not.toContain("song.ode-to-joy");
    for (const id of ids) expect(songById.get(id)?.ladder).toBe(5);
  });
  test("L6: only songs whose strain has bass, changes and a melody cut into 4-bar lines (none are incomplete-but-served)", () => {
    for (const s of songLadderPool(songs, 6)) {
      expect(songLadderGaps(s, 6)).toEqual([]);
      expect(buildSongLadderItem(s, 6)).not.toBeNull();
    }
    for (const s of songs.filter((x) => songById.get(x.id)?.ladder === 6 && songLadderGaps(x, 6).length > 0))
      expect(buildSongLadderItem(s, 6)).toBeNull();
    // A folk song is not an L6 item, nor a blues an L5 one.
    const aura = songs.find((s) => s.id === "song.aura-lee") as SongDef;
    expect(buildSongLadderItem(aura, 6)).toBeNull();
    expect(songLadderGaps(BLUES_FIXTURE, 5)).not.toEqual([]);
  });
});

describe("L5: every phrase of every folk song is graded right with its key and wrong with one note changed", () => {
  for (const id of [
    "song.aura-lee",
    "song.red-river-valley",
    "song.shenandoah",
    "song.simple-gifts",
    "song.oh-susanna",
  ])
    test(id, async () => {
      const song = songs.find((s) => s.id === id) as SongDef;
      for (const realism of REALISM) {
        const plan = buildSongLadderItem(song, 5, { realism, seed: 3 }) as SongLadderPlan;
        expect(plan.stages).toBeNull();
        expect(plan.checks.map((c) => c.phrase)).toEqual(plan.phrases.map((_, i) => i + 1));
        expect(plan.given.key.mode).toBe("major");
        await checkItem(plan);
      }
    });
});

/**
 * A 12-bar blues strain in C, written the way the L6 answer keys are (bass, block dominant sevenths, a tune in
 * degrees, swing 8ths declared): a test fixture only, under the id of an L6 repertoire entry with no answer key yet.
 */
const BLUES_FIXTURE: SongDef = defineSong({
  id: "song.frankie-and-johnny" as SongDef["id"],
  title: "Frankie and Johnny (test fixture)",
  year: "trad",
  status: "trad",
  provenance: { source: "test fixture, never shipped", year: 1930 },
  verifiedBy: PENDING_VERIFIER,
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 96,
  swing: { subdivision: 8, amount: 1 / 3 },
  form: "12-bar verse",
  answerKey: {
    bars: 12,
    code: [
      "setcpm(96/4)",
      "",
      'mel: n("<[4 4 2 0] [2@3 ~] [4 4 5 4] [2@3 ~] [3 3 5 3] [2@3 ~] [4 4 2 0] [2@3 ~] [4 4 3 1] [3 2 1 ~] [2 1 0 -1] [0@3 ~]>").scale("C4:major").s("piano")',
      'bass: n("<0 0 0 0 3 3 0 0 4 3 0 4>").scale("C2:major").s("ebass")',
      'chords: note("<[c3,e3,g3,bb3] [c3,e3,g3,bb3] [c3,e3,g3,bb3] [c3,e3,g3,bb3] [f3,a3,c4,eb4] [f3,a3,c4,eb4] [c3,e3,g3,bb3] [c3,e3,g3,bb3] [g3,b3,d4,f4] [f3,a3,c4,eb4] [c3,e3,g3,bb3] [g3,b3,d4,f4]>").s("piano").gain(.6)',
    ].join("\n"),
    layers: {
      melody:
        'n("<[4 4 2 0] [2@3 ~] [4 4 5 4] [2@3 ~] [3 3 5 3] [2@3 ~] [4 4 2 0] [2@3 ~] [4 4 3 1] [3 2 1 ~] [2 1 0 -1] [0@3 ~]>").scale("C4:major").s("piano")',
      bass: 'n("<0 0 0 0 3 3 0 0 4 3 0 4>").scale("C2:major").s("ebass")',
      chords:
        'note("<[c3,e3,g3,bb3] [c3,e3,g3,bb3] [c3,e3,g3,bb3] [c3,e3,g3,bb3] [f3,a3,c4,eb4] [f3,a3,c4,eb4] [c3,e3,g3,bb3] [c3,e3,g3,bb3] [g3,b3,d4,f4] [f3,a3,c4,eb4] [c3,e3,g3,bb3] [g3,b3,d4,f4]>").s("piano").gain(.6)',
    },
    chords: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"].map((symbol, i) => ({
      bar: i + 1,
      beat: 1,
      symbol,
    })),
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
    ],
  },
});

describe("L6: a 12-bar strain in stages, bass then changes then the melody line by line", () => {
  test("the fixture's item: the strain, its lines, the checks in the order they open, the givens", () => {
    const plan = buildSongLadderItem(BLUES_FIXTURE, 6, { realism: 1, seed: 2 }) as SongLadderPlan;
    expect(plan.stages).toEqual(["bass", "changes", "melody"]);
    expect(plan.phrases).toEqual([
      [1, 4],
      [5, 8],
      [9, 12],
    ]);
    expect(plan.checks.map(checkKey)).toEqual([
      "lad.6.frankie-and-johnny.bass",
      "lad.6.frankie-and-johnny.changes",
      "lad.6.frankie-and-johnny.1.melody",
      "lad.6.frankie-and-johnny.2.melody",
      "lad.6.frankie-and-johnny.3.melody",
    ]);
    expect(plan.given).toMatchObject({
      bars: 12,
      form: "one 12-bar strain",
      feel: "Swing 8ths",
      transposed: 0,
      harmonicRhythm: { chordsPerBar: 1, twoChordBars: [] },
    });
    // The shuffle is the song's own feel from R0, never a realism step.
    expect(plan.performance.songSwing).toEqual({ subdivision: 8, amount: 1 / 3 });
    expect(plan.performance.target).toEqual({ bass: "bass", changes: "chords", melody: "mel" });
    // The stages open in order; the song is a graded pass once every check passed.
    const passed = new Set<string>();
    for (const c of plan.checks) {
      expect(nextSongCheck(plan, passed)).toEqual(c);
      passed.add(checkKey(c));
    }
    expect(nextSongCheck(plan, passed)).toBeNull();
    expect(songLadderDone(plan, passed)).toBe(true);
  });
  for (const realism of [0, 4] as SongRealism[])
    test(`every check graded right with the key and wrong with one note changed (R${realism})`, async () => {
      const plan = buildSongLadderItem(BLUES_FIXTURE, 6, { realism, seed: 5 }) as SongLadderPlan;
      // L6 is never moved: the shuffle and the key are the song's.
      expect(plan.given.transposed).toBe(0);
      await checkItem(plan);
      // A straight answer to a swung reference still matches (grading straightens the reference, §6.10).
      const melody = plan.checks.find((c) => c.stage === "melody") as SongLadderCheck;
      expect((await grade(plan, melody, plan.song.answerKey.code)).score).toBe(1);
    });
  test("every L6 song the repertoire completes (if any) is graded the same way", async () => {
    for (const s of songLadderPool(songs, 6))
      await checkItem(buildSongLadderItem(s, 6, { realism: 0, seed: 1 }) as SongLadderPlan);
  });
});

describe("realism, transposition, determinism and status", () => {
  test("L5 R2+ may move a song to a major key with up to three accidentals; the moved song grades like the original", async () => {
    const aura = songs.find((s) => s.id === "song.aura-lee") as SongDef;
    const moved = [0, 1, 2, 3, 4, 5].map(
      (seed) => buildSongLadderItem(aura, 5, { realism: 2, seed }) as SongLadderPlan,
    );
    const keys = new Set(moved.map((p) => p.given.key.tonic));
    expect(keys.size).toBeGreaterThan(1);
    for (const p of moved) {
      expect(["C", "G", "D", "A", "F", "Bb", "Eb"]).toContain(p.given.key.tonic);
      expect(Math.abs(p.given.transposed)).toBeLessThanOrEqual(5);
      expect(p.given.transposed).not.toBe(0);
    }
    // R0 and R1 never move it.
    expect(buildSongLadderItem(aura, 5, { realism: 1, seed: 4 })?.given.transposed).toBe(0);
    // The moved answer key is the original a fixed interval away, note for note (headless Strudel).
    const p = moved[0] as SongLadderPlan;
    const { evalHeadless } = await import("@oak/grader/testing");
    const a = await evalHeadless(aura.answerKey.code, aura.answerKey.bars);
    const b = await evalHeadless(p.song.answerKey.code, aura.answerKey.bars);
    const mel = (r: typeof a) =>
      r.events.filter((e) => e.track === "mel").map((e) => [e.begin, e.midi as number]);
    expect<unknown>(mel(b)).toEqual(mel(a).map(([t, m]) => [t, (m as number) + p.given.transposed]));
    expect(p.song.answerKey.chords?.[0]?.symbol).not.toBe(aura.answerKey.chords?.[0]?.symbol);
    expect(transposeSong(aura, 0)).toBe(aura);
  });
  test("R4 puts the tune on a vocal-like lead; the same seed builds the same item", () => {
    const red = songs.find((s) => s.id === "song.red-river-valley") as SongDef;
    const a = buildSongLadderItem(red, 5, { realism: 4, seed: 7 });
    expect(a?.performance.vocalLead).not.toBeNull();
    expect(buildSongLadderItem(red, 5, { realism: 4, seed: 7 })).toEqual(a);
    expect(buildSongLadderItem(red, 5, { realism: 0, seed: 7 })?.performance.vocalLead).toBeNull();
  });
  test("status: locked before availableFrom, 'Being checked' while unverified, open in dev when allowed", () => {
    const aura = songs.find((s) => s.id === "song.aura-lee") as SongDef;
    expect(songLadderStatus(aura, { completed: new Set() })).toEqual({
      status: "locked",
      lockedReason: "Being checked",
    });
    expect(songLadderStatus(aura, { completed: new Set(), allowUnverified: true }).status).toBe("open");
    const checked = { ...aura, verifiedBy: "A. Person (2026-11-20)" };
    expect(songLadderStatus(checked, { completed: new Set() }).status).toBe("open");
    const later = { ...checked, availableFrom: "U14.L03" as const };
    expect(songLadderStatus(later, { completed: new Set() })).toEqual({
      status: "locked",
      lockedReason: "Opens with U14.L03",
    });
    expect(songLadderStatus(later, { completed: new Set(["U14.L03"]) }).status).toBe("open");
  });
});

afterAll(() => {
  const rows = [...measured].map(
    ([k, m]) => `${k} | ${m.checks} | ${m.okMin.toFixed(3)} | ${m.wrongMax.toFixed(3)} |`,
  );
  console.log(
    [
      "| Level | Song | Realism | Checks | Key's own score (min) | One note wrong (max) |",
      "|---|---|---|---|---|---|",
      ...rows,
    ].join("\n"),
  );
});

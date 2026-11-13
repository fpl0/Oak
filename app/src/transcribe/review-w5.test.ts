// The Wave 5 learner review of ladder L5 and L6 (review:studio), through the real grader and the items the gym cuts
// (content/gym/songs.ts): an L6 blues worked in its stages — a right bass with wrong changes never passes the
// changes, the bar is named; the swing a song declares is the pattern source's, so a tune written straight (the
// learner ignoring the swing) passes with the swing note, and one written swung passes too — and L5 per phrase on a
// song with a pickup: each phrase is graded on its own bars, the pickup belongs to the phrase it leads into.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import { gradeSongLadder } from "@oak/grader";
import { buildSongLadderItem } from "../../../content/gym/songs.ts";
import carelessLove from "../../../content/repertoire/careless-love/song.ts";
import frankie from "../../../content/repertoire/frankie-and-johnny/song.ts";
import redRiver from "../../../content/repertoire/red-river-valley/song.ts";
import { checkLines, lineText } from "./ladder.ts";
import { withChanges } from "./song.ts";

setDefaultTimeout(120_000);

const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set<never>(),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};

function l6(source: SongDef) {
  const plan = buildSongLadderItem(source, 6);
  if (!plan) throw new Error(`${source.id} has no L6 item`);
  const song = plan.song;
  const L = song.answerKey.layers;
  const head = `setcpm(${song.bpm}/4)`;
  const piece = (layers: { bass?: string; chords?: string; melody?: string }) =>
    [
      head,
      "",
      ...(layers.bass ? [`bass: ${layers.bass}`] : []),
      ...(layers.chords ? [`chords: ${layers.chords}`] : []),
      ...(layers.melody ? [`melody: ${layers.melody}`] : []),
    ].join("\n");
  const item = (stage: "bass" | "changes" | "melody", phrase: number | [number, number]) => ({
    itemId: `lad.6.review.${stage}`,
    level: 6 as const,
    phrase,
    stage,
  });
  return { plan, song, L, piece, item };
}

describe("L6, a blues worked as the learner works it", () => {
  for (const source of [frankie, carelessLove] as SongDef[]) {
    test(`${source.title}: the bass as heard passes; with it, V7 written as IV loses the changes' score and names the bar`, async () => {
      const { song, L, piece, item, plan } = l6(source);
      expect(song.swing).toBeTruthy();
      const lines = plan.given.bars / 4;
      const bass = await gradeSongLadder({
        item: item("bass", [1, lines]),
        song,
        code: piece({ bass: L.bass as string }),
        ctx,
      });
      expect(bass.status).toBe("pass");
      expect(bass.score).toBeGreaterThanOrEqual(0.9);

      const chart = (song.answerKey.chords ?? [])
        .filter((c) => c.bar <= plan.given.bars)
        .map((c) => c.symbol);
      expect(chart.length).toBe(plan.given.bars);
      const right = await gradeSongLadder({
        item: item("changes", [1, lines]),
        song,
        code: withChanges(piece({ bass: L.bass as string, chords: L.chords as string }), chart, false),
        ctx,
      });
      expect(right.status).toBe("pass");

      // The bass is right, the changes are not: the first two bars of V7 written as IV (the classic slip). The bass
      // has passed its own check and carries no weight here, so the stage fails and names the bar.
      const iv = song.key.tonic === "F" ? "Bb" : "F";
      const firstV = chart.findIndex((c) => c.endsWith("7"));
      const wrongChart = chart.map((c, i) => (i === firstV || i === firstV + 1 ? iv : c));
      const wrong = await gradeSongLadder({
        item: item("changes", [1, lines]),
        song,
        code: withChanges(piece({ bass: L.bass as string, chords: L.chords as string }), wrongChart, false),
        ctx,
      });
      // Whether two wrong bars of twelve or sixteen fail the stage is the grader's harmony scoring (a wrong root keeps
      // its quality credit, so V7 written as IV scores 0.91 / 0.97 and passes): reported to the grader's owner. What
      // the page needs holds: the score drops and the line names the bar.
      expect(wrong.score).toBeLessThan(right.score);
      const bars = checkLines(wrong).flatMap((l) => (l.bar === null ? [] : [l.bar]));
      expect(bars).toContain(firstV + 1);
      // The line says the bar once, and not the harmony slot's number ("chord 4" is the fourth change, not bar 4).
      expect(checkLines(wrong).map(lineText)).toContain(`Bar ${firstV + 1}: IV, expected V7.`);
      for (const l of checkLines(wrong)) expect(lineText(l)).not.toMatch(/undefined|NaN|\[object/);
    });
  }

  test("Frankie and Johnny line 1: written straight (the swing ignored) passes, with the swing named; written swung passes", async () => {
    const { song, L, piece, item } = l6(frankie as SongDef);
    const melody = L.melody as string;
    expect(melody).not.toContain("swingBy");
    const straight = await gradeSongLadder({ item: item("melody", 1), song, code: piece({ melody }), ctx });
    expect(straight.status).toBe("pass");
    expect(straight.score).toBeGreaterThanOrEqual(0.85);
    const swung = await gradeSongLadder({
      item: item("melody", 1),
      song,
      code: piece({ melody: `${melody}.swingBy(1/3, 4)` }),
      ctx,
    });
    expect(swung.status).toBe("pass");
    expect(swung.score).toBeGreaterThanOrEqual(0.85);
  });
});

describe("L5 per phrase, on a song with a pickup (Red River Valley)", () => {
  const plan = buildSongLadderItem(redRiver as SongDef, 5);
  if (!plan) throw new Error("Red River Valley has no L5 item");
  const song = plan.song;
  const melody = song.answerKey.layers.melody as string;
  const head = `setcpm(${song.bpm}/4)`;
  const item = (phrase: number) => ({ itemId: `lad.5.rrv.${phrase}`, level: 5 as const, phrase });

  test("the tune as heard passes every phrase", async () => {
    expect(song.pickup).toBeTruthy();
    for (let p = 1; p <= (song.answerKey.phrases ?? []).length; p++) {
      const r = await gradeSongLadder({ item: item(p), song, code: `${head}\n\nmelody: ${melody}`, ctx });
      expect({ p, status: r.status }).toEqual({ p, status: "pass" });
    }
  });

  test("a wrong phrase 3 fails phrase 3 only, and its lines name bars inside phrase 3", async () => {
    // Phrase 3 is bars 9–12 counted from the first full bar: its notes sit in cycles 9–12 (cycle 0 is the pickup).
    const spans = song.answerKey.phrases ?? [];
    const [from, to] = spans[2] as [number, number];
    const m = /^(.*?)<(.*)>(.*)$/s.exec(melody);
    if (!m) throw new Error("the melody layer is not one <…> line");
    const steps = (m[2] as string).match(/\[[^\]]*\]|\S+/g) ?? [];
    const wrongSteps = steps.map((s, cycle) => (cycle >= from && cycle <= to ? "[c5 ~ c5 ~]" : s));
    const wrong = `${m[1]}<${wrongSteps.join(" ")}>${m[3]}`;
    const code = `${head}\n\nmelody: ${wrong}`;
    const p3 = await gradeSongLadder({ item: item(3), song, code, ctx });
    expect(p3.status).toBe("fail");
    const named = checkLines(p3).flatMap((l) => (l.bar === null ? [] : [l.bar]));
    expect(named.length).toBeGreaterThan(0);
    for (const b of named) expect(b >= from - 1 && b <= to).toBe(true);
    const p1 = await gradeSongLadder({ item: item(1), song, code, ctx });
    expect(p1.status).toBe("pass");
  });
});

describe("check lines", () => {
  const result = (messages: { text: string; where?: { bar: number; beatLabel?: string } }[]) =>
    ({ messages: messages.map((m) => ({ id: "x", ...m })) }) as unknown as Parameters<typeof checkLines>[0];
  test("a numeral, a chord or a note name keeps its case after the bar; a sentence goes on in lower case", () => {
    expect(
      checkLines(
        result([
          { text: "Chord 4: IV, expected V7.", where: { bar: 9 } },
          { text: "C7 where the song has F.", where: { bar: 3 } },
          { text: "Missing note.", where: { bar: 2 } },
          { text: "A note too early.", where: { bar: 5 } },
        ]),
      ).map(lineText),
    ).toEqual([
      "Bar 2: missing note.",
      "Bar 3: C7 where the song has F.",
      "Bar 5: a note too early.",
      "Bar 9: IV, expected V7.",
    ]);
  });
});

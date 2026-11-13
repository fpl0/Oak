// The whole-song answer keys (content/repertoire/<slug>/song.ts, built by folk.ts) for U07.L09, X1 and the L5
// gym, checked three ways:
//   1. against a transcription written separately here, in 1-based degrees and beats, the way a teacher sings
//      the tune ("5 1 7 1 | 2 6 2 . | …"), turned into MIDI by arithmetic on the major scale, not by Strudel;
//   2. against the notes of a second edition in its own key (letters, evaluated by Strudel): the song must be
//      that edition moved by one fixed interval, with the same onsets;
//   3. through the real grader, as X1 grades it: every phrase of the answer key passes its own check, the
//      same phrase in another key passes (key-relative), a wrong note or a phrase a step off is named, and
//      the chord stages go bass first.
// Plus the shape rules of contracts §2.8 (no dot, no tie, nothing over a bar line before U13), the harmony
// (the chart matches the chords layer; strong beats mostly chord notes) and agreement with the registry.
// None of this is the human check against the cited edition: `verified` stays false.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { PhraseCheck, SongDef } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { evalHeadless } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol } from "@oak/theory";
import { X1_CHECKS } from "../capstones.ts";
import { toolbox } from "../toolbox.ts";
import { unlockedFor } from "../validate/harness.ts";
import amazingGrace from "./amazing-grace/song.ts";
import auraLee, { phrase1Rhythm as auraRhythm } from "./aura-lee/song.ts";
import { PENDING_VERIFIER } from "./fragment.ts";
import { songById } from "./index.ts";
import ohSusanna from "./oh-susanna/song.ts";
import redRiver, { phrase1Rhythm as redRiverRhythm } from "./red-river-valley/song.ts";
import shenandoah from "./shenandoah/song.ts";
import simpleGifts from "./simple-gifts/song.ts";

setDefaultTimeout(120_000);

const songs: SongDef[] = [auraLee, redRiver, amazingGrace, shenandoah, simpleGifts, ohSusanna];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (tonic: string): number =>
  (PC[tonic[0] as string] as number) + (tonic.includes("#") ? 1 : tonic.includes("b") ? -1 : 0);
const beatsOf = (s: SongDef): number => Number(s.meter.split("/")[0]);
const cyclesOf = (s: SongDef): number => s.answerKey.bars + (s.pickup ? 1 : 0);
const rat = (x: string): number => {
  const [a, b] = x.split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
const round = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * 1. The tunes as sung: each bar (the pickup bar first) as `degree:beats`, `r` a rest; `'` is the octave
 * above home, `,` the octave below. Written from singing the tune, not copied from the code.
 */
const SUNG: Record<string, string[]> = {
  "song.aura-lee": [
    "5,:1 1:1 7,:1 1:1",
    "2:1 6,:1 2:2",
    "1:1 7,:1 6,:1 7,:1",
    "1:4",
    "5,:1 1:1 7,:1 1:1",
    "2:1 2:1 2:2",
    "1:1 7,:1 6,:1 7,:1",
    "1:4",
    "7,:1 7,:1 7,:2",
    "1:1 1:1 1:2",
    "3:1 2:1 1:1 2:1",
    "3:4",
    "3:1 3:1 4:1 3:1",
    "2:1 6,:1 2:1 1:1",
    "7,:1 7,:1 3:1 2:1",
    "1:4",
  ],
  "song.red-river-valley": [
    "r:2 5,:1 1:1",
    "3:2 3:1 3:1",
    "3:2 2:1 3:1",
    "2:1 1:2 r:1",
    "r:2 5,:1 1:1",
    "3:2 1:1 3:1",
    "5:2 4:1 3:1",
    "2:4",
    "r:2 5:1 4:1",
    "3:2 3:1 2:1",
    "1:2 2:1 3:1",
    "5:1 4:2 r:1",
    "r:2 6,:1 6,:1",
    "5,:2 7,:1 1:1",
    "2:2 3:1 2:1",
    "1:4",
    "r:4",
  ],
  "song.amazing-grace": [
    "r:2 5,:1",
    "1:2 3:0.5 1:0.5",
    "3:2 2:1",
    "1:2 6,:1",
    "5,:2 5,:1",
    "1:2 3:0.5 1:0.5",
    "3:2 2:1",
    "5:2 r:1",
  ],
  "song.shenandoah": [
    "r:3 5,:1",
    "1:0.5 1:0.5 1:1 2:0.5 3:0.5 4:1",
    "6:1 5:2 1':0.5 7:0.5",
    "6:2 5:1 6:0.5 5:0.5",
    "3:1 5:2 5:1",
    "6:0.5 6:0.5 6:1 3:0.5 5:0.5 3:1",
    "2:1 1:2 2:1",
    "3:2 1:1 3:0.5 6:0.5",
    "5:4",
    "1:0.5 2:0.5 3:2 2:1",
    "2:1 1:2 r:1",
  ],
  "song.simple-gifts": [
    "r:3 5,:0.5 5,:0.5",
    "1:1 1:0.5 2:0.5 3:0.5 1:0.5 3:0.5 4:0.5",
    "5:1 5:0.5 4:0.5 3:1 2:0.5 1:0.5",
    "2:1 2:1 2:1 1:1",
    "2:0.5 3:0.5 2:0.5 7,:0.5 5,:1 5,:1",
    "1:1 1:0.5 2:0.5 3:0.5 1:0.5 3:0.5 4:0.5",
    "5:1 5:0.5 4:0.5 3:1 2:0.5 1:0.5",
    "2:1 2:1 3:1 3:0.5 2:0.5",
    "1:1 1:0.5 2:0.5 1:2",
    "5:2 3:1 2:1",
    "3:0.5 4:0.5 3:0.5 2:0.5 1:1 1:0.5 2:0.5",
    "3:1 3:0.5 4:0.5 5:1 4:0.5 3:0.5",
    "2:1 2:0.5 3:0.5 2:1 5,:1",
    "1:0.5 7,:0.5 1:0.5 2:0.5 3:0.5 1:0.5 3:0.5 4:0.5",
    "5:1 5:0.5 4:0.5 3:1 3:0.5 2:0.5",
    "2:1 2:1 3:1 3:0.5 2:0.5",
    "1:1 1:0.5 2:0.5 1:2",
  ],
  "song.oh-susanna": [
    "r:3 1:0.5 2:0.5",
    "3:0.5 5:0.5 5:0.5 6:0.5 5:0.5 3:0.5 1:0.5 2:0.5",
    "3:0.5 3:0.5 2:0.5 1:0.5 2:1 1:0.5 2:0.5",
    "3:0.5 5:0.5 5:0.5 6:0.5 5:0.5 3:0.5 1:0.5 2:0.5",
    "3:0.5 3:0.5 2:0.5 2:0.5 1:1 1:0.5 2:0.5",
    "3:0.5 5:0.5 5:0.5 6:0.5 5:0.5 3:0.5 1:0.5 2:0.5",
    "3:0.5 3:0.5 2:0.5 1:0.5 2:1 1:0.5 2:0.5",
    "3:0.5 5:0.5 5:0.5 6:0.5 5:0.5 3:0.5 1:0.5 2:0.5",
    "3:0.5 3:0.5 2:0.5 2:0.5 1:1 r:1",
    "4:1 4:1 6:0.5 6:1 6:0.5",
    "5:0.5 5:0.5 3:0.5 1:0.5 2:1 1:0.5 2:0.5",
    "3:0.5 5:0.5 5:0.5 6:0.5 5:0.5 3:0.5 1:0.5 2:0.5",
    "3:0.5 3:0.5 2:0.5 2:0.5 1:1 r:1",
  ],
};

/**
 * 2. A second edition, in its own key, as letters in Oak's plain rhythm (the same rhythm changes as the song's
 * `setting`), one cycle a bar. Aura Lee: W. H. Hills, Students' Songs (1887), p. 43, in A-flat (the melody of a
 * modern transcription of that printing). Red River Valley: E. Fowke's printing (1961), in F, note values
 * doubled. Amazing Grace: the soprano of New Britain as typeset from Virginia Harmony (1831), in G. Shenandoah:
 * R. R. Terry, The Shanty Book I (1921), no. 9, in E-flat. Simple Gifts: a modern printing in A. Oh! Susanna:
 * a modern printing in G, Foster's 2/4 bars paired.
 */
const EDITION: Record<string, { tonic: string; letters: string }> = {
  "song.aura-lee": {
    tonic: "Ab",
    letters:
      "<[eb4 ab4 g4 ab4] [bb4 f4 bb4@2] [ab4 g4 f4 g4] ab4 [eb4 ab4 g4 ab4] [bb4 bb4 bb4@2] [ab4 g4 f4 g4] ab4 [g4 g4 g4@2] [ab4 ab4 ab4@2] [c5 bb4 ab4 bb4] c5 [c5 c5 db5 c5] [bb4 f4 bb4 ab4] [g4 g4 c5 bb4] ab4>",
  },
  "song.red-river-valley": {
    tonic: "F",
    letters:
      "<[~@2 c4 f4] [a4@2 a4 a4] [a4@2 g4 a4] [g4 f4@2 ~] [~@2 c4 f4] [a4@2 f4 a4] [c5@2 bb4 a4] g4 [~@2 c5 bb4] [a4@2 a4 g4] [f4@2 g4 a4] [c5 bb4@2 ~] [~@2 d4 d4] [c4@2 e4 f4] [g4@2 a4 g4] f4 ~>",
  },
  "song.amazing-grace": {
    tonic: "G",
    letters: "<[~ ~ d4] [g4@2 [b4 g4]] [b4@2 a4] [g4@2 e4] [d4@2 d4] [g4@2 [b4 g4]] [b4@2 a4] [d5@2 ~]>",
  },
  "song.shenandoah": {
    tonic: "Eb",
    letters:
      "<[~ ~ ~ bb3] [[eb4 eb4] eb4 [f4 g4] ab4] [c5 bb4@2 [eb5 d5]] [c5@2 bb4 [c5 bb4]] [g4 bb4@2 bb4] [[c5 c5] c5 [g4 bb4] g4] [f4 eb4@2 f4] [g4@2 eb4 [g4 c5]] bb4 [[eb4 f4] g4@2 f4] [f4 eb4@2 ~]>",
  },
  "song.simple-gifts": {
    tonic: "A",
    letters:
      "<[~ ~ ~ [e4 e4]] [a4 [a4 b4] [c#5 a4] [c#5 d5]] [e5 [e5 d5] c#5 [b4 a4]] [b4 b4 b4 a4] [[b4 c#5] [b4 g#4] e4 e4] [a4 [a4 b4] [c#5 a4] [c#5 d5]] [e5 [e5 d5] c#5 [b4 a4]] [b4 b4 c#5 [c#5 b4]] [a4 [a4 b4] a4@2] [e5@2 c#5 b4] [[c#5 d5] [c#5 b4] a4 [a4 b4]] [c#5 [c#5 d5] e5 [d5 c#5]] [b4 [b4 c#5] b4 e4] [[a4 g#4] [a4 b4] [c#5 a4] [c#5 d5]] [e5 [e5 d5] c#5 [c#5 b4]] [b4 b4 c#5 [c#5 b4]] [a4 [a4 b4] a4@2]>",
  },
  "song.oh-susanna": {
    tonic: "G",
    letters:
      "<[~ ~ ~ [g4 a4]] [[b4 d5] [d5 e5] [d5 b4] [g4 a4]] [[b4 b4] [a4 g4] a4 [g4 a4]] [[b4 d5] [d5 e5] [d5 b4] [g4 a4]] [[b4 b4] [a4 a4] g4 [g4 a4]] [[b4 d5] [d5 e5] [d5 b4] [g4 a4]] [[b4 b4] [a4 g4] a4 [g4 a4]] [[b4 d5] [d5 e5] [d5 b4] [g4 a4]] [[b4 b4] [a4 a4] g4 ~] [c5 c5 [e5 e5@2 e5]@2] [[d5 d5] [b4 g4] a4 [g4 a4]] [[b4 d5] [d5 e5] [d5 b4] [g4 a4]] [[b4 b4] [a4 a4] g4 ~]>",
  },
};

/** [onset in cycles, midi] for every sung note. */
function fromSung(s: SongDef): [number, number][] {
  const per = beatsOf(s);
  const home = 60 + pcOf(s.key.tonic);
  const out: [number, number][] = [];
  (SUNG[s.id] ?? []).forEach((bar, i) => {
    let beat = 0;
    for (const tok of bar.split(" ")) {
      const [d, len] = tok.split(":") as [string, string];
      if (d !== "r") {
        const oct = d.endsWith("'") ? 12 : d.endsWith(",") ? -12 : 0;
        const deg = Number(d.replace(/[',]/g, ""));
        out.push([i + beat / per, home + (MAJOR[deg - 1] as number) + oct]);
      }
      beat += Number(len);
    }
    expect([s.id, i, beat]).toEqual([s.id, i, per]);
  });
  return out;
}

const tempo = (s: SongDef) => `setcpm(${s.bpm}/${beatsOf(s)})`;
const melodyCode = (s: SongDef, scale?: string) =>
  `${tempo(s)}\n\nmel: ${scale ? (s.answerKey.layers.melody as string).replace(/"[A-G][b#]?4:major"/, `"${scale}"`) : s.answerKey.layers.melody}`;
const notesOf = async (code: string, cycles: number, track = "mel") =>
  (await evalHeadless(code, cycles)).events
    .filter((e) => e.track === track && e.midi !== null)
    .map((e) => ({ t: round(rat(e.begin)), end: round(rat(e.end)), midi: e.midi as number }));

describe("whole-song answer keys", () => {
  for (const s of songs)
    describe(s.id, () => {
      test("the registry entry and the song agree; still unverified, provenance 1930 or earlier", () => {
        const e = songById.get(s.id);
        expect(e).toBeDefined();
        expect({
          title: s.title,
          year: s.year,
          status: s.status,
          key: s.key,
          meter: s.meter,
          form: s.form,
        }).toEqual({
          title: e?.title,
          year: e?.year,
          status: e?.status,
          key: e?.key,
          meter: e?.meter,
          form: e?.form,
        } as never);
        expect(s.pickup).toEqual(e?.pickup as never);
        expect(s.provenance).toEqual(e?.provenance as never);
        expect(s.provenance.year).toBeLessThanOrEqual(1930);
        expect(e?.verified).toBe(false);
        expect(s.verifiedBy).toBe(PENDING_VERIFIER);
      });

      test("the melody plays the separately sung transcription", async () => {
        const got = (await notesOf(melodyCode(s), cyclesOf(s))).map((n) => [n.t, n.midi]);
        expect(got).toEqual(fromSung(s).map(([t, m]) => [round(t), m]));
      });

      test("the melody is the second edition moved by one fixed interval, onset for onset", async () => {
        const ed = EDITION[s.id];
        expect(ed).toBeDefined();
        const theirs = await notesOf(`${tempo(s)}\n\nmel: note("${ed?.letters}").s("piano")`, cyclesOf(s));
        const ours = await notesOf(melodyCode(s), cyclesOf(s));
        expect(ours.map((n) => n.t)).toEqual(theirs.map((n) => n.t));
        const shift = new Set(ours.map((n, i) => n.midi - (theirs[i]?.midi ?? Number.NaN)));
        expect(shift.size).toBe(1);
        const [d] = [...shift] as [number];
        expect((((d - (pcOf(s.key.tonic) - pcOf(ed?.tonic ?? "C"))) % 12) + 12) % 12).toBe(0);
      });

      test("plain rhythm (contracts §2.8): whole, half, quarter and eighth notes, nothing over a bar line", async () => {
        const per = beatsOf(s);
        for (const n of await notesOf(melodyCode(s), cyclesOf(s))) {
          const beats = Math.round((n.end - n.t) * per * 1000) / 1000;
          expect([n.t, [4, 2, 1, 0.5].includes(beats) && beats <= per]).toEqual([n.t, true]);
          expect([n.t, Math.floor(n.t + 1e-9) === Math.floor(n.end - 1e-9)]).toEqual([n.t, true]);
        }
      });

      test("the phrases cover the tune in order; the pickup bar holds only the lead-in", async () => {
        const p = s.answerKey.phrases ?? [];
        expect(p[0]?.[0]).toBe(1);
        expect(p.at(-1)?.[1]).toBe(s.answerKey.bars);
        for (let i = 1; i < p.length; i++) expect(p[i]?.[0]).toBe((p[i - 1]?.[1] ?? 0) + 1);
        const notes = await notesOf(melodyCode(s), cyclesOf(s));
        if (s.pickup) {
          const lead = s.pickup.units[0] / s.pickup.units[1] / beatsOf(s);
          for (const n of notes.filter((x) => x.t < 1)) expect(n.t).toBeGreaterThanOrEqual(round(1 - lead));
        } else expect(notes[0]?.t).toBe(0);
      });

      test("the chart, the chords layer and the bass agree; most strong beats are chord notes", async () => {
        const first = s.pickup ? 1 : 0;
        const r = await evalHeadless(s.answerKey.code, cyclesOf(s));
        const chart = s.answerKey.chords ?? [];
        expect(chart.length).toBe(s.answerKey.bars);
        let strong = 0;
        let fit = 0;
        for (const c of chart) {
          const chord = parseChordSymbol(c.symbol);
          expect([c.symbol, chord !== null]).toEqual([c.symbol, true]);
          const cycle = c.bar - 1 + first;
          const at = (track: string) =>
            r.events.filter((e) => e.track === track && Math.floor(rat(e.begin) + 1e-9) === cycle);
          const pcs = new Set(at("chords").map((e) => (((e.midi as number) % 12) + 12) % 12));
          const want = new Set<number>(chord ? chordPcs(chord) : []);
          expect([c.symbol, [...pcs].sort()]).toEqual([c.symbol, [...want].sort()]);
          const bassPc = (((at("bass")[0]?.midi as number) % 12) + 12) % 12;
          expect(`${c.symbol} ${bassPc}`).toBe(`${c.symbol} ${chord?.rootPc}`);
          // Strong beats: 1 and 3 in 4/4, 1 in 3/4. A note sounding there counts, attacked or held.
          const beats = beatsOf(s) === 4 ? [0, 0.5] : [0];
          for (const b of beats) {
            const t = cycle + b;
            const n = r.events.find(
              (e) => e.track === "mel" && rat(e.begin) <= t + 1e-9 && rat(e.end) > t + 1e-9,
            );
            if (!n) continue;
            strong++;
            if (want.has((((n.midi as number) % 12) + 12) % 12)) fit++;
          }
        }
        expect(fit / strong).toBeGreaterThanOrEqual(0.6);
      });
    });
});

// --- 3. X1 through the real grader -------------------------------------------------------------------

const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: unlockedFor("X1.S1" as never),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const check = (song: SongDef, c: PhraseCheck, code: string, stage?: "bass" | "quality" | "rn") =>
  grader.gradePhraseCheck({ capstoneId: "X1", check: c, song, code, ...(stage ? { stage } : {}), ctx });
const ids = (r: { diagnostics: { id: string }[] }) => r.diagnostics.map((d) => d.id);

const [s1 = [], s2 = [], s3 = []] = X1_CHECKS;
const melodyChecks = [...s1, ...s2];
const chordsCheck = s3[0] as PhraseCheck;

beforeAll(async () => {
  await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
});

describe("X1 phrase checks against each song's answer key", () => {
  test("the checks: four melody phrases at 0.85 (key-relative), then the chords bass first at 0.80", () => {
    expect(melodyChecks.map((c) => [c.id, c.phrase, c.layer, c.pass])).toEqual([
      ["phrase-1", 1, "melody", 0.85],
      ["phrase-2", 2, "melody", 0.85],
      ["phrase-3", 3, "melody", 0.85],
      ["phrase-4", 4, "melody", 0.85],
    ]);
    expect([chordsCheck.phrase, chordsCheck.layer, chordsCheck.pass, chordsCheck.stages]).toEqual([
      [1, 4],
      "chords",
      0.8,
      ["bass", "quality", "rn"],
    ]);
  });

  for (const [song, rhythm] of [
    [auraLee, auraRhythm],
    [redRiver, redRiverRhythm],
  ] as const)
    describe(song.title, () => {
      const melOf = (pattern: string, scale = `${song.key.tonic}4:major`) =>
        `${tempo(song)}\n\nmel: n("${pattern}").scale("${scale}").s("piano")`;
      const pattern = (song.answerKey.layers.melody as string).match(/n\("([^"]+)"\)/)?.[1] as string;

      test("four phrases of four bars; the melody, bass and chords layers are written", () => {
        expect(song.answerKey.phrases).toEqual([
          [1, 4],
          [5, 8],
          [9, 12],
          [13, 16],
        ]);
        for (const l of ["melody", "bass", "chords"] as const) expect(song.answerKey.layers[l]).toBeTruthy();
      });

      test("the given rhythm of phrase 1 has the onsets of phrase 1", async () => {
        const w = grader.phraseWindow(song, 1);
        const [from, to] = [w.from[0] / w.from[1], w.to[0] / w.to[1]];
        const tune = (await notesOf(melodyCode(song), cyclesOf(song))).filter((n) => n.t >= from && n.t < to);
        const hits = (await evalHeadless(rhythm, Math.ceil(to))).events
          .map((e) => round(rat(e.begin)))
          .filter((t) => t < to);
        expect(hits).toEqual(tune.map((n) => n.t));
      });

      for (const c of melodyChecks)
        test(`${c.id}: the answer key passes; in another key too; a phrase not written yet fails`, async () => {
          const right = await check(song, c, melOf(pattern));
          expect([right.status, right.score]).toEqual(["pass", 1]);
          expect((await check(song, c, melOf(pattern, "E4:major"))).status).toBe("pass");
          const empty = melOf(`<${Array.from({ length: cyclesOf(song) }, () => "~").join(" ")}>`);
          expect((await check(song, c, empty)).status).toBe("fail");
        });

      test("one wrong note in phrase 1 still passes and is named; the phrase a step off fails", async () => {
        // Aura Lee bar 2 (2 6 2) with 5 for the low 6; Red River Valley bar 2 (3 . 2 3) with 4 for 2.
        const one =
          song === auraLee
            ? pattern.replace("[1 -2 1@2]", "[1 -3 1@2]")
            : pattern.replace("[2@2 1 2]", "[2@2 3 2]");
        expect(one).not.toBe(pattern);
        const r = await check(song, melodyChecks[0] as PhraseCheck, melOf(one));
        expect(r.status).toBe("pass");
        expect(r.score).toBeLessThan(1);
        expect(ids(r)).toContain("melody.wrong-degree");
        const shifted = pattern.replace(/-?\d+/g, (d) => String(Number(d) + 1));
        const off = await check(song, melodyChecks[0] as PhraseCheck, melOf(shifted));
        expect(off.status).toBe("fail");
      });

      test("chords: the answer key passes each stage in turn; a wrong quality and a wrong numeral fail", async () => {
        const bass = `${tempo(song)}\n\nbass: ${song.answerKey.layers.bass}`;
        const both = `${bass}\nchords: ${song.answerKey.layers.chords}`;
        expect((await check(song, chordsCheck, bass, "bass")).status).toBe("pass");
        expect((await check(song, chordsCheck, both, "quality")).status).toBe("pass");
        expect((await check(song, chordsCheck, both, "rn")).status).toBe("pass");
        // The same changes by symbol, so chords can be swapped. The harmony matcher gives part credit per
        // chord (the bass and root still count), so a stage fails only when most chords are wrong: every
        // quality flipped fails the quality stage; every chord a step up fails the numerals; IV for ii in
        // the three or four ii bars is named but passes (0.88; the grader's weights, see the result notes).
        const FLIP: Record<string, string> = { C: "Cm", Dm: "D", Em: "E", F: "Fm", G: "Gm", Am: "A" };
        const UP: Record<string, string> = { C: "Dm", Dm: "Em", Em: "F", F: "G", G: "Am", Am: "Bo" };
        const symbols = (song.answerKey.chords ?? []).map((c) => c.symbol);
        const bySymbol = (swap: (x: string) => string) =>
          `${bass}\nchords: chord("<${song.pickup ? "~ " : ""}${symbols.map(swap).join(" ")}>").voicing().s("piano")`;
        expect(
          (
            await check(
              song,
              chordsCheck,
              bySymbol((x) => x),
              "rn",
            )
          ).status,
        ).toBe("pass");
        const flipped = await check(
          song,
          chordsCheck,
          bySymbol((x) => FLIP[x] ?? x),
          "quality",
        );
        expect([flipped.status, ids(flipped).includes("harmony.quality")]).toEqual(["fail", true]);
        const up = await check(
          song,
          chordsCheck,
          bySymbol((x) => UP[x] ?? x),
          "rn",
        );
        expect([up.status, ids(up).includes("harmony.rn")]).toEqual(["fail", true]);
        if (symbols.includes("Dm")) {
          const ivForIi = await check(
            song,
            chordsCheck,
            bySymbol((x) => (x === "Dm" ? "F" : x)),
            "rn",
          );
          expect(ids(ivForIi)).toContain("harmony.rn");
        }
      });
    });

  test("Red River Valley written from the bar line: the pickup left out fails phrase 1 and is named", async () => {
    const pattern = (redRiver.answerKey.layers.melody as string).match(/n\("([^"]+)"\)/)?.[1] as string;
    const mel = (p: string) => `${tempo(redRiver)}\n\nmel: n("${p}").scale("C4:major").s("piano")`;
    // Bar 1 written in the first cycle, no pickup bar: every note a bar early. The grader names the shift
    // (rhythm.displaced); rhythm.pickup-missing is kept for a reference shifted so that the pickup lands on
    // the downbeat (contracts §6.11 rule 5).
    const early = await check(
      redRiver,
      melodyChecks[0] as PhraseCheck,
      mel(pattern.replace("<[~@2 -3 0] ", "<")),
    );
    expect([early.status, ids(early).includes("rhythm.displaced")]).toEqual(["fail", true]);
    // A bar of rest in front: the tune a bar late.
    const late = await check(redRiver, melodyChecks[0] as PhraseCheck, mel(pattern.replace("<", "<~ ")));
    expect([late.status, ids(late).includes("rhythm.displaced")]).toEqual(["fail", true]);
  });
});

// The gallery's examples are music too: every claim in them is checked here with headless Strudel and @oak/theory,
// and every state they draw is a valid attempt response.
import { describe, expect, test } from "bun:test";
import { AttemptResponseSchema } from "@oak/api";
import { evalHeadless } from "@oak/grader/testing";
import {
  chordPcs,
  identifyChord,
  intervalBetween,
  labelPitch,
  noteToMidi,
  parseChordSymbol,
  parseRN,
  rnToChord,
  signatureOf,
  toLeadSheet,
} from "@oak/theory";
import { fillStarter } from "../code-tokens.ts";
import { NEUTRAL_PROFILE } from "../env.tsx";
import { responseOf } from "../response.ts";
import { fitNotes } from "../sing.ts";
import { engrave, staffContext, staffNotes } from "../staff/model.ts";
import type { AnswerSpec, AnswerValue } from "../types.ts";
import { FIXTURE_IDS } from "./fixture-ids.ts";
import {
  CLICK_CODE,
  CLICK_CODE_SNARE,
  demoCheck,
  FIXTURES,
  type Fixture,
  MELODY_CODE,
  SING_PATTERN,
  STAFF_C_MAJOR,
  STAFF_G_MAJOR,
  STATES,
  stateOf,
  TAP_RHYTHM,
} from "./fixtures.ts";

const byId = (id: string): Fixture => {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const C_MAJOR = { tonic: "C", mode: "major" } as const;
/** The value, or a thrown error naming what was missing (tests only). */
function must<T>(x: T | null | undefined, what = "value"): T {
  if (x === null || x === undefined) throw new Error(`missing ${what}`);
  return x;
}

const onsetsOf = async (code: string, s: string, bars = 1) =>
  (await evalHeadless(code, bars)).events.filter((e) => e.s === s).map((e) => e.onset);
const midisOfCode = async (code: string, bars = 1) =>
  (await evalHeadless(code, bars)).events.map((e) => e.midi);

describe("gallery fixtures", () => {
  test("the plain ID list the specs read matches the fixtures", () => {
    expect(FIXTURE_IDS.map(([id, kind]) => `${id}:${kind}`)).toEqual(
      FIXTURES.map((f) => `${f.id}:${f.kind}`),
    );
  });

  test("every state of every fixture is a valid attempt response", () => {
    for (const f of FIXTURES)
      for (const s of STATES) {
        const { value } = stateOf(f, s);
        if (value === null && (f.kind === "click-roll" || f.kind === "click-staff")) continue;
        const ok = AttemptResponseSchema.safeParse(
          responseOf(f.spec as AnswerSpec, value as AnswerValue),
        ).success;
        expect(`${f.id}/${s}: ${ok}`).toBe(`${f.id}/${s}: true`);
      }
  });

  test("the expected answer checks correct and the sample does not", () => {
    for (const f of FIXTURES) {
      if (f.kind === "hum" || f.kind === "click-roll" || f.id === "sing-quiet") continue;
      expect(`${f.id}: ${demoCheck(f, f.expected).state}`).toBe(`${f.id}: correct`);
      expect(`${f.id}: ${demoCheck(f, f.sample).state}`).toBe(`${f.id}: wrong`);
    }
  });
});

describe("the music in the fixtures", () => {
  test("IV in C major is F; A C E is minor; C G Am F is I V vi IV", () => {
    expect(toLeadSheet(rnToChord(must(parseRN("IV", C_MAJOR)), C_MAJOR))).toBe(
      must((byId("choice").expected as string[])[0]),
    );
    expect(identifyChord([57, 60, 64])[0]?.quality).toBe("min");
    const named = (byId("rn-palette").expected as string[]).map((rn) =>
      toLeadSheet(rnToChord(must(parseRN(rn, C_MAJOR)), C_MAJOR)),
    );
    expect(named).toEqual(["C", "G", "Am", "F"]);
  });

  test("a whole step below F is E♭; C to G is a perfect fifth; C is ♭3 of A minor", () => {
    expect(must(noteToMidi("F4")) - must(noteToMidi("Eb4"))).toBe(2);
    expect(must(noteToMidi("F4")) - must(noteToMidi("E4"))).toBe(1);
    expect(intervalBetween("C4", "G4")).toBe("P5");
    expect(must(noteToMidi("C5")) - must(noteToMidi("A4"))).toBe(3);
  });

  test("Mary Had a Little Lamb starts 3 2 1 2 (E D C D in C)", () => {
    const degrees = byId("degree-seq").expected as string[];
    expect(degrees.map((d) => must([0, 2, 4, 5, 7][Number(d) - 1]) + 60)).toEqual([64, 62, 60, 62]);
  });

  test("piano answers: middle C is 60; F major from F4 is F4 A4 C5", () => {
    expect(byId("keyboard").expected as number[]).toEqual([must(noteToMidi("C4"))]);
    const fMajor = must(parseChordSymbol("F"));
    expect((byId("keyboard-chord").expected as number[]).map((m) => m % 12).sort()).toEqual(
      [...chordPcs(fMajor)].sort(),
    );
    expect(byId("keyboard-chord").expected).toEqual([65, 69, 72]);
  });

  test("eighths in 3/4, the tresillo, the drum grid and the backbeat loops", async () => {
    expect(byId("number").expected).toBe(3 * 2);
    const tresillo = must((byId("grid").expected as boolean[][])[0]);
    expect(tresillo.flatMap((on, i) => (on ? [i] : []))).toEqual([0, 3, 6]);
    const [a, b, c] = (byId("choice-multi").spec as Extract<AnswerSpec, { ui: "choice" }>).options;
    expect(await onsetsOf(must(a?.audio), "sd")).toEqual([0.25, 0.75]);
    expect(await onsetsOf(must(b?.audio), "sd")).toEqual([]);
    expect(await onsetsOf(must(c?.audio), "sd")).toEqual([0.25, 0.75]);
    const code = byId("code").expected as string;
    expect(await onsetsOf(code, "sd")).toEqual([0.25, 0.75]);
    expect(await onsetsOf(byId("code").sample as string, "sd")).toEqual([0, 0.5]);
  });

  test("the tap rhythm is 1, 2, 3, 3-and, 4 and the expected taps sit on it", () => {
    expect([...TAP_RHYTHM].map((b) => b * 4 + 1)).toEqual([1, 2, 3, 3.5, 4]);
    const taps = byId("tap").expected as number[];
    expect(taps.map((t) => Math.round((((t - 100) * 90) / 60 / 4) * 1000) / 1000)).toEqual([...TAP_RHYTHM]);
  });

  test("the sung A folds into the neutral comfort range as A3", () => {
    const { notes } = fitNotes([{ midi: 69, at: 0, dur: 1.6 }], NEUTRAL_PROFILE);
    expect(notes[0]?.midi).toBe(57);
  });

  test("click targets: the first sd is the snare on beat 2; degree 3 of the melody is its second note; the top note is G4", async () => {
    expect(CLICK_CODE.slice(CLICK_CODE_SNARE.from, CLICK_CODE_SNARE.to)).toBe("sd");
    const r = await evalHeadless(CLICK_CODE, 1);
    const first = r.events.find((e) => e.s === "sd");
    expect(first?.onset).toBe(0.25);
    expect(first?.locations.some((l) => l.start === CLICK_CODE_SNARE.from)).toBe(true);
    expect(await midisOfCode(MELODY_CODE)).toEqual([60, 64, 67, 64]);
  });

  test("the ordering's chords, the blanks' arpeggio, and A/B differ", async () => {
    const blocks = (byId("order").spec as Extract<AnswerSpec, { ui: "order" }>).blocks;
    const names = [];
    for (const b of blocks) {
      const midis = (await midisOfCode(must(b.audition))) as number[];
      const best = identifyChord(midis)[0];
      names.push(best ? toLeadSheet(best) : "");
    }
    expect(names).toEqual(["C", "G", "Am", "F"]);
    const blanks = byId("blanks");
    const filled = fillStarter(
      (blanks.spec as Extract<AnswerSpec, { ui: "blanks" }>).starter,
      blanks.expected as Record<string, string>,
    );
    expect(await midisOfCode(filled)).toEqual([60, 64, 67, 72]);
    const sd = byId("same-different").spec as Extract<AnswerSpec, { ui: "same-different" }>;
    expect(await midisOfCode(sd.a)).toEqual([60, 64, 67]);
    expect(await midisOfCode(sd.b)).toEqual([60, 64, 69]);
  });
});

describe("the Wave 3 fixtures' music", () => {
  const notesOf = (f: Fixture, v: string) => {
    const r = engrave(v, staffContext(f.spec as Extract<AnswerSpec, { ui: "staff-input" }>));
    if (!r.ok) throw new Error(r.error);
    return staffNotes(r.score);
  };
  test("C up to E♭ is a minor 3rd (E would be major); three flats is E♭ major, four A♭", () => {
    expect(intervalBetween("C4", "Eb4")).toBe(byId("text-interval-quality").expected as string);
    expect(intervalBetween("C4", "E4")).toBe(byId("text-interval-quality").sample as string);
    expect(signatureOf({ tonic: "Eb", mode: "major" }).flats).toHaveLength(3);
    expect(signatureOf({ tonic: "Ab", mode: "major" }).flats).toHaveLength(4);
  });
  test("U02.L04's answer engraves as C4 E4 G4 C5; the sample's second note is F4", () => {
    expect(notesOf(byId("staff-input"), STAFF_C_MAJOR).map((n) => n.pitches[0]?.name)).toEqual([
      "C4",
      "E4",
      "G4",
      "C5",
    ]);
    expect(notesOf(byId("staff-input"), byId("staff-input").sample as string)[1]?.pitches[0]?.name).toBe(
      "F4",
    );
  });
  test("G major 1 2 3 1 | 5 1 is G A B G | D G, quarters then halves", () => {
    const g = { tonic: "G", mode: "major" } as const;
    const notes = notesOf(byId("staff-key"), STAFF_G_MAJOR);
    expect(notes.map((n) => labelPitch(n.pitches[0]?.midi as number, g).degree)).toEqual([
      "1",
      "2",
      "3",
      "1",
      "5",
      "1",
    ]);
    expect(notes.map((n) => n.written.base)).toEqual([4, 4, 4, 4, 2, 2]);
  });
  test("bass C3 E3 G3 C4 and the grand-staff D3 A3 F♯4 D5 are major triads (1 3 5 1, 1 5 3 1)", () => {
    const c = notesOf(byId("staff-bass"), byId("staff-bass").expected as string).map(
      (n) => n.pitches[0]?.midi as number,
    );
    expect(identifyChord(c)[0]?.root).toBe("C");
    expect(identifyChord(c)[0]?.quality).toBe("maj");
    const d = { tonic: "D", mode: "major" } as const;
    const grand = notesOf(byId("staff-grand"), byId("staff-grand").expected as string);
    expect(grand.map((n) => labelPitch(n.pitches[0]?.midi as number, d).degree)).toEqual([
      "1",
      "5",
      "3",
      "1",
    ]);
    expect(grand.map((n) => n.staff)).toEqual(["LH", "LH", "RH", "RH"]);
  });
  test("key signatures: D major F♯ C♯; E♭ major B♭ E♭ A♭", () => {
    expect(signatureOf({ tonic: "D", mode: "major" }).sharps.join(" ")).toBe(
      byId("keysig").expected as string,
    );
    expect(signatureOf({ tonic: "Eb", mode: "major" }).flats.join(" ")).toBe(
      byId("keysig-bass").expected as string,
    );
  });
  test("1 3 5 in A from A3 is A3 C♯4 E4, inside the neutral comfort range; the sample sings F♯4 (6) for 5", () => {
    expect(SING_PATTERN.map((n) => n.midi)).toEqual([57, 61, 64]);
    expect(fitNotes(SING_PATTERN, NEUTRAL_PROFILE).shift).toBe(0);
    const a = { tonic: "A", mode: "major" } as const;
    expect(labelPitch(66, a).degree).toBe("6");
    expect(intervalBetween("E4", "F#4")).toBe("M2");
  });
});

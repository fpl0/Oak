// Musical truth of U08–U11, A1, U09.CP–U11.CP and C3–C5, listened to with instruments: every example, starter,
// reference solution, stimulus, audio card and passing test is played headlessly and checked the way a player
// would hear it. Bass lines sit in a bass's register; a tune never sits a minor 2nd or 9th above its own chords
// for a beat or more unless that rub is the lesson's point (listed with its reason); a swung line never plays
// against straight off-beat eighths in the same code; every sung target fits in one comfortable span; and the
// spiritual of U10.L09 is the repertoire's answer key note for note. Written in the Wave 5 content integration.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { type Exercise, flattenExercise } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { exerciseCode } from "../../scripts/content/generate.ts";
import { capstones } from "../capstones.ts";
import { loadCheckpointFiles, loadLessons } from "../lib/load.bun.ts";
import goDownMoses from "../repertoire/go-down-moses/song.ts";

setDefaultTimeout(600_000);

const W5 = /^(U08|U09|U10|U11|A1)\./;
const W5_CP = /^U(09|10|11)\.CP$/;
const W5_CAPSTONES = /^(C3|C4|C5)$/;

interface Code {
  /** "U10.L08 S4/up-melodic-down-natural solution:0" */
  where: string;
  code: string;
  bars: number;
  /** A starter is wrong on purpose (the learner fixes it); everything else is music Oak plays as right. */
  starter: boolean;
}

/** Every piece of code an exercise plays as right, its starters marked: failing tests are left out. */
function codesOf(owner: string, e: Exercise, step: string): Code[] {
  const out: Code[] = [];
  for (const x of flattenExercise(e)) {
    const failing = new Set(x.tests.filter((t) => t.expect === "fail").map((t) => `test:${t.name}`));
    const at = `${owner} ${step}/${x.id}`;
    for (const c of exerciseCode(x))
      if (!failing.has(c.what))
        out.push({
          where: `${at} ${c.what}`,
          code: c.code,
          bars: Math.max(c.bars, 1),
          starter: c.what === "starter",
        });
    if ("answer" in x && x.answer && "options" in x.answer)
      for (const o of (x.answer.options ?? []) as { id: string; audio?: string }[])
        if (o.audio) out.push({ where: `${at} card:${o.id}`, code: o.audio, bars: 4, starter: false });
    if ("rubric" in x)
      for (const r of x.rubric)
        if ("reference" in r && r.reference)
          for (const s of r.reference.solutions)
            out.push({ where: `${at} rubric:${r.id}`, code: s, bars: r.reference.bars, starter: false });
  }
  return out;
}

const { lessons } = await loadLessons();
const w5 = lessons
  .filter((l) => !l.sample && W5.test(l.def.id))
  .sort((a, b) => a.def.id.localeCompare(b.def.id));
const { defs: checkpoints } = await loadCheckpointFiles();
const ALL: Code[] = [];
for (const l of w5)
  for (const s of l.def.steps) {
    if (s.example)
      ALL.push({
        where: `${l.def.id} ${s.id} example`,
        code: s.example.code,
        bars: s.example.bars ?? 4,
        starter: false,
      });
    if (s.exercise) ALL.push(...codesOf(l.def.id, s.exercise, s.id));
  }
for (const d of checkpoints.filter((x) => W5_CP.test(x.id))) {
  for (const e of d.authored) ALL.push(...codesOf(d.id, e, "item"));
  if (d.make) ALL.push(...codesOf(d.id, d.make, "make"));
}
for (const c of capstones.filter((x) => W5_CAPSTONES.test(x.id)))
  if (c.brief) ALL.push(...codesOf(c.id, c.brief, "brief"));

const frac = (s: string) => {
  const [a, b] = s.split("/");
  return Number(a) / (b ? Number(b) : 1);
};
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"];
const name = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** Each code played once, for all the scans below. */
const played = await Promise.all(
  // `.scope()` draws in Oak's panel and plays nothing (contracts §3.1 rule 9); headless Strudel has no panel.
  ALL.map(async (c) => ({
    c,
    r: await evalHeadless(c.code.replaceAll(".scope()", ""), Math.min(c.bars, 24)).catch(() => null),
  })),
);

describe("the code plays", () => {
  test("every example, starter, reference, card and passing test of Wave 5 evaluates", () => {
    expect(played.filter((p) => !p.r).map((p) => p.c.where)).toEqual([]);
    expect(ALL.length).toBeGreaterThan(500);
  });
});

describe("bass lines (U08 on)", () => {
  test("every bass note Oak plays sits in a bass's register, B0 to A3", () => {
    const out: string[] = [];
    for (const { c, r } of played)
      for (const e of r?.events ?? [])
        if (/^bass/.test(e.track) && e.midi != null && (e.midi < 23 || e.midi > 57))
          out.push(`${c.where}: ${name(e.midi)} at ${e.begin}`);
    expect(out).toEqual([]);
  });
});

/**
 * Rubs that are the music's point, each with its reason. A tune note a minor 2nd or 9th above a note of its own
 * chords, held for a beat or more, is otherwise the harshest sound a passing listener hears.
 */
const ALLOWED_RUBS: Record<string, string> = {
  "U10.L08 S1/a-smoother-climb item:0":
    "the harmonic-minor climb E F G♯ over E, played first so the learner hears the leap melodic minor removes",
  "U10.L08 S4/up-melodic-down-natural":
    "a scale run: A anticipates the Am on beat 4 of the E bar, and F passes down to E over Am",
  "U10.L08 S6/sing-up-and-down": "the same scale run, sung",
  "U10.L08 S7/climb-home": "F as an upper neighbour of E on beat 4 over Am, in the natural-minor fall",
  "U10.CP item/up-and-down":
    "C passing down to B over the V chord: the natural-minor descent the item asks for",
  "U11.L01 S1/nothing-rubs item:0":
    "the tune on all seven notes, played first so the learner hears where F rubs",
};
/** Over the blues in C (U11, C5), ♭3, 4, ♭5 and 5 of the key against a dominant seventh are the idiom. */
const BLUES_IDIOM = new Set([3, 5, 6, 7]);

describe("tunes over their own chords", () => {
  test("no tune sits a minor 2nd or 9th above its chords for a beat, except the rubs listed with a reason", () => {
    const out = new Set<string>();
    for (const { c, r } of played) {
      if (!r || c.starter) continue;
      const owner = c.where.split(" ").slice(0, 2).join(" ");
      if (Object.keys(ALLOWED_RUBS).some((k) => c.where.startsWith(k))) continue;
      const blues = /^(U11|C5)/.test(c.where) && /C\d:(blues|minor:pentatonic)"\)/.test(c.code);
      const ev = r.events.filter((e) => e.midi != null);
      const harm = ev.filter((e) => /^(chords|pad|keys)/.test(e.track));
      for (const m of ev.filter((e) => /^(mel|gtr|vox|lead|riff)/.test(e.track))) {
        const b = frac(m.begin);
        if (frac(m.end) - b < 0.25 - 1e-9) continue;
        if (blues && BLUES_IDIOM.has((((m.midi as number) % 12) + 12) % 12)) continue;
        for (const h of harm) {
          const d = (m.midi as number) - (h.midi as number);
          if (frac(h.begin) <= b + 1e-9 && frac(h.end) > b + 1e-9 && (d === 1 || d === 13))
            out.add(
              `${owner} ${c.where}: ${name(m.midi as number)} over ${name(h.midi as number)} at ${m.begin}`,
            );
        }
      }
    }
    expect([...out]).toEqual([]);
  });
});

describe("swing (U11.L07 on)", () => {
  test("a swung line never plays against straight off-beat eighths in the same code", () => {
    const out: string[] = [];
    for (const { c, r } of played) {
      // A passing test is a learner's answer the rubric accepts (U11.L07 accepts hats swung alone and suggests
      // the riff); the music Oak itself plays (examples, references, stimuli, cards) never flams.
      if (!r || c.starter || c.where.includes(" test:") || !c.code.includes(".swingBy(")) continue;
      const beat = 0.25;
      const pos = (e: { begin: string }) => Math.round(((frac(e.begin) % beat) / beat) * 24);
      const swung = new Set(r.events.filter((e) => pos(e) === 16).map((e) => e.track));
      const straight = new Set(r.events.filter((e) => pos(e) === 12).map((e) => e.track));
      if (swung.size && straight.size)
        out.push(`${c.where}: swung [${[...swung]}], straight [${[...straight]}]`);
    }
    expect(out).toEqual([]);
  });
});

/** Semitones above do of a do-based degree (raised 6 and 7 in minor are "6" and "7"). */
const SEMIS: Record<string, number> = {
  "1": 0,
  b2: 1,
  "2": 2,
  b3: 3,
  "3": 4,
  "4": 5,
  b5: 6,
  "5": 7,
  b6: 8,
  "6": 9,
  b7: 10,
  "7": 11,
};

describe("singing (contracts §8)", () => {
  test("every sung target of Wave 5 fits in an octave", async () => {
    const out: string[] = [];
    for (const l of w5)
      for (const s of l.def.steps)
        for (const x of s.exercise ? flattenExercise(s.exercise) : []) {
          if (x.kind !== "sing") continue;
          let span: number;
          if (x.target.from === "degrees") {
            const t = x.target;
            const semis = t.degrees.map((d, i) => (SEMIS[d] ?? Number.NaN) + 12 * (t.octaves?.[i] ?? 0));
            span = Math.max(...semis) - Math.min(...semis);
          } else {
            if (x.stimulus.src !== "code") continue;
            const track = x.target.track;
            const r = await evalHeadless(x.stimulus.code, x.stimulus.bars);
            const m = r.events
              .filter((e) => e.track === track && e.midi != null)
              .map((e) => e.midi as number);
            span = Math.max(...m) - Math.min(...m);
          }
          if (!(span <= 12)) out.push(`${l.def.id} ${s.id}: spans ${span} half steps`);
        }
    expect(out).toEqual([]);
  });
});

describe("the repertoire in the lessons", () => {
  test("U10.L09 sings Go Down Moses as its answer key has it: E | C C B B | C C A | E E G♯ G♯ | A", async () => {
    const l = w5.find((x) => x.def.id === "U10.L09");
    const listen = l?.def.steps[0]?.exercise;
    const code = listen?.kind === "listen" ? (listen.items[1]?.code ?? "") : "";
    const lesson = (await evalHeadless(code, 5)).events.filter((e) => e.track === "mel").map((e) => e.midi);
    const key = (await evalHeadless(goDownMoses.answerKey.code, 5)).events
      .filter((e) => e.track === "mel")
      .map((e) => e.midi);
    expect(lesson.map((m) => name(m as number))).toEqual([
      "E4",
      "C5",
      "C5",
      "B4",
      "B4",
      "C5",
      "C5",
      "A4",
      "E4",
      "E4",
      "G♯4",
      "G♯4",
      "A4",
    ]);
    // The answer key's first line, the same pitches in the same octave (its bar 4 holds A, then the next pickup).
    expect(key.slice(0, 13)).toEqual(lesson);
  });
});

// The advanced tracks listened to with instruments (integrate:content, Wave 7): what every example, starter, reference
// and passing test of J1–J5, R1–R3, A1.L05–L07 and A2 plays, computed with headless Strudel, in the key each lesson
// is written in (a lesson that tours keys writes the tour into its code, so every key it allows is in the events).
//   - Each part plays in its register: a bass between E1 and G3, chords between C2 and A6, a tune between E3 and E6,
//     except the steps whose point is a part out of its register (listed below with the reason).
//   - No chord of a comping line sits below its low-interval limit (`belowLowIntervalLimit`, the arranging
//     convention A2.L01 teaches), except the steps that demonstrate the mud.
//   - A walking bass walks: four notes a bar, no leap wider than a minor 7th, three moves in four a 4th or less (an
//     arpeggio walk leaps a 5th now and then).
//   - The clave is never contradicted by the Band: no Band an R3 step plays under the learner has a clave of its own.
//   - A comparison really compares: the audio cards of every compare step play different things; the two halves of a
//     sound lesson's compare stimulus (and the items of its listen steps) differ, a level-only change by 2 dB or more.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { type Exercise, flattenExercise, type LessonDef } from "@oak/content-kit";
import { belowLowIntervalLimit } from "@oak/theory";
import { exerciseCode } from "../../scripts/content/generate.ts";
import { bands } from "../bands/index.ts";
import { type LoadedLesson, loadLessons } from "../lib/load.bun.ts";
import { evaluate } from "./harness.ts";
import { isTrackLesson } from "./standard.ts";

setDefaultTimeout(900_000);

const { lessons } = await loadLessons();
const track = lessons.filter((l) => !l.sample && isTrackLesson(l.def.id));

const frac = (s: string): number => {
  const [a, b] = s.split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
type Role = "bass" | "chords" | "mel" | "other";
const roleOf = (t: string): Role =>
  /^bass/.test(t)
    ? "bass"
    : /^(chords|keys|comp|pad|gtr|piano|rhodes|organ)/.test(t)
      ? "chords"
      : /^(mel|vox|lead|tenor|vib|horn|tune|head)/.test(t)
        ? "mel"
        : "other";
const RANGE: Record<Exclude<Role, "other">, [number, number]> = {
  bass: [28, 55],
  chords: [36, 93],
  mel: [52, 88],
};

/** Steps whose point is a part outside its register or a muddy chord, with the reason. */
const DELIBERATE: Record<string, string> = {
  "A2.L01 S1": "the hook's first item crowds the chords down into the bass to be heard as mud",
  "A2.L01 S2": "the investigate step: the low chords against the high ones",
  "A2.L01 S4":
    "the modify step's starter and example: chords in the bass's register, moved up by the learner",
  "A2.L01 S6": "the ear item: the tune moved down under the chords, the part the learner names",
  "A2.L03 S4": "a right answer: the counter-melody an octave lower, any octave is the lesson's point",
  "J2.L04 S4": "a right answer: the scales an octave lower (the step grades the scales, not the register)",
};

interface Code {
  where: string;
  step: string;
  code: string;
  bars: number;
}
/** Every piece of code a lesson plays: examples, items, stimuli, starters, solutions and passing tests. */
function codesOf(def: LessonDef): Code[] {
  const out: Code[] = [];
  for (const s of def.steps) {
    if (s.example)
      out.push({ where: `${s.id}#example`, step: s.id, code: s.example.code, bars: s.example.bars ?? 4 });
    for (const e of s.exercise ? flattenExercise(s.exercise) : [])
      for (const c of exerciseCode(e as Exercise)) {
        if (c.what.startsWith("test:") && e.tests.find((t) => `test:${t.name}` === c.what)?.expect !== "pass")
          continue;
        out.push({ where: `${s.id}#${c.what}`, step: s.id, code: c.code, bars: Math.max(c.bars, 2) });
      }
  }
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.code) && seen.add(c.code));
}
type Ev = Awaited<ReturnType<typeof evaluate>>["events"][number];
const heard = (e: Ev) => Number(e.value.gain ?? 1) * Number(e.value.velocity ?? 1) > 0.02;
const cache = new Map<string, Promise<Ev[]>>();
function eventsOf(code: string, bars: number): Promise<Ev[]> {
  const key = `${bars}|${code}`;
  let p = cache.get(key);
  if (!p) {
    p = evaluate(code.replace(/[⟪⟫]/g, ""), Math.min(bars, 8)).then((r) => {
      if (!r.ok) throw new Error(r.error);
      return r.events;
    });
    cache.set(key, p);
  }
  return p;
}
const deliberate = (l: LoadedLesson, step: string) => `${l.def.id} ${step}` in DELIBERATE;

describe("the advanced tracks, heard (headless Strudel)", () => {
  test("every part plays in its register, and no comping chord sits below its low-interval limit", async () => {
    const found: string[] = [];
    for (const l of track)
      for (const c of codesOf(l.def)) {
        if (deliberate(l, c.step)) continue;
        const ev = (await eventsOf(c.code, c.bars)).filter((e) => e.midi !== null && heard(e));
        for (const e of ev) {
          const role = roleOf(e.track);
          if (role === "other") continue;
          const [lo, hi] = RANGE[role];
          const m = e.midi as number;
          if (m < lo || m > hi) found.push(`${l.def.id} ${c.where}: ${e.track} plays MIDI ${m}`);
        }
        const chords = new Map<string, number[]>();
        for (const e of ev)
          if (roleOf(e.track) === "chords")
            chords.set(`${e.track}@${e.begin}`, [
              ...(chords.get(`${e.track}@${e.begin}`) ?? []),
              e.midi as number,
            ]);
        for (const [at, ms] of chords) {
          const s = [...ms].sort((a, b) => a - b);
          for (let i = 0; i + 1 < s.length; i++)
            if (belowLowIntervalLimit(s[i] as number, s[i + 1] as number))
              found.push(`${l.def.id} ${c.where}: ${at} ${s.join(",")} below the low-interval limit`);
        }
      }
    expect([...new Set(found)]).toEqual(KNOWN_LOW);
  });

  test("a walking bass walks: four notes a bar, no leap past a minor 7th, three moves in four a 4th or less", async () => {
    const found: string[] = [];
    let walks = 0;
    for (const l of track.filter((x) => /^J[3-5]\./.test(x.def.id)))
      for (const c of codesOf(l.def)) {
        const bass = (await eventsOf(c.code, Math.max(c.bars, 4)))
          .filter((e) => /^bass/.test(e.track) && e.midi !== null && heard(e))
          .sort((a, b) => frac(a.begin) - frac(b.begin));
        if (bass.length < 8) continue;
        const bars = Math.ceil(frac((bass.at(-1) as Ev).begin) + 1e-9);
        const perBar = Array.from(
          { length: bars },
          (_, i) => bass.filter((e) => Math.floor(frac(e.begin)) === i).length,
        );
        const moves = bass
          .slice(1)
          .map((e, i) => Math.abs((e.midi as number) - ((bass[i] as Ev).midi as number)));
        // A walk: four notes in every bar and few repeated notes (four roots a bar is a two-beat feel, not a walk).
        if (!perBar.every((n) => n === 4) || moves.filter((m) => m === 0).length > moves.length / 4) continue;
        walks++;
        if (Math.max(...moves) > 10) found.push(`${l.def.id} ${c.where}: a leap of ${Math.max(...moves)}`);
        if (moves.filter((m) => m <= 5).length < 0.75 * moves.length)
          found.push(
            `${l.def.id} ${c.where}: ${moves.filter((m) => m > 5).length} of ${moves.length} moves wider than a 4th`,
          );
      }
    expect(walks).toBeGreaterThan(10);
    expect(found).toEqual([]);
  });

  test("no Band an R3 step plays has a clave of its own: the learner's clave is never contradicted", () => {
    const CLAVE_SOUNDS = /\b(rim|cl|claves|cb)\b/;
    const used = new Set<string>();
    for (const l of track.filter((x) => x.def.id.startsWith("R3.")))
      for (const s of l.def.steps) if (s.ui.band) used.add(s.ui.band.band);
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) {
      const b = bands.find((x) => x.id === id);
      for (const [flavour, code] of Object.entries((b?.code ?? {}) as Record<string, string>)) {
        const drums = code.split("\n").filter((ln) => /^drums:/.test(ln));
        expect([id, flavour, drums.some((ln) => CLAVE_SOUNDS.test(ln))]).toEqual([id, flavour, false]);
      }
    }
  });

  test("every sound comparison compares: its two halves differ, a level change by 2 dB or more", async () => {
    const SKIP = new Set(["locations", "_slices"]);
    const sig = (ev: Ev[], from: number, to: number) =>
      ev
        .filter((e) => frac(e.begin) >= from - 1e-9 && frac(e.begin) < to - 1e-9)
        .map((e) => {
          const v = Object.entries(e.value)
            .filter(([k]) => !SKIP.has(k))
            .sort(([a], [b]) => a.localeCompare(b));
          return `${e.track} ${(frac(e.begin) - from).toFixed(4)} ${e.midi} ${JSON.stringify(v)}`;
        })
        .sort()
        .join("\n");
    const level = (ev: Ev[], from: number, to: number) =>
      ev
        .filter((e) => frac(e.begin) >= from - 1e-9 && frac(e.begin) < to - 1e-9)
        .reduce((a, e) => a + Number(e.value.gain ?? 1) ** 2 * Number(e.value.velocity ?? 1) ** 2, 0);
    const found: string[] = [];
    let compared = 0;
    for (const l of track)
      for (const s of l.def.steps) {
        if (!s.exercise) continue;
        for (const e of flattenExercise(s.exercise)) {
          // A compare step on audio cards: every card plays something the others do not.
          const cards = (e as { answer?: { layout?: string; options?: { audio?: string }[] } }).answer;
          if (s.kind === "compare" && cards?.layout === "audio-cards") {
            const audios = (cards.options ?? []).flatMap((o) => (o.audio ? [o.audio] : []));
            const sigs = await Promise.all(audios.map(async (a) => sig(await eventsOf(a, 2), 0, 2)));
            compared++;
            if (new Set(sigs).size < sigs.length)
              found.push(`${l.def.id} ${s.id}: two audio cards play the same`);
            continue;
          }
          // A sound lesson's compare step on one stimulus: its first half against its second.
          if (
            /^A[12]\./.test(l.def.id) &&
            s.kind === "compare" &&
            "stimulus" in e &&
            e.stimulus?.src === "code"
          ) {
            const bars = e.stimulus.bars;
            const ev = await eventsOf(e.stimulus.code, bars);
            const half = bars / 2;
            compared++;
            const [a, b] = [sig(ev, 0, half), sig(ev, half, bars)];
            if (a === b) found.push(`${l.def.id} ${s.id}: the two halves play the same`);
            const ratio = level(ev, 0, half) / Math.max(level(ev, half, bars), 1e-9);
            const onlyLevel =
              a.replace(/"gain",[\d.e-]+|"velocity",[\d.e-]+/g, "") ===
              b.replace(/"gain",[\d.e-]+|"velocity",[\d.e-]+/g, "");
            if (onlyLevel && Math.abs(10 * Math.log10(ratio)) < 2)
              found.push(`${l.def.id} ${s.id}: only the level changes, by less than 2 dB`);
          }
          // A listen step of the sound lessons: every item plays something the others do not.
          if (/^A[12]\./.test(l.def.id) && e.kind === "listen" && e.items.length > 1) {
            const sigs = await Promise.all(
              e.items.map(async (it) => sig(await eventsOf(it.code, it.bars), 0, Math.min(it.bars, 8))),
            );
            compared++;
            if (new Set(sigs).size < sigs.length)
              found.push(`${l.def.id} ${s.id}: two listen items play the same`);
          }
        }
      }
    expect(compared).toBeGreaterThan(10);
    expect(found).toEqual([]);
  });
});

/**
 * Found and judged (integrate:content, Wave 7): J5.L05's hook comps F♯7 in the left hand anchored at D4 (A♯2 D♯3 E3
 * G♯3), so its 13th and 7th rub a half step at D♯3, one half step under the m2 limit (E3). Raising the anchor to E4
 * clears it but puts the tenor's E4 a half step over the voicing's D♯4 on the same chord (evaluated); the hand stays
 * at D4 under the tenor, a Listen QA item. Any new entry here is a defect to fix or a step to justify in DELIBERATE.
 */
const KNOWN_LOW: string[] = [
  "J5.L05 S1#example: chords@5 46,51,52,56 below the low-interval limit",
  "J5.L05 S1#example: chords@65/12 46,51,52,56 below the low-interval limit",
  "J5.L05 S1#item:1: chords@5 46,51,52,56 below the low-interval limit",
  "J5.L05 S1#item:1: chords@65/12 46,51,52,56 below the low-interval limit",
];

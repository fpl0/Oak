// Wave 6 review (review:surfaces): every U12–U17 example and reference solution through the Workbench as the learner
// sees it (degrees, syllables and note names under the staff), each staff page read back from its ABC independently
// (packages/notation/corpus/harness.ts readBack). Every pitch the code plays is drawn (a unison of two tracks is one
// head), nothing is engraved approximately, no text under the staff or degree label writes "#" or "b" for ♯ and ♭,
// and the key ribbon never marks a change as more than six half steps.
import { beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { flattenExercise } from "@oak/content-kit";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { loadLessons } from "../../../content/lib/load.bun.ts";
import { readBack } from "../../../packages/notation/corpus/harness.ts";
import { signedSemitones } from "./colour.ts";
import { pieceBarsOf } from "./lines.ts";
import { buildModel, staffPage, staffPageCount } from "./model.ts";

setDefaultTimeout(300_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

const at = (r: readonly [number, number]) => r[0] / r[1];

test("U12–U17: every example and reference solution is drawn whole and labelled in glyphs", async () => {
  const { lessons } = await loadLessons();
  const pick = lessons.filter((l) => /^U1[2-7]\./.test(l.def.id));
  expect(pick.length).toBeGreaterThanOrEqual(33);
  const issues: string[] = [];
  let pieces = 0;
  for (const l of pick) {
    const items: { id: string; code: string; bars: number }[] = [];
    for (const s of l.def.steps) {
      if (s.example) items.push({ id: `${s.id} example`, code: s.example.code, bars: s.example.bars });
      if (!s.exercise) continue;
      for (const e of [s.exercise, ...flattenExercise(s.exercise)]) {
        const ref = (e as { reference?: { solutions: string[]; bars: number } }).reference;
        ref?.solutions.forEach((code, i) => {
          items.push({ id: `${s.id} reference ${i + 1}`, code, bars: ref.bars });
        });
      }
    }
    for (const it of items) {
      pieces++;
      const where = `${l.def.id} ${it.id}`;
      const r = await evaluateForGrading(it.code, {
        mode: "lesson",
        bars: pieceBarsOf(it.code, it.bars),
        lint: null,
      });
      const out = buildModel(it.code, r, {
        meter: l.def.meter ?? "4/4",
        key: l.def.key ?? null,
        staff: "auto",
        annotations: { degree: true, solfege: true, noteName: true },
      });
      if (!out.ok) {
        issues.push(`${where}: ${out.error.message}`);
        continue;
      }
      const m = out.model;
      for (const k of m.colour?.keys ?? [])
        if (k.change && Math.abs(signedSemitones(k.change.semitones)) !== Math.abs(k.change.semitones))
          issues.push(`${where}: ribbon mark ${k.change.text}`);
      for (const e of m.events)
        if (e.label?.degree && /[#b]/.test(e.label.degree.label))
          issues.push(`${where}: degree label ${e.label.degree.label}`);
      const src = m.staffSource;
      if (!src) continue;
      const pitched = src.events.filter((e) => e.midi !== null && !e.drum);
      for (let p = 0; p < staffPageCount(src); p++) {
        const pg = staffPage(src, p);
        if (pg.error || !pg.abc || !pg.score) {
          issues.push(`${where} page ${p + 1}: ${pg.error}`);
          continue;
        }
        if (pg.score.approximate) issues.push(`${where} page ${p + 1}: engraved approximately`);
        const lyrics = pg.abc.abc
          .split("\n")
          .filter((x) => x.startsWith("w:"))
          .join(" ");
        if (/[#]|(?<=[A-G1-7])b/.test(lyrics))
          issues.push(`${where} page ${p + 1}: ASCII accidental under the staff`);
        const drawn = readBack(pg.abc.abc)
          .staves.filter((s) => !s.perc)
          .flatMap((s) => s.voices.flat())
          .flatMap((n) => n.midis);
        const onPage = pitched.filter(
          (e) => at(e.onset) >= pg.startBar && at(e.onset) < pg.startBar + pg.bars,
        );
        // A head per distinct (onset, pitch): two tracks in unison share one head.
        const heads = new Set(onPage.map((e) => `${at(e.onset)}|${e.midi}`));
        const want = [...new Set(onPage.map((e) => e.midi as number))].sort((a, b) => a - b);
        const got = [...new Set(drawn)].sort((a, b) => a - b);
        if (JSON.stringify(got) !== JSON.stringify(want))
          issues.push(`${where} page ${p + 1}: pitches differ`);
        if (drawn.length < heads.size - onPage.filter((e) => e.dur[0] === 0).length)
          issues.push(`${where} page ${p + 1}: ${drawn.length} heads for ${heads.size} notes`);
      }
    }
  }
  expect(pieces).toBeGreaterThan(100);
  expect(issues).toEqual([]);
});

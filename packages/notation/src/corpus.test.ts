// Golden corpus: Strudel patterns → headless Strudel 1.2.6 → NEvents → Score → ABC → abcjs.parseOnly.
// Each entry states the notation a musician expects (corpus/corpus.ts); on top of that every entry must
// parse in abcjs with no warning, fill every bar exactly, keep every class, and engrave the same pitches
// and times Strudel produced.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { R } from "@oak/content-kit";
import { CORPUS } from "../corpus/corpus.ts";
import { runEntry } from "../corpus/harness.ts";
import { parseNoteList, scoreToEvents, toNoteList } from "./index.ts";

setDefaultTimeout(30_000);

const key3 = (e: {
  onset: readonly [number, number];
  dur: readonly [number, number];
  midi: number | null;
  s?: string;
}) => `${R.str(e.onset)}+${R.str(e.dur)}:${e.midi ?? e.s}`;

describe("golden corpus", () => {
  test("has at least 40 patterns", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CORPUS.map((e) => e.name)).size).toBe(CORPUS.length);
  });

  for (const entry of CORPUS) {
    test(entry.name, async () => {
      const r = await runEntry(entry);
      const { score, abc, check, events } = r;
      const W = score.meter.num / score.meter.den;
      const x = entry.expect;

      // Golden facts stated by hand.
      for (const [id, want] of Object.entries(x.voices ?? {})) {
        const si = score.staves.findIndex((s) => s.voices.some((v) => v.id === id));
        expect(si).toBeGreaterThanOrEqual(0);
        const vi = score.staves[si]?.voices.findIndex((v) => v.id === id) ?? -1;
        expect(toNoteList(score, { staff: si, voice: vi })).toBe(want);
      }
      if (x.key !== undefined) expect(score.key).toEqual(x.key);
      expect(score.approximate).toBe(x.approximate ?? false);
      if (x.warnings) expect(score.warnings.map((w) => w.code)).toEqual(x.warnings);
      for (const s of x.abc ?? []) expect(abc.abc).toContain(s);
      if (x.chordTexts) expect(check.chordTexts).toEqual(x.chordTexts);
      if (x.staves) expect(score.staves.map((s) => `${s.id}:${s.clef}`)).toEqual(x.staves);

      // abcjs reads it cleanly ...
      expect(check.warnings).toEqual([]);
      // ... every bar of every voice adds up to the bar (partial pickup bars to their own length) ...
      score.staves.forEach((s, si) => {
        s.voices.forEach((v, vi) => {
          const want = v.bars.map((b) =>
            b.partial ? Math.round(b.items.reduce((a, it) => a + R.toNum(it.dur) * W, 0) * 1e9) / 1e9 : W,
          );
          expect(check.barTotals[si]?.[vi]).toEqual(want);
          // ... every note element keeps exactly its class ...
          const classes = v.bars.flatMap((b) =>
            b.items.filter((it) => it.kind !== "rest").map((it) => `oak-e${it.n}`),
          );
          expect(check.classes[si]?.[vi]).toEqual(classes);
        });
      });
      // ... the spelled pitches are the pitches Strudel played ...
      const byId = new Map(events.map((e) => [e.id, e]));
      for (const s of score.staves) {
        if (s.clef === "perc") continue;
        for (const v of s.voices)
          for (const b of v.bars)
            for (const it of b.items)
              it.pitches.forEach((p, i) => {
                expect(p.midi).toBe(byId.get(it.eventIds[i] as string)?.midi as number);
              });
      }
      // ... and every idMap entry is consistent with byEvent.
      abc.idMap.forEach((e, n) => {
        expect(e.n).toBe(n);
        for (const id of e.eventIds) expect(abc.byEvent.get(id)).toBe(n);
      });

      // Exact single-staff entries: the engraving gives back Strudel's events (ties merged).
      const exact =
        !score.approximate &&
        !entry.swing &&
        (entry.staff ?? "auto") !== "lead" &&
        (entry.staff ?? "auto") !== "rhythm" &&
        score.staves.every((s) => s.clef !== "perc");
      if (exact) {
        const want = events
          .filter((e) => e.midi !== null)
          .map(key3)
          .sort();
        expect(scoreToEvents(score).map(key3).sort()).toEqual(want);
      }
      // The note-list DSL reads back what it prints.
      if (
        score.staves.length === 1 &&
        score.staves[0]?.voices.length === 1 &&
        !score.approximate &&
        !score.pickup
      ) {
        const back = parseNoteList(toNoteList(score), { meter: score.meter, start: [score.startBar, 1] });
        expect(back.map(key3).sort()).toEqual(scoreToEvents(score).map(key3).sort());
      }

      expect({
        code: entry.code,
        abc: abc.abc.trimEnd().split("\n"),
        voices: Object.fromEntries(
          score.staves.flatMap((s, si) =>
            s.voices.map((v, vi) => [v.id, toNoteList(score, { staff: si, voice: vi })]),
          ),
        ),
        key: score.key,
        approximate: score.approximate,
        warnings: score.warnings.map((w) => `${w.code}@${w.bar}`),
      }).toMatchSnapshot();
    });
  }
});

// Golden corpus: Strudel patterns → headless Strudel 1.2.6 → NEvents → Score → ABC → abcjs.parseOnly.
// Each entry states the notation a musician expects (corpus/corpus.ts); on top of that every entry must
// parse in abcjs with no warning, fill every bar exactly, keep every class, and engrave the same pitches
// and times Strudel produced. The snapshot is never the only check: the ABC is read back independently
// (`readBack`: key signature, bar-scoped accidentals, ties, tuplets) and its pitches and durations must
// equal the input events (the Score's own events where the engraving is approximate, swung or a lead sheet).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { R } from "@oak/content-kit";
import { CORPUS } from "../corpus/corpus.ts";
import { readBack, runEntry } from "../corpus/harness.ts";
import { parseNoteList, scoreToEvents, toNoteList } from "./index.ts";

setDefaultTimeout(30_000);

const key3 = (e: {
  onset: readonly [number, number];
  dur: readonly [number, number];
  midi: number | null;
  s?: string;
}) => `${R.str(e.onset)}+${R.str(e.dur)}:${e.midi ?? e.s}`;

describe("the independent read-back", () => {
  const back = (body: string, k = "C") =>
    readBack(`X:1\nM:4/4\nL:1/16\nK:${k}\n${body}`).staves[0]?.voices[0]?.map(
      (n) => `${n.onset}+${n.dur}:${n.midis.join(",")}`,
    );
  test("key signature in every octave, accidentals for the bar in their octave, naturals", () => {
    expect(back("F4 =F4 F4 f4 | F16 |]", "D")).toEqual([
      "0+0.25:66",
      "0.25+0.25:65",
      "0.5+0.25:65",
      "0.75+0.25:78",
      "1+1:66",
    ]);
    expect(back("^c4 c4 C4 =c4 |]")).toEqual(["0+0.25:73", "0.25+0.25:73", "0.5+0.25:60", "0.75+0.25:72"]);
    expect(back("^^F4 __B4 z8 |]")).toEqual(["0+0.25:67", "0.25+0.25:69"]);
  });
  test("ties continue their pitch over the bar line and merge; tuplets scale", () => {
    expect(back("z8 ^F8- | F4 F4 [CE]8 |]")).toEqual(["0.5+0.75:66", "1.25+0.25:65", "1.5+0.5:60,64"]);
    expect(back("(3:2:3C4 D4 E4 z8 |]")).toEqual([
      "0+0.16666666666666666:60",
      "0.16666666666666666+0.16666666666666666:62",
      "0.3333333333333333+0.16666666666666666:64",
    ]);
  });
});

describe("golden corpus", () => {
  test("has at least 170 patterns (Wave 4: 40 more for harmony, lead sheets and pickups)", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(171);
    expect(new Set(CORPUS.map((e) => e.name)).size).toBe(CORPUS.length);
  });

  for (const entry of CORPUS) {
    test(entry.name, async () => {
      const r = await runEntry(entry);
      const { score, abc, check } = r;
      // The engraved span only (a later page starts at `startBar`).
      const events = r.events.filter(
        (e) => R.toNum(e.onset) >= score.startBar && R.toNum(e.onset) < score.startBar + score.bars,
      );
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
      if (x.romanTexts)
        expect(check.labels.filter((l) => l.position === "below").map((l) => l.text)).toEqual(x.romanTexts);
      if (x.barNumbers) expect(check.barNumbers).toEqual(x.barNumbers);
      // No repeat signs, ever: Oak writes every bar out.
      expect(abc.abc).not.toMatch(/:\||\|:|::/);
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

      // Independent read-back: the ABC's own pitches and durations are the input's.
      const rb = readBack(abc.abc);
      const firstItem = score.staves[0]?.voices[0]?.bars[0]?.items[0];
      const t0 = firstItem ? R.toNum(firstItem.onset) : score.startBar;
      const num = (x: number) => (Math.round(x * 1e6) / 1e6).toString();
      const fromAbc = (on: number, dur: number, what: string | number) =>
        `${num(t0 + on / W)}+${num(dur / W)}:${what}`;
      const pitchedBack = rb.staves
        .filter((s) => !s.perc)
        .flatMap((s) => s.voices.flat().flatMap((n) => n.midis.map((m) => fromAbc(n.onset, n.dur, m))))
        .sort();
      const asNum = (e: {
        onset: readonly [number, number];
        dur: readonly [number, number];
        midi: number | null;
      }) =>
        `${num(R.toNum(e.onset as [number, number]))}+${num(R.toNum(e.dur as [number, number]))}:${e.midi}`;
      const engraved = scoreToEvents(score).filter((e) => e.midi !== null);
      const lead = (entry.staff ?? "auto") === "lead";
      // A lead sheet engraves the melody only: the events with no chord symbol.
      const truth =
        !score.approximate && !entry.swing && (entry.staff ?? "auto") !== "rhythm"
          ? events.filter((e) => e.midi !== null && (!lead || e.chordSymbol === undefined))
          : engraved;
      expect(pitchedBack).toEqual(truth.map(asNum).sort());

      // Chord labels read back from the ABC where they stand: symbols over the top staff's first voice, Roman
      // numerals under the bottom pitched staff's first voice, at their onsets (or the item they are drawn on).
      const glyphs = (t: string) => t.replace(/♭/g, "b").replace(/♯/g, "#").replace(/°/g, "o");
      const romanStaff = score.staves.reduce((acc, st, i) => (st.clef !== "perc" ? i : acc), 0);
      const labelsBack = (position: string, si: number) =>
        check.labels
          .filter((l) => l.position === position)
          .map((l) => {
            expect([l.si, l.vi]).toEqual([si, 0]);
            return `${num(t0 + l.onset / W)}:${glyphs(l.text)}`;
          });
      const labelsWant = (list: typeof score.chords) =>
        (list ?? []).map((a) => `${num(R.toNum(a.drawnAt ?? a.at))}:${glyphs(a.text)}`);
      expect(labelsBack("default", 0)).toEqual(labelsWant(score.chords));
      expect(labelsBack("below", romanStaff)).toEqual(labelsWant(score.romans));
      // ... and every label stands where it was asked for, unless the Score says why not.
      if (!score.warnings.some((w) => w.code === "abcjs-limit"))
        for (const a of [...(score.chords ?? []), ...(score.romans ?? [])]) expect(a.drawnAt).toBeUndefined();
      // Percussion: every stroke at its time with its heads.
      const percBack = rb.staves
        .filter((s) => s.perc)
        .flatMap((s) => s.voices.flat().map((n) => fromAbc(n.onset, n.dur, n.heads)))
        .sort();
      const percWant: string[] = [];
      for (const s of score.staves) {
        if (s.clef !== "perc") continue;
        for (const v of s.voices) {
          const chains = new Map<number, { onset: number; dur: number; heads: number }>();
          for (const b of v.bars)
            for (const it of b.items) {
              if (it.n === null) continue;
              const c = chains.get(it.n);
              if (c) c.dur += R.toNum(it.dur);
              else
                chains.set(it.n, {
                  onset: R.toNum(it.onset),
                  dur: R.toNum(it.dur),
                  heads: it.pitches.length,
                });
            }
          for (const c of chains.values()) percWant.push(`${num(c.onset)}+${num(c.dur)}:${c.heads}`);
        }
      }
      expect(percBack).toEqual(percWant.sort());

      // Exact single-staff entries: the engraving gives back Strudel's events (ties merged).
      const exact =
        !score.approximate &&
        !entry.swing &&
        (entry.staff ?? "auto") !== "rhythm" &&
        score.staves.every((s) => s.clef !== "perc");
      if (exact) {
        const want = events
          .filter((e) => e.midi !== null && (!lead || e.chordSymbol === undefined))
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

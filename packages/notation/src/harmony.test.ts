// Wave 4 (docs/design/wave4.md §3.3): chord labels and their display, key changes inside a bar, two keys on one
// staff, pickups on every staff and page, lead-sheet layout and paging, and stacking chords in staff input.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import {
  applyEdit,
  buildScore,
  chordSymbolDisplay,
  editNoteList,
  keyAtBar,
  keyAtOnset,
  leadSheetInput,
  leadSheetLayout,
  leadSheetPages,
  type NotationInput,
  notate,
  noteAnnotations,
  numeralDisplay,
  parseNoteList,
  toAbc,
  toNoteList,
} from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };
const F: KeySpec = { tonic: "F", mode: "major" };
const W44 = METERS["4/4"];
const W34 = METERS["3/4"];
const tracks = (lists: Record<string, string>, meter = W44): NEvent[] =>
  Object.entries(lists)
    .flatMap(([track, list]) => parseNoteList(list, { track, meter }))
    .sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0));
const input = (o: Partial<NotationInput> & { events: NEvent[] }): NotationInput => ({
  meter: W44,
  key: C,
  bars: 1,
  staff: "treble",
  ...o,
});

describe("label display", () => {
  test("numerals: theory's glyphs, figures as digits, applied chords kept", () => {
    expect(
      ["viio", "viio7", "iih7", "bVII", "#ivo7", "V65/V", "V7/bVI", "I64", "Imaj7", "V43"].map(
        numeralDisplay,
      ),
    ).toEqual(["vii°", "vii°7", "iiø7", "♭VII", "♯iv°7", "V65/V", "V7/♭VI", "I64", "Imaj7", "V43"]);
  });
  test("chord symbols: abcjs's ASCII form, slash chords keep their bass, unknown text is kept", () => {
    expect(
      ["G/B", "Bbm7b5", "Co7", "Am/G", "C/E", "Caug", "Cmaj7/G", "N.C."].map(chordSymbolDisplay),
    ).toEqual(["G/B", "Bbm7b5", "Co7", "Am/G", "C/E", "C+", "Cmaj7/G", "N.C."]);
  });
  test("a slash chord spells its notes from the chord: E sharp in C sharp/E sharp", () => {
    const events = parseNoteList("[F4,G#4,C#5]:1").map((e) => {
      const { written: _w, ...rest } = e;
      return { ...rest, pitchSource: "note-num" as const };
    });
    const score = buildScore(input({ events, chords: [{ bar: 0, beat: 1, symbol: "C#/E#" }] }));
    expect(toNoteList(score)).toBe("[E#4,G#4,C#5]:1");
  });
  test("one label per position: the last given wins; labels out of the engraved bars are dropped", () => {
    const score = buildScore(
      input({
        events: parseNoteList("C4:1 | C4:1"),
        bars: 2,
        chords: [
          { bar: 0, beat: 1, symbol: "C" },
          { bar: 0, beat: 1, symbol: "Am" },
          { bar: 2, beat: 1, symbol: "F" },
        ],
        romans: [
          { bar: 1, beat: 1, rn: "I" },
          { bar: 0, beat: 1, rn: "vi" },
        ],
      }),
    );
    expect(score.chords?.map((c) => c.text)).toEqual(["Am"]);
    expect(score.romans?.map((c) => `${c.bar}:${c.text}`)).toEqual(["0:vi", "1:I"]);
  });
  test("harmonic rhythm: two labels in a bar split a whole note at beat 3 (tied), never a tuplet", () => {
    const two = buildScore(
      input({
        events: parseNoteList("[C4,E4,G4]:1"),
        chords: [
          { bar: 0, beat: 1, symbol: "C" },
          { bar: 0, beat: 3, symbol: "C/E" },
        ],
      }),
    );
    expect(toNoteList(two)).toBe("[C4,E4,G4]:2~ [C4,E4,G4]:2");
    expect(two.warnings).toEqual([]);
    const tuplet = buildScore(
      input({
        events: parseNoteList("(3:2 C4:4 D4:4 E4:4) F4:2"),
        chords: [
          { bar: 0, beat: 1, symbol: "C" },
          { bar: 0, beat: 2, symbol: "Dm" },
        ],
      }),
    );
    expect(toNoteList(tuplet)).toBe("(3:2 C4:4 D4:4 E4:4) F4:2");
    expect(tuplet.chords?.[1]?.drawnAt).toEqual([1, 6]);
    expect(tuplet.warnings.map((w) => w.code)).toEqual(["abcjs-limit"]);
    expect(toAbc(tuplet).abc).toContain('"Dm"!class=oak-e1!D4');
  });
});

describe("key changes inside a bar", () => {
  const events = parseNoteList("C4:4 D4:4 E4:4 F4:4 | G4:8 A4:8 B4:8 C5:8 D5:8 E5:8 F#5:8 G5:8");
  const score = buildScore(input({ events, bars: 2, keyChanges: [{ bar: 1, beat: 3, key: G }] }));
  test("the change is kept with its beat; the key in force at the bar line and at an onset", () => {
    expect(score.keyChanges).toEqual([{ bar: 1, beat: 3, key: G }]);
    expect(keyAtBar(score, 1)).toEqual(C);
    expect(keyAtBar(score, 2)).toEqual(G);
    expect(keyAtOnset(score, [5, 4])).toEqual(C);
    expect(keyAtOnset(score, [3, 2])).toEqual(G);
  });
  test("the new signature is written before the item at its beat, F sharp then needs no sign", () => {
    const abc = toAbc(score).abc;
    expect(abc).toContain("!class=oak-e7!c2 [K:G] !class=oak-e8!d2");
    expect(abc).toContain("!class=oak-e10!f2");
  });
  test("labels read the new key: F sharp after the change is 7 in G, not ♯4 in C", () => {
    const a = noteAnnotations(score, { degree: true });
    expect(a.slice(4).map((x) => x.degree)).toEqual(["5", "6", "7", "1", "5", "6", "7", "1"]);
  });
  test("a change at beat 1 is a bar-line change; beats outside the bar and changes to the key in force are dropped", () => {
    const s = buildScore(
      input({
        events,
        bars: 2,
        keyChanges: [
          { bar: 1, beat: 1, key: G },
          { bar: 1, beat: 9, key: F },
          { bar: 1, beat: 0, key: F },
          { bar: 1, beat: 2, key: G },
        ],
      }),
    );
    expect(s.keyChanges).toEqual([{ bar: 1, key: G }]);
    expect(toAbc(s).abc).toContain("|| [K:G] ");
  });
  test("each staff of a grand staff gets the change, a held note is split and tied across it", () => {
    const s = buildScore({
      events: tracks({ mel: "E4:4 F4:4 G4:2 | A4:2 F#4:4 G4:4", bass: "C3:1 | C3:2. D3:4" }),
      meter: W44,
      key: C,
      bars: 2,
      staff: "grand",
      split: "track",
      keyChanges: [{ bar: 1, beat: 3, key: G }],
    });
    expect(toNoteList(s, { staff: 1 })).toBe("C3:1 | C3:2~ C3:4 D3:4");
    expect(toAbc(s).abc.match(/\[K:G\]/g)).toHaveLength(2);
  });
});

describe("two keys on one staff", () => {
  test("the signature of the plan most notes are in; each note spelled in its own track's key", () => {
    // A melody in D flat over a line in D major: G flat in one, F sharp in the other, same key.
    const events = tracks({ mel: "Db4:4 Eb4:4 F4:4 Gb4:4", harm: "F#4:2 F#4:2" }).map((e) => {
      const { written: _w, ...rest } = e;
      return { ...rest, pitchSource: "n-scale" as const };
    });
    const s = buildScore(
      input({
        events,
        key: { tonic: "Db", mode: "major" },
        trackKeys: { harm: { key: { tonic: "D", mode: "major" } } },
      }),
    );
    expect(s.staves[0]?.key).toBeUndefined();
    const names = s.staves.flatMap((st) =>
      st.voices.flatMap((v) => v.bars.flatMap((b) => b.items.flatMap((it) => it.pitches.map((p) => p.name)))),
    );
    expect(names).toContain("F#4");
    expect(names).toContain("Gb4");
    expect(toAbc(s).abc).toContain("K:Db\n");
  });
  test("when the other key has most of the notes, the staff shows its signature (single staff too)", () => {
    const events = tracks({ mel: "C5:4 F5:4 G5:4 C5:4", harm: "[G3,B3]:4 [F#4,A4]:4 [D4,F#4]:4 [G3,B3]:4" });
    const s = buildScore(input({ events, trackKeys: { harm: { key: G } } }));
    expect(s.staves[0]?.key).toEqual(G);
    const abc = toAbc(s).abc;
    expect(abc).toContain("K:G\n");
    expect(abc).toContain("[FA=f]4");
  });
});

describe("pickups everywhere", () => {
  const mel = "r:2. G4:4 | C5:2 B4:4 r:4 | A4:4 G4:4 E4:4 r:4 | C4:2. r:4";
  test("a drum count-in before the pickup is not engraved; every staff starts short", () => {
    const events = [
      ...parseNoteList(mel, { track: "mel" }),
      ...parseNoteList("hh:4 hh:4 hh:4 r:4 | bd:4 hh:4 sd:4 hh:4", { track: "drums" }),
    ].sort((a, b) => R.cmp(a.onset, b.onset));
    const s = buildScore({ events, meter: W44, key: C, bars: 4, staff: "auto", pickup: { units: [1, 1] } });
    expect(s.pickup).toBe(true);
    expect(s.warnings).toEqual([]);
    for (const st of s.staves) for (const v of st.voices) expect(v.bars[0]?.partial).toBe(true);
  });
  test("a page after the pickup numbers from cycle 0 = bar 0; the last page shortens the last bar", () => {
    const events = parseNoteList(mel, { track: "mel" });
    const page = notate({
      events,
      meter: W44,
      key: C,
      bars: 2,
      startBar: 2,
      staff: "treble",
      pickup: { units: [1, 1] },
    });
    expect(page.score.pickup).toBe(false);
    expect(page.score.pickupNumbering).toBe(true);
    expect(page.abc.idMap.map((e) => e.bar)).toEqual([2, 2, 2, 3]);
    expect(page.score.staves[0]?.voices[0]?.bars[1]?.partial).toBe(true);
    expect(toNoteList(page.score)).toBe("A4:4 G4:4 E4:4 r:4 | C4:2.");
    // A page that stops before the song's end keeps its last bar whole.
    const middle = buildScore({
      events,
      meter: W44,
      key: C,
      bars: 3,
      staff: "treble",
      pickup: { units: [1, 1] },
      endsPiece: false,
    });
    expect(toNoteList(middle)).toBe("G4:4 | C5:2 B4:4 r:4 | A4:4 G4:4 E4:4 r:4");
  });
  test("the pickup bar does not count towards the first system's bars", () => {
    const events = parseNoteList(`${mel} | C4:1 | C4:1`, { track: "mel" });
    const { abc } = notate(
      { events, meter: W44, key: C, bars: 6, staff: "treble", pickup: { units: [1, 1] } },
      { barsPerLine: 2 },
    );
    // Six cycles, two bars a system: the pickup and bars 1–2, then 3–4, then 5.
    const lines = abc.abc.trimEnd().split("\n").slice(-3);
    expect(lines.map((l) => (l.match(/\|/g) ?? []).length)).toEqual([3, 2, 1]);
  });
});

describe("bar numbers", () => {
  const melody = parseNoteList("r:2 C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | F4:2 D4:4 | C4:2 C4:4 | F4:2. ", {
    track: "mel",
    meter: W34,
  });
  const lead = leadSheetInput({ melody, meter: W34, key: F, bars: 6, pickup: { units: [1, 1] } });
  test("a lead sheet numbers each system from bar 0 (the pickup); other staves only when asked", () => {
    expect(notate(lead).abc.abc).toContain("%%barnumbers 0\n%%setbarnb 0\n");
    expect(notate(lead, { barNumbers: false }).abc.abc).not.toContain("%%barnumbers");
    const plain = notate({ ...lead, staff: "treble" });
    expect(plain.abc.abc).not.toContain("%%barnumbers");
    expect(
      notate({ ...lead, staff: "treble", pickup: undefined as never }, { barNumbers: true }).abc.abc,
    ).toContain("%%barnumbers 0\nK:");
  });
  test("a lead-sheet page that is not the end stretches its last system", () => {
    expect(notate(lead, { finalBar: false }).abc.abc).toContain("%%stretchlast 1");
    expect(notate(lead).abc.abc).not.toContain("%%stretchlast");
  });
});

describe("lead-sheet layout and pages", () => {
  test("bars a system by host width, fewer systems with a text line, staffwidth at the host's width", () => {
    expect(leadSheetLayout(1000)).toEqual({
      barsPerLine: 4,
      linesPerPage: 4,
      barsPerPage: 16,
      staffwidth: 740,
    });
    expect(leadSheetLayout(480)).toEqual({
      barsPerLine: 2,
      linesPerPage: 4,
      barsPerPage: 8,
      staffwidth: 440,
    });
    expect(leadSheetLayout(300, { textLines: 1 })).toEqual({
      barsPerLine: 1,
      linesPerPage: 3,
      barsPerPage: 3,
      staffwidth: 260,
    });
    expect(leadSheetLayout(0).barsPerLine).toBe(1);
  });
  test("pages: the first holds the pickup, only the last ends the song, leftovers stay with the page before", () => {
    const melody = parseNoteList(`r:2 C4:4${" | F4:2 A4:4".repeat(12)}`, { track: "mel", meter: W34 });
    const base = { melody, meter: W34, key: F, bars: 13, pickup: { units: [1, 1] as [number, number] } };
    const pages = leadSheetPages(base, leadSheetLayout(300, { textLines: 1 }));
    expect(pages.map((p) => [p.startBar, p.bars])).toEqual([
      [0, 4],
      [4, 3],
      [7, 3],
      [10, 3],
    ]);
    expect(pages.map((p) => p.abc.finalBar)).toEqual([false, false, false, true]);
    expect(pages.map((p) => p.input.endsPiece)).toEqual([false, false, false, undefined]);
    expect(pages.every((p) => p.abc.barNumbers && p.render.staffwidth === 260)).toBe(true);
    // 14 bars with two a system and three systems a page: the last bar would be alone, so it joins page 2.
    const two = leadSheetPages({ ...base, bars: 8 }, leadSheetLayout(480, { textLines: 1 }));
    expect(two.map((p) => [p.startBar, p.bars])).toEqual([[0, 8]]);
    for (const p of pages) {
      const { score, abc } = notate(p.input, p.abc);
      expect(score.pickup).toBe(p.startBar === 0);
      expect(abc.idMap[0]?.bar).toBe(p.startBar);
      expect(abc.abc).not.toMatch(/:\||\|:/);
    }
  });
});

describe("stacking chords in staff input", () => {
  const ctx = { meter: W44, key: C, bars: 1 };
  test("stack adds a member with the same onset and length; a duplicate changes nothing", () => {
    const first = editNoteList("C4:2 r:2", { op: "stack", eventId: "main|1|0/1|60|0", pitch: "E4" }, ctx);
    expect(first.list).toBe("[C4,E4]:2 r:2");
    const g = editNoteList(first.list, { op: "stack", eventId: "main|1|0/1|64|0", pitch: "G4" }, ctx);
    expect(g.list).toBe("[C4,E4,G4]:2 r:2");
    expect(g.score.staves[0]?.voices[0]?.bars[0]?.items[0]?.kind).toBe("chord");
    const dup = editNoteList(g.list, { op: "stack", eventId: "main|1|0/1|60|0", pitch: "E4" }, ctx);
    expect(dup.changed).toBe(false);
  });
  test("a pitch on a step the chord uses replaces that member (never two notes on one step)", () => {
    const r = editNoteList("[C4,E4,G4]:1", { op: "stack", eventId: "main|1|0/1|60|0", pitch: "Eb4" }, ctx);
    expect(r.list).toBe("[C4,Eb4,G4]:1");
    expect(r.score.warnings).toEqual([]);
  });
  test("delete takes one member out; the rest of the chord stays", () => {
    const r = editNoteList("[C4,E4,G4]:1", { op: "delete", eventId: "main|1|0/1|64|0" }, ctx);
    expect(r.list).toBe("[C4,G4]:1");
  });
  test("applyEdit refuses a stack on a missing note or a non-pitch", () => {
    const i = input({ events: parseNoteList("C4:1") });
    expect(applyEdit(i, { op: "stack", eventId: "nope", pitch: "E4" })).toBe(i);
    expect(applyEdit(i, { op: "stack", eventId: "main|1|0/1|60|0", pitch: "zz" })).toBe(i);
  });
});

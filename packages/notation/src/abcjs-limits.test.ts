// abcjs 6.7.2 parser facts the emitter depends on, pinned headlessly (abcjs.parseOnly needs no DOM).
// Promoted from spikes/s4-notation/abcjs-limits.test.ts, plus the facts the production emitter added.
import { expect, test } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: abcjs is CommonJS
const mod: any = await import("abcjs");
const abcjs = mod.default ?? mod;
const HEAD = "X:1\nM:4/4\nL:1/16\nK:C\n";
// biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
const tune = (abc: string): any => abcjs.parseOnly(abc)[0];
// biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
const notesOf = (t: any, s = 0, v = 0): any[] =>
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  t.lines[0].staff[s].voices[v].filter((e: any) => e.el_type === "note");
const parse = (body: string) => {
  const t = tune(HEAD + body);
  return { warnings: (t.warnings ?? []) as string[], notes: notesOf(t) };
};

test("import shape under Bun: named exports and default both exist", () => {
  expect(typeof mod.renderAbc).toBe("function");
  expect(typeof mod.default.renderAbc).toBe("function");
  expect(abcjs.signature).toBe("abcjs-basic v6.7.2");
});

test("one class decoration per element; its value may hold several classes; never inside chord brackets", () => {
  expect(parse("!class=oak-e0 oak-e1 oak-e2![CEG]8 z8 |]").notes[0].extraClass).toBe("oak-e0 oak-e1 oak-e2");
  expect(parse("!class=oak-e0!!class=oak-e1!C4 z12 |]").notes[0].extraClass).toBe("oak-e1");
  expect(parse("[!class=oak-e0!C!class=oak-e1!E]8 z8 |]").notes[0].extraClass).toBeUndefined();
  expect(tune(`${HEAD}C4 z12 |]`).warnings).toBeUndefined();
});

test("tuplets: (p:q:r single digits; the marker goes before decorations and chord symbols", () => {
  const ok = parse('(5:4:5CDEFG (7:4:7CDEFGAB (3"Cm7b5"!class=oak-e0!C4 C4 C4 |]');
  expect(ok.warnings).toEqual([]);
  expect(ok.notes.filter((n) => n.startTriplet).map((n) => n.startTriplet)).toEqual([5, 7, 3]);
  expect(ok.notes[12].extraClass).toBe("oak-e0");
  expect(parse("(11:8:11CDEFGABcdef z8 |]").warnings.length).toBeGreaterThan(0);
  expect(parse("(3:2:12CDEFGABcdefg z8 |]").notes[0].tripletR).toBe(1);
});

test("noteheads: !style=x! works per note inside chord brackets and with a class", () => {
  const { warnings, notes } = parse(
    "!class=oak-e0![!style=x!gc]4 !class=oak-e1!!style=x!g4 !open!!style=x!g4 z4 |]",
  );
  expect(warnings).toEqual([]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs pitch
  expect(notes[0].pitches.map((p: any) => p.style ?? null)).toEqual(["x", null]);
  expect([notes[1].extraClass, notes[1].style]).toEqual(["oak-e1", "x"]);
  expect(notes[2].decoration).toEqual(["open"]);
});

test("voices: %%score (A B) shares a staff, {…} braces a grand staff; voice ids may not contain _", () => {
  const two = tune(
    "X:1\nM:4/4\nL:1/16\n%%score (S1 S1v2)\nV:S1 stem=up\nV:S1v2 stem=down\nK:C\nV:S1\nc16|]\nV:S1v2\nx16|]",
  );
  expect(two.warnings).toBeUndefined();
  expect(two.lines[0].staff.length).toBe(1);
  expect(two.lines[0].staff[0].voices.length).toBe(2);
  expect(notesOf(two, 0, 1)[0].rest.type).toBe("invisible");
  const grand = tune(
    "X:1\nM:4/4\nL:1/16\n%%score {RH LH}\nV:RH clef=treble\nV:LH clef=bass\nK:C\nV:RH\nc16|]\nV:LH\nC,16|]",
  );
  // biome-ignore lint/suspicious/noExplicitAny: abcjs staff
  expect(grand.lines[0].staff.map((s: any) => s.clef.type)).toEqual(["treble", "bass"]);
  const bad = tune("X:1\nM:4/4\nL:1/16\n%%score (A A_2)\nV:A\nV:A_2\nK:C\nV:A\nc16|]\nV:A_2\nC16|]");
  expect((bad.warnings ?? []).length).toBeGreaterThan(0);
});

test("a percussion voice can drop the key signature with an inline [K:C clef=perc]", () => {
  const t = tune(
    "X:1\nM:4/4\nL:1/16\n%%score S1 DR\nV:S1\nV:DR clef=perc\nK:D\nV:S1\nf16|]\nV:DR\n[K:C clef=perc] c16|]",
  );
  // biome-ignore lint/suspicious/noExplicitAny: abcjs staff
  expect(t.lines[0].staff.map((s: any) => s.key.accidentals.length)).toEqual([2, 0]);
});

test("lyrics: a tied continuation takes a syllable, so it gets *; rests take none", () => {
  const t = tune(`${HEAD}C4- C4 z4 [CE]4 |]\nw:1 * 3`);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  expect(notesOf(t).map((n: any) => n.lyric?.map((l: any) => l.syllable).join("") ?? null)).toEqual([
    "1",
    "",
    null,
    "3",
  ]);
});

test("chord symbols: abcjs draws b and # as glyphs and keeps Unicode; annotations ^ and _ go above and below", () => {
  const { notes } = parse('"Cm7b5"C4 "Bb7#11"C4 "C°"C4 "^Swing 8ths""_IV"C4 |]');
  // biome-ignore lint/suspicious/noExplicitAny: abcjs chord
  expect(notes.map((n) => n.chord.map((c: any) => `${c.name}@${c.position}`))).toEqual([
    ["Cm7♭5@default"],
    ["B♭7♯11@default"],
    ["C°@default"],
    ["Swing 8ths@above", "IV@below"],
  ]);
});

test("beams follow adjacency only: a space ends the beam", () => {
  const { notes } = parse("C2D2E2F2 G2 A2 B2c2 |]");
  expect(
    notes.map((n) => `${n.startBeam ? "[" : ""}${n.pitches[0].name}${n.endBeam ? "]" : ""}`).join(" "),
  ).toBe("[C D E F] G A [B c]");
});

test("a one-line rhythm staff and a partial first bar parse cleanly", () => {
  const t = tune("X:1\nM:3/4\nL:1/16\nK:C clef=perc stafflines=1\nB4 | B4 B4 B4 | B8 |]");
  expect(t.warnings).toBeUndefined();
  expect(t.lines[0].staff[0].clef.stafflines).toBe(1);
});

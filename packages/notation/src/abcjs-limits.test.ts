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

// --- Wave 3: the rows of ABCJS_LIMITS (src/limits.ts) and the facts the annotation lines rely on ---------

const keyAcc = (k: string): string[] =>
  tune(`X:1\nM:4/4\nL:1/16\nK:${k}\nC16|]`).lines[0].staff[0].key.accidentals.map(
    (a: { acc: string; note: string }) => `${a.acc}${a.note.toUpperCase()}`,
  );

test("theoretical-key: K: past seven accidentals is silently another key; an explicit signature is right", () => {
  expect(keyAcc("G#")).toEqual(["flatB", "flatE", "flatA", "flatD"]);
  expect(keyAcc("Fb")).toEqual([]);
  expect(keyAcc("D#")).toEqual(["flatB", "flatE", "flatA"]);
  expect(keyAcc("C exp ^^f ^c ^g ^d ^a ^e ^b")).toEqual([
    "dblsharpF",
    "sharpC",
    "sharpG",
    "sharpD",
    "sharpA",
    "sharpE",
    "sharpB",
  ]);
  expect(keyAcc("C exp __b _e _a _d _g _c _f clef=bass")).toEqual([
    "dblflatB",
    "flatE",
    "flatA",
    "flatD",
    "flatG",
    "flatC",
    "flatF",
  ]);
  // Seven is still fine.
  expect(keyAcc("C#").length).toBe(7);
  expect(keyAcc("Cb").length).toBe(7);
  expect(keyAcc("A#m").length).toBe(7);
  expect(keyAcc("Abm").length).toBe(7);
});

test("same-step-chord: two notes on one staff step share a position (abcjs offsets the heads, one sign)", () => {
  const { warnings, notes } = parse("[F^F]8 z8 |]");
  expect(warnings).toEqual([]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs pitch
  expect(notes[0].pitches.map((p: any) => p.pitch)).toEqual([3, 3]);
});

test("lyric-per-element: ~ joins a chord's texts into one syllable; several w: lines stack as verses", () => {
  const t = tune(`${HEAD}[CEG]8 F8 |]\nw:1~3~5 4\nw:do~mi~sol fa`);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs lyric
  const lyr = notesOf(t).map((n: any) => n.lyric.map((l: any) => l.syllable));
  // abcjs turns ~ into a no-break space.
  expect(lyr).toEqual([
    ["1\u00a03\u00a05", "do\u00a0mi\u00a0sol"],
    ["4", "fa"],
  ]);
  expect(t.warnings).toBeUndefined();
});

test("w: lines follow their own voice on a grand staff; %%vocalfont parses cleanly", () => {
  const t = tune(
    "X:1\nM:4/4\nL:1/16\n%%vocalfont Helvetica 12\n%%score {RH LH}\nV:RH clef=treble\nV:LH clef=bass\nK:D\nV:RH\nf16|]\nw:3\nV:LH\nD,16|]\nw:1\n",
  );
  expect(t.warnings).toBeUndefined();
  // biome-ignore lint/suspicious/noExplicitAny: abcjs staff
  expect(t.lines[0].staff.map((s: any) => s.voices[0][0].lyric[0].syllable)).toEqual(["3", "1"]);
});

test("annotation-above: several ^ texts on one note become one stacked text; ♭ and ♯ are kept", () => {
  const { notes } = parse('"^♭3""^me"!class=oak-e0!_E16 |]');
  expect(notes[0].chord).toEqual([{ name: "♭3\nme", position: "above" }]);
  expect(notes[0].extraClass).toBe("oak-e0");
});

// --- Wave 4: chord labels, bar numbers with a pickup, key changes inside a bar ---------------------------

// biome-ignore lint/suspicious/noExplicitAny: abcjs element
const els = (t: any, s = 0, v = 0): any[] => t.lines.flatMap((l: any) => l.staff?.[s]?.voices[v] ?? []);

test("chord symbols: o becomes °, a slash chord keeps its bass; annotations below are printed as written", () => {
  const { warnings, notes } = parse('"Bo""_viio"B4 "G/B""_V65"B4 "Bbm7b5/Fb""_♭VII"C4 "_V64"C4 |]');
  expect(warnings).toEqual([]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs chord
  expect(notes.map((n) => n.chord.map((c: any) => `${c.name}@${c.position}`))).toEqual([
    ["B°@default", "viio@below"],
    ["G/B@default", "V65@below"],
    ["B♭m7♭5/F♭@default", "♭VII@below"],
    ["V64@below"],
  ]);
});

test("mid-bar-key-change: an inline [K:] inside a bar is a key element, and any barline before it is a measure", () => {
  const inline = tune(`${HEAD}C4 D4 [K:G] E4 F4 | G16 |]`);
  expect(inline.warnings).toBeUndefined();
  const types = els(inline).map((e) => e.el_type);
  expect(types).toEqual(["note", "note", "key", "note", "note", "bar", "note", "bar"]);
  expect(
    els(inline)
      .find((e) => e.el_type === "key")
      .accidentals.map((a: { note: string }) => a.note),
  ).toEqual(["f"]);
  // A double (or dotted, or invisible) barline before the change ends a measure: the bar would be split in two.
  for (const bar of ["||", ".|", "[|]"]) {
    const t = tune(`X:1\nM:4/4\nL:1/16\n%%barnumbers 1\nK:C\nC4 D4 ${bar}[K:G] E4 F4 | G16 |]`);
    expect(els(t).filter((e) => e.el_type === "bar").length).toBe(3);
  }
});

test("pickup-bar-numbers: %%barnumbers 0 numbers each system after the first; %%setbarnb 0 makes a pickup bar 0", () => {
  const body = "C4 | C16 | D16 | E16 |\nF16 | G16 |]";
  const plain = tune(`X:1\nM:4/4\nL:1/16\n%%barnumbers 0\nK:C\n${body}`);
  expect(plain.lines.map((l: { staff: { barNumber?: number }[] }) => l.staff[0]?.barNumber)).toEqual([
    undefined,
    5,
  ]);
  const pickup = tune(`X:1\nM:4/4\nL:1/16\n%%barnumbers 0\n%%setbarnb 0\nK:C\n${body}`);
  expect(pickup.warnings).toBeUndefined();
  expect(pickup.lines.map((l: { staff: { barNumber?: number }[] }) => l.staff[0]?.barNumber)).toEqual([
    undefined,
    4,
  ]);
  // A later page starts the count where it starts (and shows it on its first system).
  const page = tune(
    `X:1\nM:4/4\nL:1/16\n%%barnumbers 0\n%%setbarnb 5\n%%stretchlast 1\nK:C\nC16 | D16 |\nE16 |]`,
  );
  expect(page.warnings).toBeUndefined();
  expect(page.lines.map((l: { staff: { barNumber?: number }[] }) => l.staff[0]?.barNumber)).toEqual([5, 7]);
});

test("label-in-tuplet: the labels inside a tuplet ride on its notes; splitting the tuplet would need tied sub-tuplets", () => {
  const whole = parse('(5:4:5"C"C4 D4 "Dm"E4 F4 G4 |]');
  expect(whole.warnings).toEqual([]);
  expect(whole.notes.filter((n) => n.chord).map((n) => n.chord[0].name)).toEqual(["C", "Dm"]);
  // The split form parses, but as two five-in-four groups of three written items with a tie between them.
  const split = parse('(5:4:3"C"C D E/2- (5:4:3"Dm"E/2 F G z12 |]');
  expect(split.notes.filter((n) => n.startTriplet).map((n) => n.tripletR)).toEqual([3, 3]);
});

// --- Wave 5: the rows of ABCJS_LIMITS for form, swing, charts and c5 ------------------------------------------

test("lyrics-second-voice: each voice's w: lines are its own; a padding line of ~ is a blank syllable per note", () => {
  const t = tune(
    'X:1\nM:4/4\nL:1/16\n%%score (S1 S1v2)\nV:S1 stem=up\nV:S1v2 stem=down\nK:C\nV:S1\n"_I"e4 d4 c4 B4 |]\nw:3 2 1 7\nw:~ ~ ~ ~\nV:S1v2\n[CEG]16 |]\nw:1~3~5',
  );
  expect(t.warnings).toBeUndefined();
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  const v1 = t.lines[0].staff[0].voices[0].filter((e: any) => e.el_type === "note");
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  expect(v1[0].lyric.map((l: any) => l.syllable.replace(/\s/u, "_"))).toEqual(["3", "_"]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  const v2 = t.lines[0].staff[0].voices[1].filter((e: any) => e.el_type === "note");
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  expect(v2[0].lyric.map((l: any) => l.syllable.replace(/\s/gu, " "))).toEqual(["1 3 5"]);
});

test("unison-in-chord: [BB] parses as two heads on one step (Oak never writes it)", () => {
  const { notes } = parse("[BB]16 |]");
  // biome-ignore lint/suspicious/noExplicitAny: abcjs pitch
  expect(notes[0].pitches.map((p: any) => p.pitch)).toEqual([6, 6]);
});

test("text-over-chord-symbol: a ^text and a symbol on one note share it; Q: carries a text before the tempo", () => {
  const { notes } = parse('"^Swing 8ths""C7"C16 |]');
  // biome-ignore lint/suspicious/noExplicitAny: abcjs chord
  expect(notes[0].chord.map((c: any) => `${c.name}@${c.position}`)).toEqual([
    "Swing 8ths@above",
    "C7@default",
  ]);
  const t = tune('X:1\nM:4/4\nL:1/16\nQ:"Swing 8ths" 1/4=112\nK:C\nC16 |]');
  expect(t.warnings).toBeUndefined();
  expect(t.metaText.tempo.preString).toBe("Swing 8ths");
  expect(t.metaText.tempo.bpm).toBe(112);
  expect(tune('X:1\nM:4/4\nL:1/16\nQ:"Swing 16ths"\nK:C\nC16 |]').metaText.tempo.preString).toBe(
    "Swing 16ths",
  );
});

test("part-labels: an inline [P:] is a part element where it stands, also after a double barline and mid-line", () => {
  const t = tune(
    "X:1\nM:4/4\nL:1/16\n%%partsfont Helvetica 13 bold\nK:C\n[P:Verse]C16 || [P:Chorus 2]D16 |]",
  );
  expect(t.warnings).toBeUndefined();
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  const els = t.lines[0].staff[0].voices[0].map((e: any) =>
    e.el_type === "part" ? `P:${e.title}` : e.el_type,
  );
  expect(els).toEqual(["P:Verse", "note", "bar", "P:Chorus 2", "note", "bar"]);
  expect(t.formatting.partsfont?.face).toBe("Helvetica");
});

test("chart-off-beat-chord: style=rhythm gives slash heads per note; a symbol rides on a note", () => {
  const t = tune('X:1\nM:4/4\nL:1/16\nV:CH clef=treble style=rhythm\nK:C\n"C7"B4 B4 "F7"B4 B4 |]');
  expect(t.warnings).toBeUndefined();
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  const els = t.lines[0].staff[0].voices[0] as any[];
  expect(els[0]).toMatchObject({ el_type: "style", head: "rhythm" });
  expect(els.filter((e) => e.el_type === "note").map((e) => e.chord?.[0]?.name ?? "")).toEqual([
    "C7",
    "",
    "F7",
    "",
  ]);
});

test("blues-signature: K:Cm is three flats; a blues key is written K:C", () => {
  expect(keyAcc("Cm")).toEqual(["flatB", "flatE", "flatA"]);
  expect(keyAcc("C")).toEqual([]);
});

// --- Wave 6 ---------------------------------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: abcjs parse tree
const keysOf = (t: any): string[] =>
  t.lines[0].staff[0].voices[0]
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    .filter((e: any) => e.el_type === "key")
    // biome-ignore lint/suspicious/noExplicitAny: abcjs element
    .map((k: any) =>
      k.accidentals.map((a: { acc: string; note: string }) => `${a.acc} ${a.note.toUpperCase()}`).join(", "),
    );

test("key-change-naturals: an inline [K:] cancels the old signature with naturals, then writes the new one", () => {
  // D (F♯ C♯) to C: two naturals. C to A: three sharps, nothing to cancel. A to E: four sharps. E to D minor: the
  // four sharps cancelled, then B flat.
  expect(keysOf(tune(`${HEAD.replace("K:C", "K:D")}D16 || [K:C] C16 |]`))).toEqual(["natural F, natural C"]);
  expect(keysOf(tune(`${HEAD}C16 || [K:A] A16 || [K:E] E16 || [K:Dm] D16 |]`))).toEqual([
    "sharp F, sharp C, sharp G",
    "sharp F, sharp C, sharp G, sharp D",
    "natural F, natural C, natural G, natural D, flat B",
  ]);
  // F to G: the flat cancelled before the sharp.
  expect(keysOf(tune(`${HEAD.replace("K:C", "K:F")}F16 || [K:G] G16 |]`))).toEqual(["natural B, sharp F"]);
});

test("key-change-naturals: a change that starts a system is a courtesy signature at the end of the one before", () => {
  const t = tune(`${HEAD}C4 E4 G4 E4 | C16 ||\n[K:D] D4 F4 A4 F4 | D16 |]`);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  const first = t.lines[0].staff[0].voices[0].map((e: any) => e.el_type);
  expect(first.slice(-2)).toEqual(["bar", "key"]);
  expect(t.lines[1].staff[0].key.accidentals.map((a: { note: string }) => a.note)).toEqual(["f", "c"]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  expect(t.lines[1].staff[0].voices[0].some((e: any) => e.el_type === "key")).toBe(false);
});

test("key-change-at-system-break: the next system's signature repeats the naturals; the one after has none", () => {
  const t = tune(`${HEAD.replace("K:C", "K:D")}D16 | D16 ||\n[K:C] C16 | C16 |\nC16 | C16 |]`);
  const sig = (i: number) =>
    t.lines[i].staff[0].key.accidentals.map((a: { acc: string; note: string }) => `${a.acc} ${a.note}`);
  expect(sig(1)).toEqual(["natural f", "natural c"]);
  expect(sig(2)).toEqual([]);
  // Writing the key twice clears the new system but repeats a key that has accidentals at the end of the line.
  const twice = tune(`${HEAD.replace("K:C", "K:D")}D16 | D16 || [K:Dm]\n[K:Dm] D16 | D16 |]`);
  expect(twice.lines[1].staff[0].key.accidentals.map((a: { acc: string }) => a.acc)).toEqual(["flat"]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  expect(twice.lines[0].staff[0].voices[0].filter((e: any) => e.el_type === "key").length).toBe(2);
});

test("same-signature-key-change: [K:Am] after K:C is a key element with nothing to draw", () => {
  expect(keysOf(tune(`${HEAD}C16 | [K:Am] A16 |]`))).toEqual([""]);
});

test("modal-signature: K:Gmix and K:Ddor are the parent scale's signatures; the mode is not drawn", () => {
  const mix = tune("X:1\nM:4/4\nL:1/16\nK:Gmix\nG4 B4 d4 f4 |]").lines[0].staff[0].key;
  expect([mix.root, mix.mode, mix.accidentals.length]).toEqual(["G", "Mix", 0]);
  const dor = tune("X:1\nM:4/4\nL:1/16\nK:Ddor\nD4 F4 A4 B4 |]").lines[0].staff[0].key;
  expect([dor.root, dor.mode, dor.accidentals.length]).toEqual(["D", "Dor", 0]);
  const lyd = tune("X:1\nM:4/4\nL:1/16\nK:Flyd\nF4 A4 B4 c4 |]").lines[0].staff[0].key;
  expect(lyd.accidentals.length).toBe(0);
  const phr = tune("X:1\nM:4/4\nL:1/16\nK:Ephr\nE4 F4 G4 A4 |]").lines[0].staff[0].key;
  expect(phr.accidentals.length).toBe(0);
});

test("label-splits-held-note: a symbol needs a note or rest of its own; tied halves carry two chords", () => {
  const { warnings, notes } = parse('"Ab"C8- "Bb"C8 | "C"z8 "G7"z8 |]');
  expect(warnings).toEqual([]);
  // biome-ignore lint/suspicious/noExplicitAny: abcjs chord
  expect(notes.map((n) => (n.chord ?? []).map((c: any) => c.name).join())).toEqual(["A♭", "B♭", "C", "G7"]);
  expect(notes[0].pitches[0].startTie).toBeDefined();
  expect(notes[1].pitches[0].endTie).toBe(true);
});

test("tuplet-across-beats: a bar-wide (3:2:5 with dotted values parses; so do triplets per beat with ties", () => {
  const wide = parse("(3:2:5z4 E6 G6 c6 C2- | C16 |]");
  expect(wide.warnings).toEqual([]);
  expect([wide.notes[0].startTriplet, wide.notes[0].tripletR]).toEqual([3, 5]);
  const perBeat = parse("(3:2:2z4 E2- (3:2:2E4 G2- (3:2:2G4 c2- (3:2:2c4 C2- | C16 |]");
  expect(perBeat.warnings).toEqual([]);
  expect(perBeat.notes.filter((n) => n.startTriplet).map((n) => n.tripletR)).toEqual([2, 2, 2, 2]);
});

test("tie-out-of-the-last-bar: a tie with no note to end on parses without a warning", () => {
  const { warnings, notes } = parse("C4 D4 E4 F4- |]");
  expect(warnings).toEqual([]);
  expect(notes[3].pitches[0].startTie).toBeDefined();
});

test("ghost-notes: there is no ghost or parenthesised notehead; an unknown decoration is a warning", () => {
  expect(parse("!ghost!C4 z12 |]").warnings.join(" ")).toContain("Unknown decoration");
  // The notehead styles abcjs knows are whole-note styles: x (drums) parses, a parenthesis is not one of them.
  expect(parse("!style=x!C4 z12 |]").warnings).toEqual([]);
});

test("notehead-classes: a class inside chord brackets is dropped, so one chord member cannot be marked in ABC", () => {
  expect(parse("[!class=oak-guide!CE]8 z8 |]").notes[0].extraClass).toBeUndefined();
});

test("ABCJS_LIMITS: the Wave 6 rows are listed, and only the declared grid can warn", async () => {
  const { ABCJS_LIMITS } = await import("./limits.ts");
  const w6 = [
    "key-change-naturals",
    "key-change-at-system-break",
    "same-signature-key-change",
    "modal-signature",
    "label-splits-held-note",
    "tuplet-across-beats",
    "tie-out-of-the-last-bar",
    "notehead-classes",
    "ghost-notes",
    "declared-grid",
  ];
  for (const id of w6) expect(ABCJS_LIMITS.some((l) => l.id === id)).toBe(true);
  expect(ABCJS_LIMITS.filter((l) => w6.includes(l.id) && l.warns !== null).map((l) => l.id)).toEqual([
    "declared-grid",
  ]);
});

test("ABCJS_LIMITS: every row has an id, says what abcjs does and what Oak writes; ids are unique", async () => {
  const { ABCJS_LIMITS } = await import("./limits.ts");
  expect(new Set(ABCJS_LIMITS.map((l) => l.id)).size).toBe(ABCJS_LIMITS.length);
  for (const l of ABCJS_LIMITS) {
    expect(l.abcjs.length).toBeGreaterThan(20);
    expect(l.fallback.length).toBeGreaterThan(20);
  }
  for (const id of [
    "lyrics-second-voice",
    "unison-in-chord",
    "text-over-chord-symbol",
    "part-labels",
    "chart-off-beat-chord",
    "swing-compound",
    "blues-signature",
  ])
    expect(ABCJS_LIMITS.some((l) => l.id === id)).toBe(true);
});

// --- Wave 7 -------------------------------------------------------------------------------------------------------

test("ghost-notes: a cue-size voice (cue=on) scales the whole element, so a ghost snare under a hat cannot be small", () => {
  const t = tune("X:1\nM:4/4\nL:1/16\nK:C clef=perc\nV:1 cue=on\n[gc]4 z12 |]\n");
  expect(t.warnings).toBeUndefined();
  // biome-ignore lint/suspicious/noExplicitAny: abcjs element
  const scale = t.lines[0].staff[0].voices[0].find((e: any) => e.el_type === "scale");
  expect(scale.size).toBe(0.6);
  expect(parse("!(!C4 z12 |]").warnings.join(" ")).toContain("Unknown decoration");
});

test("slash-noteheads: !style=rhythm! per element; a tied piece without it is a normal head; a rest is never a slash", () => {
  const { warnings, notes } = parse(
    "!class=oak-e0!!style=rhythm!B6- B2 !style=rhythm!B4- !style=rhythm!B4 |]",
  );
  expect(warnings).toEqual([]);
  expect(notes.map((n) => n.style ?? null)).toEqual(["rhythm", null, "rhythm", "rhythm"]);
  expect(notes[0].extraClass).toBe("oak-e0");
  expect(parse("!style=rhythm!z4 B12 |]").notes[0].style).toBe("rhythm");
});

test("rhythm-bracket: an annotation above stands on a note or rest; a tuplet carries only its first number", () => {
  const { warnings, notes } = parse('"^3:2"(3:2:3B8 B8 B8 |]');
  expect(warnings).toEqual([]);
  expect(notes[0].chord).toEqual([{ name: "3:2", position: "above" }]);
  expect([notes[0].startTriplet, notes[0].tripletMultiplier]).toEqual([3, 2 / 3]);
  // No bracket syntax over plain notes: a "[" opens a chord, a slur is a slur.
  expect(parse("(B4 B4 B4 B4) |]").notes[0].pitches[0].startSlur).toBeDefined();
});

test("polymeter: an inline [M:3/4] in one voice parses without a warning and leaves both staves in 4/4", () => {
  const t = tune("X:1\nM:4/4\nL:1/16\nK:C\nV:A\nV:B\n[V:A] C4 C4 C4 C4 |]\n[V:B] [M:3/4] C4 C4 C4 | C4 |]\n");
  expect(t.warnings).toBeUndefined();
  // biome-ignore lint/suspicious/noExplicitAny: abcjs staff
  expect(t.lines[0].staff.map((s: any) => s.meter?.value?.[0])).toEqual([
    { num: "4", den: "4" },
    { num: "4", den: "4" },
  ]);
  expect(parse("!>!C4 z12 |]").notes[0].decoration).toEqual(["accent"]);
});

test("tuplet-ratio-text: (4:3:4 over a 3/4 bar scales four quarters into three beats", () => {
  const t = tune("X:1\nM:3/4\nL:1/16\nK:C\n(4:3:4B4 B4 B4 B4 |]\n");
  expect(t.warnings).toBeUndefined();
  const n = notesOf(t);
  expect([n[0].startTriplet, n[0].tripletMultiplier, n[0].tripletR]).toEqual([4, 0.75, 4]);
});

test("additive-meter: M:2+2+3/8 and M:3+2/4 parse as the groups over the denominator", () => {
  for (const [m, num, den] of [
    ["2+2+3/8", "2+2+3", "8"],
    ["3+2/4", "3+2", "4"],
    ["2+2+2+3/8", "2+2+2+3", "8"],
  ] as const) {
    const t = tune(`X:1\nM:${m}\nL:1/16\nK:C\nC2D2 E2F2 G2A2B2 |]\n`);
    expect(t.warnings).toBeUndefined();
    expect(t.lines[0].staff[0].meter.value[0]).toEqual({ num, den });
  }
});

test("jazz-chord-glyphs: b and # after a letter become ♭ and ♯; ∆ – ø ° are kept as written", () => {
  const { warnings, notes } = parse('"C7b9"C4 "F#7#11"C4 "D–7"C4 "C∆9"C4 |]');
  expect(warnings).toEqual([]);
  expect(notes.map((n) => n.chord[0].name)).toEqual(["C7♭9", "F♯7♯11", "D–7", "C∆9"]);
  expect(parse('"Cø7"C4 "C°7"C4 "C7/E"C4 "C6/9"C4 |]').notes.map((n) => n.chord[0].name)).toEqual([
    "Cø7",
    "C°7",
    "C7/E",
    "C6/9",
  ]);
});

test("ABCJS_LIMITS: the Wave 7 rows are listed; only the bracket that falls inside a tuplet warns", async () => {
  const { ABCJS_LIMITS } = await import("./limits.ts");
  const w7 = [
    "slash-noteheads",
    "rhythm-bracket",
    "polymeter",
    "tuplet-ratio-text",
    "additive-meter",
    "jazz-chord-glyphs",
  ];
  for (const id of w7) expect(ABCJS_LIMITS.some((l) => l.id === id)).toBe(true);
  expect(ABCJS_LIMITS.filter((l) => w7.includes(l.id) && l.warns !== null).map((l) => l.id)).toEqual([
    "rhythm-bracket",
  ]);
});

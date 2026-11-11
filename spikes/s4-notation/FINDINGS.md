# S4 — haps → NotationModel → ABC → abcjs, clock-driven highlighting

Status: **green**. Every goal was executed and observed (Bun 1.4.4, Vite 8.3.7, abcjs 6.7.2, tonal 6.5.1,
Strudel core/mini/tonal/transpiler 1.2.6, Playwright 1.65.0 headless Chromium). No missing dependencies.

## How to run

```sh
cd spikes/s4-notation
bun test .                                             # 37 tests, 21 snapshots (pure TS, headless Strudel + abcjs.parseOnly)
bun gen-fixtures.ts                                    # re-evaluate the corpus -> web/fixtures.json
bunx playwright test -c playwright.config.ts           # starts Vite dev on 5184, 6 browser tests, stops it
node ../../node_modules/vite/bin/vite.js build --config vite.config.ts
OAK_S4_MODE=preview bunx playwright test -c playwright.config.ts   # same 6 tests against the production build
../../node_modules/.bin/tsc -p tsconfig.json --noEmit  # strict base config, exit 0
```

Files: `quantize.ts` (events, key, spelling, quantizer → `Score`), `abc.ts` (`Score` → ABC + id map),
`strudel-eval.ts` (headless eval), `corpus.ts` (10 required + 11 extra patterns), `notation.test.ts`,
`tonal-api.test.ts`, `abcjs-limits.test.ts`, `__snapshots__/`, `web/` (page), `e2e.pw.ts` (Playwright),
`shots/dev-light.png`, `shots/dev-dark.png` (full-page screenshots of all 21 staves + grand staff).

## 1. Pure TS quantizer — proven

```
$ bun test .
 37 pass
 0 fail
 21 snapshots, 326 expect() calls
Ran 37 tests across 3 files. [153.00ms]
```

Every corpus entry is checked four ways: snapshot (ABC lines, model dump, spelled pitches, key, approximate
flag, warnings); `abcjs.parseOnly(abc)` returns **zero warnings**; the durations abcjs parsed (with its own
tuplet multipliers) add up to **exactly one bar per bar**; and the classes abcjs kept equal the event ids
emitted. The 10 required patterns also have literal expectations in `notation.test.ts`.

ABC bodies produced (header is always `X:1 / M:4/4 / L:1/16 / K:…`):

| # | Strudel | K: | ABC body |
|---|---|---|---|
| 01 | `note("c4 d4 e4 f4")` | C | `!class=oak-e0!C4 !class=oak-e1!D4 !class=oak-e2!E4 !class=oak-e3!F4 \|]` |
| 02 | `note("c4 [d4 e4] f4 g4")` | C | `!class=oak-e0!C4 !class=oak-e1!D2!class=oak-e2!E2 !class=oak-e3!F4 !class=oak-e4!G4 \|]` |
| 03 | `note("c4@3 d4")` | C | `!class=oak-e0!C12 !class=oak-e1!D4 \|]` |
| 04 | `note("<c4 e4> g4")` 2 bars | C | `!class=oak-e0!C8 !class=oak-e1!G8 \| !class=oak-e2!E8 !class=oak-e3!G8 \|]` |
| 05 | `note("c4 ~ d4 ~")` | C | `!class=oak-e0!C4 z4 !class=oak-e1!D4 z4 \|]` |
| 06 | `note("c4*3 e4")` | C | `(3:2:3!class=oak-e0!C4 !class=oak-e1!C4 !class=oak-e2!C4 !class=oak-e3!E8 \|]` |
| 07 | `n("0 2 4 6").scale("D4:major")` | D | `!class=oak-e0!D4 !class=oak-e1!F4 !class=oak-e2!A4 !class=oak-e3!c4 \|]` (spelled D4 F#4 A4 C#5) |
| 08 | `note("[c4,e4,g4] [f4,a4,c5]")` | C | `!class=oak-e0 oak-e1 oak-e2![CEG]8 !class=oak-e3 oak-e4 oak-e5![FAc]8 \|]` |
| 09 | `note("~ c4@1.5 d4@1.5")` | C | `z4 !class=oak-e0!C4- !class=oak-e0!C2!class=oak-e1!D2- !class=oak-e1!D4 \|]` |
| 10 | `n("0 1 2 3 4 5 6 7").scale("F#4:major")` | F# | `…F2…G2 …A2…B2 …c2…d2 …e2…f2 \|]` (spelled F#4 G#4 A#4 B4 C#5 D#5 **E#5** F#5) |

Extra cases (all snapshotted, all zero abcjs warnings):

| # | Strudel | ABC body (classes elided) |
|---|---|---|
| 11 | `note("f#4@5 f#4 f4 f#4").slow(2)` | `^F16- \| F4 ^F4 =F4 ^F4 \|]` — tie across the bar is not restated, the next F# is, `=` cancels |
| 12 | `note("[c4 d4 e4] f4 [g4 a4 b4] c5")` | `(3:2:3C2D2E2 F4 (3:2:3G2A2B2 c4 \|]` |
| 13 | `note("[c4 d4 e4 f4 g4] a4 b4 c5")` | `(5:4:5CDEFG A4 B4 c4 \|]` |
| 14 | `note("[c4 d4 e4 f4 g4 a4] c5 ~ c5")` | `(3:2:3CDE (3:2:3FGA c4 z4 c4 \|]` |
| 15 | `note("cs4 ef4 bf3 c")` | `^C4 _E4 _B,4 C,4 \|]` (C#4 Eb4 Bb3 C3) |
| 16 | `note("c4*11")` | snapped to 1/16, `approximate: true`, warning `bar 1: rhythm is not notatable (tuplet p > 9 or mixed ratios); snapped to 1/16` |
| 17 | `note("[c4 [d4 d4] e4] f4 g4")` | `(9:8:6C2DDE2 F6 G6 \|]` — triplet inside a bar-wide triplet combined into one 9:8 ratio |
| 17b | `note("[c4 [d4 d4] e4] f4")` | `(3:2:2C4 D2 (3:2:2D2 E4 F8 \|]` |
| 18 | `note("c4 d4 e4 f4 g4@3 a4 b4@2 c5@2 ~@4")` | `CDEF G3A B2c2 z4 \|]` |
| 19 | `note("c4@7 d4").slow(2)` | `C16- \| C12 D4 \|]` |
| 20 | `n("0 1 2 3").scale("Bb3:major")` | `K:Bb` `B,4 C4 D4 E4 \|]` (Bb3 C4 D4 Eb4) |

Lesson-declared key overrides `.scale()`: `n("0 2 4 6 2 2").scale("D4:major")` with `key: C major` gives
`(3:2:3 D4 ^F4 A4 (3:2:3 ^c4 F4 F4` — the accidental is written once per bar and octave.

### What the quantizer does (and the rules it encodes)

1. **Extract**: `hap.whole && hap.hasOnset()`, times from `whole.begin/end` as exact bigint rationals, then
   **sort** by (onset, midi). Event id = index after sorting.
2. **Slots**: events with equal onset and duration form one chord slot. Overlaps are cut with a warning
   (single voice only in the spike).
3. **Bars**: `bar = floor(onset)`; a slot crossing a barline becomes tied segments. Gaps become rests.
4. **Tuplet windows**: for every boundary that is off the binary grid, take the **smallest** aligned window
   (eighth, beat, half-bar, bar) where (a) the LCD of all boundaries relative to the window is `k·2^m` with
   `k ∈ {3,5,7,9}` and (b) no segment with an off-grid end crosses the window edge. `p = k`,
   `q = {3:2, 5:4, 7:4, 9:8}`, written length = sounding × p/q, `r` = number of written items.
   No valid window → snap the bar to 1/16 and set `approximate`.
5. **Durations**: note values `2^a` or `3·2^a` sixteenths (no double dots). A note never straddles the
   half-bar in 4/4 unless it starts the bar and is one value (`C12`, `C16`); a note starting off the beat is
   cut at the next beat; pieces are tied. Rests: largest aligned power of two, never dotted, never tied.
6. **Beams**: a space before every item that starts on a beat, starts or follows a tuplet, or is a quarter or
   longer. abcjs then beams the unspaced runs.
7. **Spelling**: key from the lesson, else from `hap.context.scale`, else none. Diatonic chroma → the key's
   pitch class via `Note.enharmonic(Note.fromMidi(midi), pc)` (fixes octaves: B#3, E#5, Cb4). Minor keys also
   try harmonic and melodic scale degrees. Non-diatonic: keep the source spelling if the code spelled the note,
   otherwise sharps for `alteration >= 0`, flats otherwise.
8. **ABC**: accidentals against the key signature plus bar state keyed by letter+octave (including `=`);
   a note tied in from the previous bar is not restated and does not change the bar state.

### tonal 6.5.1 — verified outputs (`tonal-api.test.ts`)

```
Note.midi("C4") = 60        Note.midi("c4") = 60       Note.midi("F#4") = 66     Note.midi("E#5") = 77
Note.midi("cs4") = null     Note.midi("ef4") = null    Note.get("bf3").empty = true   Note.get("fs4").empty = true
Note.midi("c") = null (no octave; Strudel plays c3)    Note.get("f4").name = "F4"
Note.fromMidi(61) = "Db4"   Note.fromMidiSharps(61) = "C#4"
Note.enharmonic("C#4") = "Db4"            Note.enharmonic("Db4","C#") = "C#4"
Note.enharmonic("F5","E#") = "E#5"        Note.enharmonic("C4","B#") = "B#3"     Note.enharmonic("B3","Cb") = "Cb4"
Note.enharmonic("C4","D") = ""  (wrong chroma: empty string, no throw)           Note.simplify("E#5") = "F5"
Key.majorKey("D")  -> scale [D E F# G A B C#], alteration 2, keySignature "##", chords [Dmaj7 Em7 F#m7 Gmaj7 A7 Bm7 C#m7b5]
Key.majorKey("F#") -> scale [F# G# A# B C# D# E#], alteration 6      Key.majorKey("Bb") -> [Bb C D Eb F G A], alteration -2
Key.minorKey("A").natural.scale = [A B C D E F G]   .harmonic.scale = [A B C D E F G#]   Key.minorKey("E").keySignature = "#"
Key.majorKey("D4").scale = [D E F# G A B C#]  (an octave on the tonic is tolerated)
Scale.get("D4 major").tonic = "D4"
AbcNotation.scientificToAbcNotation: "C#5" -> "^c", "Bb3" -> "_B,", "C4" -> "C", "C6" -> "c'", "C2" -> "C,,", "F##4" -> "^^F"
```

tonal **does reject** Strudel's `s`/`f` accidentals and octave-less names, so normalization is required:

```ts
export function normalizeNoteName(raw: string, defaultOctave = 3): string | null {
  const m = /^([a-gA-G])([#bsf]*)(-?\d+)?$/.exec(raw.trim());
  if (!m) return null;
  const letter = (m[1] as string).toUpperCase();
  const acc = (m[2] ?? "").replace(/s/g, "#").replace(/f/g, "b");
  return `${letter}${acc}${m[3] ?? String(defaultOctave)}`;
}
// cs4 -> C#4, ef4 -> Eb4, bf3 -> Bb3, f4 -> F4, ff4 -> Fb4, fs4 -> F#4, c -> C3
```

## 2. Browser page — proven (dev server and production build)

```
$ bunx playwright test -c playwright.config.ts
  ✓  1 e2e.pw.ts › import shape of the lazy-loaded abcjs chunk
  ✓  2 e2e.pw.ts › (a) every note carries its oak-e{id} class on the SVG group
  ✓  3 e2e.pw.ts › (b) clicking a note fires clickListener with startChar/endChar and the class
  ✓  4 e2e.pw.ts › (c) highlighting is driven by an external (fake) clock
  ✓  5 e2e.pw.ts › (d) grand staff and chord symbols render
  ✓  6 e2e.pw.ts › (e) dark mode through currentColor, without re-rendering
  6 passed (2.5s)
$ OAK_S4_MODE=preview bunx playwright test -c playwright.config.ts
  6 passed (2.1s)
```

The page runs the whole pipeline in the browser (`quantize.ts` + `abc.ts` + tonal bundled by Vite) on events
evaluated headlessly (`web/fixtures.json`), then renders 21 staves + 2 grand staves + a chord-symbol probe.

### Import shape of `await import('abcjs')` (identical in Vite dev, Vite build and Bun)

```
[dev]     {"namespaceKeys":["EditArea","Editor","TimingCallbacks","TuneBook","default","extractMeasures","numberOfTunes","parseOnly","pauseAnimation","renderAbc","renderEngine","setGlyph","signature","startAnimation","stopAnimation","strTranspose","synth","test","tuneMetrics"],"hasDefault":true,"defaultType":"object","namedRenderAbc":"function","defaultRenderAbc":"function","signature":"abcjs-basic v6.7.2","importMs":51}
[preview] same keys, hasDefault true, namedRenderAbc "function", defaultRenderAbc "function", importMs 60
```

abcjs is CommonJS (`main: index.js`, no `module`/`exports`), but the namespace carries **both** the named
exports and `default` (= `module.exports`). `const abcjs = await import("abcjs"); abcjs.renderAbc(...)` is
correct everywhere and matches the d.ts. Under `moduleResolution: "bundler"` `abcjs.default.renderAbc` also
type-checks (synthetic default), verified with `tsc` (`types-probe.ts`).

### (a) classes

`!class=oak-e{id}!` lands on the note's `<g>` **unprefixed**, after abcjs' own classes:

```
<g class="abcjs-note abcjs-d0-25 abcjs-p2 abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n2 oak-e2" fill="currentColor" stroke="none" data-name="note" selectable="true" tabindex="0" data-index="2">
  <path data-name="E" class="abcjs-notehead"/><path class="abcjs-stem" data-name="stem"/></g>
[dev] chord group classes: ["abcjs-note abcjs-d0-5 abcjs-p0 abcjs-p2 abcjs-p4 … abcjs-n0 oak-e0 oak-e1 oak-e2","abcjs-note abcjs-d0-5 abcjs-p3 abcjs-p5 abcjs-p7 … abcjs-n1 oak-e3 oak-e4 oak-e5"]
```

Asserted: one group per id in staff 01; **two** groups for each tied event in staff 09; chord noteheads are
`path.abcjs-notehead.abcjs-chord-pos-{1..n}` (low to high) inside the group; for all 21 staves every event id
of the model is found in the DOM and no rest carries a class.

### (b) click listener

```
[dev] click record: {"staff":"staff-01","startChar":55,"endChar":72,"abcText":"!class=oak-e2!E4 ","elType":"note","isRest":false,"classes":"abcjs-note abcjs-d0-25 abcjs-p2 abcjs-l0 abcjs-m0 abcjs-mm0 abcjs-v0 abcjs-n2 oak-e2 abcjs-note_selected","extraClass":"oak-e2","oakIds":[2],"hitIds":[2],"pitches":[2],"analysisKeys":["clickedClasses","clickedName","line","measure","name","parentClasses","selectableElement","staffPos","voice"],"analysisName":"note","clickedName":"E","clickedClasses":"abcjs-notehead","target":"mouseup:path","groupIsG":true,"chordPos":null,"argCount":6,"locations":[{"start":12,"end":14}]}
[dev] chord click record: {"staff":"staff-08","startChar":56,"endChar":91,"abcText":"!class=oak-e3 oak-e4 oak-e5![FAc]8 ","elType":"note",…,"extraClass":"oak-e3 oak-e4 oak-e5","oakIds":[3,4,5],"hitIds":[4],…,"clickedClasses":"","target":"mouseup:svg","groupIsG":true,"chordPos":2,"argCount":6,"locations":[{"start":21,"end":23}]}
[dev] rest click record: {"staff":"staff-05","startChar":38,"endChar":41,"abcText":"z4 ","elType":"note","isRest":true,"classes":"abcjs-rest abcjs-d0-25 …","oakIds":[],…,"analysisName":"rest","clickedName":"rests.quarter",…}
[dev] clicks after empty-space click: 3
[dev] tabindex=0; clicks after focus+Enter on .oak-e1 (dragging off): 3
```

- The listener receives **6** arguments; the 6th is the DOM event (`mouseup`).
- `abcElem.startChar/endChar` cover the decoration, the note and the trailing space. `abcElem.extraClass`
  holds the class string; the `classes` argument holds the full class attribute (plus `abcjs-note_selected`).
- `abcElem.abselem.elemset[0]` is the SVG `<g>` (checked: `groupIsG: true`).
- Full round trip proven: click → `oak-e2` → `idMap.get(2).locations` → `{start:12,end:14}` = `e4` in the
  Strudel source.

### (c) clock-driven highlighting

`setCycle(cycle)` looks up sounding event ids in the model (`activeEventIds`, wraps to the loop length) and
toggles `.oak-active`. No abcjs timing API is involved.

```
[dev] cycle 0.10: {"s01":[{"ids":["oak-e0"],"fill":"rgb(217, 72, 15)"}],"s09":[],"s04":[{"ids":["oak-e0"],…}],"s08":[{"ids":["oak-e0","oak-e1","oak-e2"],…}]}
[dev] cycle 0.55: {"s01":[{"ids":["oak-e2"],…}],"s09":[{"ids":["oak-e0"],…},{"ids":["oak-e0"],…}],"s04":[{"ids":["oak-e1"],…}],"s08":[{"ids":["oak-e3","oak-e4","oak-e5"],…}]}
[dev] cycle 1.30: {"s01":[{"ids":["oak-e1"],…}],"s09":[{"ids":["oak-e0"],…},{"ids":["oak-e0"],…}],"s04":[{"ids":["oak-e2"],…}],"s08":[{"ids":["oak-e0","oak-e1","oak-e2"],…}]}
[dev] 600 setCycle() calls over 21 staves: 38.2 ms
```

Three positions asserted: the rest in 09 lights nothing; the tied c4 lights **both** of its pieces; the
two-bar loop (04) reaches bar 2 at 1.30 while one-bar loops wrap. The computed fill of the notehead is the
highlight colour and inactive notes keep the foreground colour. Cost is about 3 µs per staff per call.

### (d) grand staff and chord symbols

```
[dev] grand staff: {"plain":{"staves":2,"clefs":["clefs.G","clefs.F"],"brace":1,"chords":["C∆7","D-7","G7","Ch7","B°7"],"chordHtml":["<tspan>C∆7</tspan>",…],"chordTag":"text","rhNotes":5,"lhNotes":5,"lhClass":"abcjs-note abcjs-d0-5 abcjs-p-10 abcjs-l0 abcjs-m1 abcjs-mm1 abcjs-v1 abcjs-n0 oak-e6","tempo":1},
                    "jazz":{…,"chordHtml":["<tspan>C<tspan>∆7</tspan></tspan>","<tspan>D<tspan>-7</tspan></tspan>",…]}}
[dev] chord symbols written -> displayed: C^7 -> C∆7 ; CM7 -> CM7 ; Cmaj7 -> Cmaj7 ; C-7 -> C-7 ; Cm7 -> Cm7 ; Ch7 -> Ch7 ; C07 -> Cø7 ; Cø7 -> Cø7 ; Cm7b5 -> Cm7♭5 ; Co7 -> C°7 ; Cdim7 -> Cdim7 ; Co -> C° ; C+ -> C+ ; Caug -> Caug ; Csus -> Csus ; C7sus4 -> C7sus4 ; F#-7 -> F♯-7 ; Bb7#11 -> B♭7♯11 ; Eb^9 -> E♭∆9 ; C/E -> C/E ; N.C. -> N.C.
```

`%%score {RH LH}` + `V:RH clef=treble` + `V:LH clef=bass` gives two staves, one brace, G and F clefs; the
left hand is `abcjs-v1` and keeps its `oak-e` class. `"C^7"` displays as `C∆7` (code points 43 2206 37).
`jazzchords: true` only wraps the quality in a nested (superscript) `<tspan>`; the text is the same.

### (e) dark mode

```
[dev] light: {"svgFillAttr":"currentColor","noteGroupFillAttr":"currentColor","notehead":"rgb(26, 26, 26)","stem":…,"staffLine":…,"clef":…,"bar":…,"beam":…,"tie":…,"tripletNumber":…,"tripletBracket":…,"keySig":…,"accidental":…,"chordText":…,"brace":…,"tempoText":"rgb(26, 26, 26)","svgCount":24}
[dev] dark:  {… every one of the 14 probes "rgb(230, 230, 230)" …,"svgCount":24}
```

Toggling `body.dark` (a CSS variable feeding `color`) recolours noteheads, stems, staff lines, clef, bar
lines, beams, ties, tuplet number and bracket, key signature, accidentals, chord text, brace and tempo with
**no re-render** (same SVG node). The highlight colour follows its own CSS variable.

## 3. Bundle size

```
$ node ../../node_modules/vite/bin/vite.js build --config vite.config.ts
✓ 189 modules transformed.
dist/index.html                  1.39 kB │ gzip:   0.71 kB
dist/assets/index-Cn11RR7k.js   56.99 kB │ gzip:  17.79 kB     <- tonal + quantizer + emitter + page + 31 kB fixtures
dist/assets/abcjs-CdcWVj8C.js  509.21 kB │ gzip: 149.27 kB     <- lazy chunk, created by the dynamic import alone
(!) Some chunks are larger than 500 kB after minification.
```

The abcjs chunk is 509 kB minified, 149 kB gzip (147 kB with `gzip -9`, 125 kB brotli -q 11). Vite bundles the
CJS source tree from `index.js` (synth and editor included; no tree-shaking), and the result is the same size
as the shipped `dist/abcjs-basic-min.js` (512 kB, 148 kB gzip). It costs nothing until the first staff is
shown. Raise `build.chunkSizeWarningLimit` to silence the warning.

## Code the production adapter should copy

```ts
// extract (packages/notation or the grader host)
const haps = pattern.queryArc(0, bars);                     // NOT time-ordered
const keep = haps.filter((h) => h.whole && h.hasOnset());
const onset = rat(h.whole.begin.s * h.whole.begin.n, h.whole.begin.d);   // fraction.js 5: s, n, d are BigInt
// then sort by (onset, midi) before assigning ids

// spell
const pc = keyPcs.find((p) => Note.chroma(p) === midi % 12);
const name = pc ? Note.enharmonic(Note.fromMidi(midi), pc) : alteration >= 0 ? Note.fromMidiSharps(midi) : Note.fromMidi(midi);

// emit: one decoration per element, several classes inside it; repeat it on every tied piece
abc += `!class=${item.eventIds.map((id) => `oak-e${id}`).join(" ")}!`;
abc += item.kind === "chord" ? `[${toks.join("")}]${len}` : `${toks[0]}${len}`;
if (item.tieToNext) abc += "-";
// tuplet marker goes BEFORE the decoration: `(3:2:3!class=oak-e0!C4 …`

// render (lazy)
const abcjs = await import("abcjs");
abcjs.renderAbc(el, abc, {
  add_classes: true,
  responsive: "resize",
  foregroundColor: "currentColor",   // already the default in 6.7.2
  selectionColor: "currentColor",    // stop abcjs recolouring the clicked note; style it yourself
  selectTypes: ["note"],
  clickListener,                      // (abcElem, tuneNumber, classes, analysis, drag, mouseEvent)
});

// click -> event ids (filter rests; resolve the chord member by geometry)
const clickListener = (abcElem, _tune, classes, analysis, _drag, ev) => {
  if (abcElem.rest) return;
  const ids = [...classes.matchAll(/oak-e(\d+)/g)].map((m) => Number(m[1]));
  const group = abcElem.abselem?.elemset?.[0];      // the <g>; do not look it up by class (ties share it)
  // nearest `.abcjs-notehead` to (ev.clientX, ev.clientY) -> its abcjs-chord-pos-N -> ids[N - 1]
};

// highlight from any clock
function setCycle(cycle) {
  const want = new Set(activeEventIds(score, cycle).map((id) => `oak-e${id}`));
  for (const n of el.querySelectorAll(".oak-active")) if (![...n.classList].some((c) => want.has(c))) n.classList.remove("oak-active");
  for (const c of want) for (const n of el.querySelectorAll(`.${c}`)) n.classList.add("oak-active");
}
```

```css
/* abcjs writes fill="currentColor" as an attribute, so a plain class rule wins */
.staff svg .oak-active { fill: var(--oak-hl); }
```

```ts
// content-validation gate, headless under Bun (no DOM needed)
const tune = abcjs.parseOnly(abc)[0];
expect(tune.warnings ?? []).toEqual([]);            // `warnings` is undefined when clean
// per-bar total: sum el.duration * (inside a tuplet ? first.tripletMultiplier : 1), counting first.tripletR notes
```

## Surprises and gotchas versus the research

1. **One class decoration per element, but it may hold several classes.** `!class=oak-e0 oak-e1 oak-e2![CEG]8`
   puts all three on the chord group. Two decorations: the last wins silently. Inside chord brackets
   (`[!class=a!C…]`) the class is **not applied** and no warning is raised (it ends up in `decoration`).
2. **`selectTypes: ['note']` also reports rests** (`el_type: "note"` with `.rest`). Filter in the listener.
3. **The centre of a hollow notehead is empty.** Clicking a half-note head gives `target: svg` and empty
   `analysis.clickedClasses`; abcjs still resolves the element by coordinates. `clickedClasses` is a
   `DOMTokenList`, not the `Array<string>` the d.ts claims. Use geometry to find the chord member.
4. **`foregroundColor` already defaults to `"currentColor"`**, and the root `<svg>` has
   `fill/stroke="currentColor"`. Setting `color` on the container is all dark mode needs; no extra CSS for
   `.abcjs-staff` or `.abcjs-chord`.
5. **Keyboard**: note groups get `tabindex="0"`, but Enter/Space only fire the listener when `dragging: true`
   (source: `write/interactive/selection.js`). Focus+Enter did nothing in the test.
6. **`responsive: 'resize'` takes over the container**: it adds class `abcjs-container` and inline
   `display:inline-block; position:relative; width:100%; padding-bottom:12.3103%; overflow:hidden`, and the
   SVG is `position:absolute` with `viewBox="0 0 770 …"`. Give abcjs its own `<div>`; a pointer layer for
   staff input must be a sibling positioned over it. Short tunes are not stretched to the full width.
7. **`queryArc` does not return haps in time order** (`<c4 e4> g4` over 2 cycles returns c4, e4, g4, g4).
8. **`hap.context.scale` is `"D4 major"`** (space, octave kept), usable for key inference;
   `hap.context.locations` for `n(...).scale(...)` has 3 ranges (scale-type token, tonic token, the `n` digit), in that order.
9. **abcjs loads and `parseOnly` works under Bun with no DOM**, and the parse tree exposes `extraClass`,
   `startBeam/endBeam`, `startTriplet/tripletMultiplier/tripletR`. That makes structural checks cheap.
10. **Chord display**: `^`→`∆` (U+2206), `0`→`ø`, `o`→`°`, `b`→`♭`, `#`→`♯`; `h7`, `-7`, `M7`, `maj7`, `dim7`
    print as written, and `ø7` passes through. So `h7` must be rewritten (`07` or `ø7`) before emission. In
    the default font the `♭`/`♯` glyphs render with wide gaps (`Cm7 ♭ 5`, see `shots/dev-light.png`); a
    `gchordfont` choice will be needed.
11. **tonal**: `Note.enharmonic(note, pc)` returns `""` for a wrong chroma; `"f4"` is the note F4, so only
    characters after the letter may be treated as `s`/`f` accidentals.
12. abcjs' d.ts has no `extraClass` on `AbcElem` and a 5-argument `ClickListener`; `types/abcjs-ext.d.ts`
    must add `extraClass?: string`, `rest?`, `abselem.elemset` and the 6th argument.

## Tuplet and beaming limitations hit

- abcjs accepts only single digits in `(p:q:r`: `(11:8:11` produces 9 warnings and no tuplet; `(3:2:12` is read
  as `r = 1`. Pinned in `abcjs-limits.test.ts`. The quantizer therefore snaps bars needing `p > 9` to 1/16
  and sets `approximate` (case 16), and flags `r > 9` as approximate instead of splitting the group.
- No nested tuplets in abcjs. Combining ratios works (case 17 → `(9:8:6`, renders one bracket marked 9), but a
  9-bracket over dotted quarters is hard to read; content should probably avoid it or mark it approximate.
- The smallest-window rule writes a quarter triplet with a split middle as two brackets
  (`(3:2:2C4 D2 (3:2:2D2 E4`, case 17b). Correct, but one `(3:2:4` bracket may read better. Not decided.
- If a later boundary needs a larger window that overlaps an already chosen one, the spike gives up and snaps
  the bar instead of merging windows.
- abcjs beams by adjacency only; the emitter controls beams with spaces (verified through `startBeam/endBeam`:
  `C2D2E2F2 G2 A2 B2c2` → `[C D E F] G A [B c]`). Two tuplet groups in one beat get separate beams (case 14).
- Rests inside tuplets are never dotted; no double-dotted values are produced anywhere.

## Fallbacks chosen

- Not notatable → snap to the 1/16 grid, `approximate: true`, human-readable warning (proven, case 16).
- Overlapping events with different durations → cut the earlier one, warning, `approximate: true` (code path
  present, not exercised by the corpus).
- Chord member of a click → geometry on `.abcjs-notehead` boxes instead of `analysis.clickedClasses`.
- No dependency was missing; nothing was installed.

## Open items

- **Event ids**: the spike uses the index after sorting. Production needs the contract's `EventId` (stable
  across re-evaluation) in the class name.
- **Second voice / grand staff in the emitter**: the grand staff was proven with hand-written ABC only;
  register or track splitting and `V:` overlays for unequal durations are not implemented.
- **Meters**: only 4/4 is exercised. The x/4 path exists; compound meters, pickup bars and swing are not done.
- **Key context**: only major/minor from `context.scale`; modes (`K:D dor`) and `Scale.detect` are not done.
- **Spelling policy** for non-diatonic notes (keep source spelling vs. respell `voicing()` flats; chord-tone
  spelling) needs a decision; the spike keeps the source spelling.
- **Half-bar rule** is strict: quarter–half–quarter syncopation becomes two tied quarters. Decide whether to
  allow the common exceptions.
- **Chord-symbol translation** layer and a chord font without the `♭`/`♯` gaps.
- **Real clock**: the page uses a fake cycle position; wiring to Strudel's scheduler belongs to the
  Workbench (S2). `setCycle` is cheap enough for a per-frame call.
- **Layout**: `staffwidth`, wrapping and line breaks for long scores were not explored (4 bars per line).
- **Keyboard selection** needs either `dragging: true` or Oak's own key handler on the note groups.

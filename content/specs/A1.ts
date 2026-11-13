// A1 Sound Design, the side lessons A1.L01–L04: the spec (rendered to content/specs/A1.md by
// `bun scripts/content/spec.ts`). A1.L05–L07 open after U09.CP and are specified in a later wave (`covers`).
// Every hook was evaluated with headless Strudel and linted at its lesson; every superdough default quoted
// below was read from node_modules/superdough (synth.mjs, helpers.mjs, superdough.mjs, superdoughoutput.mjs).
// A1.L01 is the exemplar, written and passing with the real grader (content/advanced/A1/L01).
import type { UnitSpec } from "./types.ts";

const C = { tonic: "C", mode: "major" } as const;
const BPM = 100;
const T = `setcpm(${BPM}/4)\n\n`;

/**
 * What every A1 side lesson may use: only what U03.L02 guarantees in every legal order (contracts §3.1 rule
 * 10). No `ebass`, no `,` inside mini-notation (U04.L03), no `.add()`, no chords by name.
 */
const BASE = [
  "tb.setcpm",
  "tb.label",
  "tb.mini.seq",
  "tb.mini.rest",
  "tb.mini.sub",
  "tb.mini.alt",
  "tb.mini.repeat",
  "tb.gain",
  "tb.s",
  "tb.s.pitched",
  "tb.n",
  "tb.scale",
  "scale.major",
  "tb.note",
  "tb.note.names",
  "snd.drum.bd",
  "snd.drum.sd",
  "snd.drum.hh",
  "snd.wave.sine",
  "snd.wave.triangle",
  "snd.wave.square",
  "snd.wave.sawtooth",
] as const;
/** What A1.L01 unlocks; A1.L02–L04 follow it in every legal order (a track's lessons are in order). */
const L01 = ["tb.scope", "tb.partials"] as const;
const L02 = ["tb.lpf", "tb.hpf", "tb.bpf", "tb.lpq", "tb.lpenv"] as const;

/** The A1 loop: the learner's kind of loop (C1's shape), over the Band's chords C | F. */
const DRUMS = 'kick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").gain(.5)';
const BASS = 'bass: note("<[c2 ~ c2 g1] [f1 ~ f1 c2]>")';
const RIFF = 'mel: n("<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 0 ~]>").scale("C4:major")';
const loop = (bass: string, riff: string, drums = DRUMS) => `${T}${drums}\n${BASS}${bass}\n${RIFF}${riff}`;

export const A1: UnitSpec = {
  unit: "A1",
  title: "Sound Design (side lessons A1.L01–L04)",
  covers: ["A1.L01", "A1.L02", "A1.L03", "A1.L04"],
  summary:
    "Four optional side lessons on the sound of the learner's own loop. They open once U03.L02 is done (contracts §2.6, §4.3) and may be taken on any day after it, at any point of the course; they never gate anything and nothing in the core waits for them. Each is one session's New block within §9.2 and each starts from the same loop, the A1 loop: kick, snare, hats, a bass in note names and a two-bar riff in degrees over the Band's chords, the shape of the learner's C1 loop. A1.L01 gives its bass and riff waves with harmonics (and shows the waves on Oak's scope), A1.L02 filters them, A1.L03 shapes each note in time, A1.L04 puts the parts in a room and gives the riff echoes in time. By the end of A1.L04 the loop the learner started with sounds like a record. In order inside the track (A1.L02 opens after A1.L01, and so on, wave5.md §5.1); each lesson counts 1 in track A, a streak day and 1 in the pace estimate (§9.6), never in the core map.",
  conventions: [
    "Written for the learner at the gate. A side lesson is judged at the earliest point it can be taken, just after U03.L02 (AUTHORING §18.5): tools in every legal order are U03.L02's (labels, `setcpm`, mini-notation without `,`, `.gain()`, `s`, `note` with names and accidentals, `n` with `.scale()`, the drums, the four waves, `.room()`, `.clip()`) plus what A1 itself unlocks (`tb.scope` and `tb.partials` from A1.L01, the filters from A1.L02, `tb.adsr` from A1.L03); terms through `laterTerms`; singing, if any, on numbers. A learner at U11 reads the same lesson, so nothing in it may look backward at their level either: no chords by name, no numerals, no minor, no `arrange()`, no `.add()`, no `,` inside mini-notation (U04.L03; stack lines with labels), no `ebass` (C1.S1 or U03.L03; the bass is a synth wave). `.lpf()` is A1.L02's own alternative site (contracts §3.1 rule 11), so A1.L01 never uses it and A1.L02–L04 do.",
    'The A1 loop, in C major at 100 BPM, over `band.two-chord-vamp` with `tracks: ["chords"]` (I | IV, C | F): `kick: s("bd ~ bd ~")`, `snare: s("~ sd ~ sd")`, `hats: s("hh*8").gain(.5)`, `bass: note("<[c2 ~ c2 g1] [f1 ~ f1 c2]>")` (root, root, the 5th below) and `mel: n("<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 0 ~]>").scale("C4:major")` (G G E G – E C – | A A F A – F C –: every note on a beat is in the Band\'s chord). Each lesson\'s Make starts from the loop as the previous lesson leaves it (A1.L01: on sines; A1.L02: sawtooth bass and square riff, unfiltered; A1.L03: filtered; A1.L04: shaped and dry), and its brief invites the learner to paste a loop of their own instead: the rubric reads only what the lesson taught, so any loop with a bass and a tune works.',
    'Today describes the offer in one sentence (wave5.md §5.1; the session engineer\'s chip and the Coda\'s "one more" use it): "Optional side lesson, about 15 minutes: {title}. {offer}" with the offer line each lesson\'s notes give. Never "required", never a count of side lessons left, never shown on a checkpoint or capstone day or during a return warm-up. Example: "Optional side lesson, about 15 minutes: Waves & Harmonics. Hear why a sawtooth bass sounds bigger than a sine, and give your loop\'s bass and riff their colour."',
    "Oak's scope panel. `.scope()` at the end of a line (unlocked by A1.L01) opens the panel and draws the master bus's wave (contracts §3.1 rule 9; the grader stubs it to identity). That works today, so every step that shows a wave writes `.scope()` in its code. A step may also open the panel itself (`initialPanels: [\"scope\"]`, feature `panel.wave5`) and draw a probe beside the sound (`ui.probe`, feature `step.probe`: `harmonics` needs `tb.partials`, `filter` needs `tb.lpf`, `envelope` needs `tb.adsr`); both are PLANNED until the lesson host and the Workbench list them, so a step that needs them says so in `features` and keeps working with `.scope()` alone. The spectrum panel (`.fscope()`, `\"spectrum\"`) is `tb.fscope`, A2.L01's: no A1 lesson opens it; A1.L01's harmonics are the `harmonics` probe and the scope's measured harmonic levels (wave5.md §3.4).",
    "Only controls the S3 audibility harness marks audible are taught or required (packages/strudel/audibility.json, contracts §3.1 rule 7): `tb.partials`, `tb.lpf`, `tb.hpf`, `tb.bpf`, `tb.lpq`, `tb.lpenv` (with `lpa lpd lps lpr`), `tb.adsr`, `tb.room`, `tb.roomsize`, `tb.delay`, `tb.delaytime`, `tb.delayfeedback`, `tb.orbit` are all `true`. `tb.scope` is a view, not a control (`audible: false`); content:check lists it as pending in check 10 until that check exempts view rows. The silent no-ops (`leslie`, `lrate`, `lsize`, `amp`, `squiz`, `triode`, `ring`) never appear.",
    "Superdough facts the lessons rest on (read from the installed package; the sound engineer pins them in `@oak/strudel/probes`): `.partials([…])` builds the wave from its list, one entry per harmonic from the first, each multiplying the wave's own level (sawtooth 1/n, square odd 1/n, triangle odd 1/n²), and does nothing on `sine`; `s(\"user\")` is not in Oak's toolbox. The low-pass filter is a 12 dB/octave biquad, Q 1 unless `.lpq()` sets it. `.lpenv(n)` opens the cutoff n octaves above `.lpf()` on each note with the filter envelope's defaults attack 0.005 s, decay 0.14 s, sustain 0, release 0.1 s (a pluck). A synth note with no envelope control set uses attack 0.001, decay 0.05, sustain 0.6, release 0.01; set only `.decay()` and the sustain falls to nothing (a pluck); set only `.attack()` or only `.release()` and the sustain is 1. `.delaytime()` is in seconds (at 100 BPM a beat is 0.6, an eighth 0.3, three quarters of a beat 0.45); left out, it is 3/16 of a bar, which at 100 BPM is 0.45; `.delayfeedback()` defaults to 0.5 and is capped at 0.98. `.roomsize()` is the reverb's length, about 2 when left out. Every orbit has ONE reverb and ONE delay: `.room()` and `.delay()` are each part's send, but the room size, delay time and feedback are the orbit's, set by whichever note wrote them last; `.orbit(2)` gives a part its own.",
    'Grading. A sound cannot be graded by its notes, so the "match this sound" steps use the `controls` matcher (PLANNED: `{ m: "controls", track, controls: [{ control, scale, tol }] }`, AUTHORING §18.5): `lpf`, `roomsize` on a `log` scale in octaves (tol 0.5 = within half an octave), `lpq`, `lpenv`, `attack`, `decay`, `sustain`, `release`, `delaytime`, `delayfeedback` on a `linear` scale, `orbit` and `s` `exact`. Until the grader lists it, an author grades the same step as A1.L01 S5 does, which content CI accepts today: an `events` match on the notes (they must not change) plus an `arg-matches` constraint on the control\'s argument (a regex over the number, generous enough for equivalent spellings), with the feedback override naming the control; switch to `controls` when it lands. The Makes require one `uses` rule (implemented) on the lesson\'s new tool; `sounds`, `tracks` and other `uses` rules are suggestions. Ear steps draw on `fam.snd.params` (seeded by A1.L02; levels 1 cutoff, 2 resonance, 3 attack and release (A1.L03), 4 room and delay (A1.L04), 5 two changes).',
    'Terms (eight, all in content/terms.ts): "frequency" and "harmonic series" (A1.L01), "filter", "cutoff" and "resonance" (A1.L02), "envelope" (A1.L03), "delay" and "feedback" (A1.L04). "Waveform", "timbre", "reverb" and "octave" are the learner\'s already (U00–U02). Words that wait: "spectrum" (A2.L01), "LFO" and "modulation" (A1.L06), "saturation" (A1.L05), "mix" as a term (A2.L05), "attack" and friends are plain English until A1.L03 names the envelope. Hertz are taught as "times a second" first.',
    "Scaffolds: roll on where notes matter, staff off (a sound lesson; the U03–U04 rule of at most two of roll, staff and keyboard holds). No singing step: these are sound lessons, and a learner at U03 sings on numbers only. Flavours change nothing here: the learner's synth sounds are the point, and the Band's chords carry the flavour's sound.",
  ],
  lessons: [
    {
      id: "A1.L01",
      author: "spec-A1",
      idea: "Every pitched note is a stack of sine waves at 1, 2, 3, 4 … times its frequency, the harmonic series, and a wave's colour is which harmonics it has and how loud: a sine only the first, a square and a triangle the odd ones, a sawtooth all of them. `.scope()` shows the shape; `.partials([…])` chooses the harmonics.",
      hook: {
        hear: "The A1 loop twice within 20 seconds: bass and riff on sines (thin, far away), then the same notes with the bass on a six-harmonic sawtooth and the riff on a square (full, close).",
        code: loop(
          '.s("sawtooth").partials([1, 1, 1, 1, 1, 1])',
          '.s("square").partials([1, 1, 1, 1, 1]).gain(.8)',
        ),
      },
      key: C,
      meter: "4/4",
      bpm: BPM,
      canDo: ["cd.code.harmonics"],
      uses: [...BASE, ...L01, "tb.note.accidentals"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Thin or full: the A1 loop with bass and riff on sines, then on a six-harmonic sawtooth and a square. Same notes, same drums.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: 'One c3 on each wave in turn, a bar each (`.s("<sine triangle square sawtooth>")`): which bar will sound the brightest? (`choose`: the sawtooth)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["number", "choice"],
          minutes: 1,
          what: "The same four bars with `.scope()`: which bar draws a smooth, round curve (number: 1); which wave climbs slowly and drops straight down (choice: sawtooth). Pass text names each wave by its shape.",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["number", "choice"],
          minutes: 1,
          what: 'Bar 1: a2 on a sawtooth; bar 2: a2 a3 e4 a4 c#5 e5 on a sine with `.scope()`, the first six harmonics of a2 on the nearest keys (110, 220, 330, 440, 550, 660 Hz; e4 is 329.6, c#5 554.4, e5 659.3). a2 repeats 110 times a second: how many times does a3? (number: 220); how do the six notes climb? (choice: "each adds about another 110").',
          term: "term.frequency",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: 'Build a sawtooth: the riff over the drums on `.s("sawtooth").partials([1, ⟪0, 0, 0⟫])` (sounds like a sine) → `[1, 1, 1, 1]`. Graded: `events` (absolute, `tracks: ["mel"]`: the notes do not change) + `arg-matches` on `partials` argument 0 (four 1s, trailing 0s allowed) + edit-only-regions. Equivalent: `[1,1,1,1]`.',
          term: "term.harmonic-series",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "Odd ones only: the A1 bass line on a square, heard without the code. Sine (harmonic 1 only), square (the odd harmonics) or sawtooth (every one)? Hint 3 replays it at 0.75.",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Voice your loop: the A1 loop on sines; give the bass and the riff waves with harmonics and choose at least one part's harmonics with `.partials()`.",
        },
      ],
      wrapAt: 5,
      make: {
        brief:
          "Your kind of loop, with the bass and the riff on a sine. Give each a wave with harmonics, and choose the harmonics of at least one with `.partials()`: a full bass under a riff that cuts through. Add `.scope()` to a line to see it.",
        required: {
          rule: "uses",
          label: "One part's harmonics chosen with .partials()",
          why: "`uses` `tb.partials` (min 1): the lesson's new tool. The starter (all sines) fails; so does a loop that only swaps the waves. The brief and hint 2 say `.partials()` works on a sawtooth, square or triangle (on a sine it changes nothing).",
        },
        suggestions: [
          'a part on a wave with harmonics (`sounds`, `anyOf: ["snd.wave.sawtooth", "snd.wave.square", "snd.wave.triangle"]`)',
          'drums, a bass and a riff (`tracks`, `min: 3`, `roles: ["drums", "bass", "melody"]`)',
        ],
        band: "band.two-chord-vamp",
        tracks: ["chords"],
        flavours: "No sound swaps: the waves are the lesson. The Band's chords carry the flavour.",
      },
      srs: [],
      mistakes: [
        "S5: harmonic 4 left off (`[1, 1, 1, 0]`): `code.arg-mismatch`, overridden to say four 1s",
        "S5: the sawtooth's own levels written in (`[1, .5, .33, .25]`, which makes harmonics 2–4 quieter twice over): `code.arg-mismatch`",
        "S5: the riff's notes changed: `code.edit-outside` (and `melody.wrong-degree`, overridden with numbers: before U03.L08 the catalog text names syllables)",
        "S5 unchanged: `code.unchanged`",
        "S6: sawtooth or sine for the square: `id.wrong`, overridden to name the odd harmonics",
        'Make starter, and new waves without `.partials()`: `rubric.unmet` ("{label}: not yet.")',
      ],
      connects: {
        back: 'U02.L06 named the four waves ("waveform") by ear; U02.L01 heard the octave as the same note higher; U03.L02 wrote the riff in degrees.',
        forward:
          "A1.L02 takes the harmonics away again, gradually: a filter keeps the low ones and cuts the rest, which is how the raw sawtooth bass of this Make becomes a record's bass.",
      },
      epr: {
        enjoyment:
          "The learner's own kind of loop goes from a thin sine demo to a full bass and a riff with an edge, with harmonics they picked, and they can see each wave move on the scope while it plays.",
        pace: "One idea: a sound is a stack of harmonics and its colour is the mix. Filters, envelopes and effects wait for A1.L02–L04; the spectrum panel waits for A2.L01; hertz appear only as times a second.",
        return:
          "The Coda says: you can see a wave's shape, hear its harmonics and choose them with `.partials()`. Next, whenever you like: A1.L02 filters, which turn a raw sawtooth into a record's bass.",
      },
      notes: [
        'Today offer: "Hear why a sawtooth bass sounds bigger than a sine, and give your loop\'s bass and riff their colour."',
        "The exemplar: content/advanced/A1/L01 passes every content-CI section with the real grader (check 10 lists `tb.scope` as pending: a view row the audibility harness cannot prove). Evaluated: the hook's events carry `partials: [1, 1, 1, 1, 1, 1]` on the bass and `[1, 1, 1, 1, 1]` on the square riff; `.scope()` lints at A1.L01 and is identity in the grader realm.",
        'Build upgrades, not required to ship: open the panel from S3–S5 with `initialPanels: ["scope"]` (feature `panel.wave5`) and draw the `harmonics` probe beside S4 and S5 (`ui.probe: { kind: "harmonics", track: "mel" }`, feature `step.probe`) once the lesson host lists them; until then the learner\'s `.scope()` opens the panel. S5 moves to the `controls` matcher only if it can compare a list (it cannot today: `partials` stays `arg-matches`).',
        "Physics, checked: a2 = 110 Hz and its harmonics 220, 330, 440, 550, 660 sound as a3, ≈e4, a4, ≈c#5, ≈e5 (14 cents high at c#5); a square has harmonics 1, 3, 5 … at 1/n, a triangle 1, 3, 5 … at 1/n², a sawtooth every one at 1/n. A bass with harmonics carries on small speakers because the ear hears the low note through the harmonics above it.",
      ],
    },
    {
      id: "A1.L02",
      author: "A1",
      idea: "A low-pass filter lets a sound's low harmonics through and takes away those above its cutoff: lower the cutoff and the sound gets darker (`.lpf()`; `.hpf()` takes the lows away instead, `.bpf()` keeps a band). Resonance (`.lpq()`) adds a ringing peak at the cutoff, and a filter envelope (`.lpenv()` with `.lpa() .lpd() .lps() .lpr()`) moves the cutoff on every note: the pluck of a synth riff.",
      hook: {
        hear: "The A1 loop as A1.L01 left it (a raw sawtooth bass, a bright riff), then with the bass under `.lpf(400).lpq(4)` and the riff plucked by a filter envelope; both within the first 20 seconds.",
        code: loop('.s("sawtooth").lpf(400).lpq(4)', '.s("sawtooth").lpf(300).lpenv(4).lpd(.2).gain(.8)'),
      },
      key: C,
      meter: "4/4",
      bpm: BPM,
      canDo: ["cd.code.filters"],
      uses: [...BASE, ...L01, ...L02],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Raw and filtered: the A1 loop with a raw sawtooth bass and riff, then the bass under a low-pass and the riff plucked.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: 'The riff on a sawtooth with `.lpf("<4000 2000 1000 500>")`, a bar each: what happens bar by bar? (`choose`: it gets darker / it gets quieter but keeps its colour / it gets higher)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          features: ["step.probe"],
          what: 'The same with `.scope()` and the `filter` probe (`ui.probe: { kind: "filter", track: "mel" }`; without the probe the scope alone shows the wave smoothing out): which harmonics go first as the cutoff falls (choice: the highest); the riff\'s G4 is about 392 Hz, so with `.lpf(1000)` how many of its harmonics sit below the cutoff? (number: 2: 392 and 784; 1176 is above).',
          term: ["term.filter", "term.cutoff"],
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          features: ["step.probe"],
          what: "Match this bass: the target (audible only) is the A1 bass on a sawtooth with `.lpf(400)`; the starter has `.lpf(⟪4000⟫)`. Graded: `controls` on `bass`, `lpf` `log` tol 0.5 (PLANNED; until then `events` on the notes + `arg-matches` on `lpf` argument 0 accepting 280–570, i.e. `^(2[89]\\d|[34]\\d\\d|5[0-6]\\d|570)$`). Equivalent: `.lpf(350)`. The filter probe shows both curves after a try.",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 0.75,
          what: "Ring: the riff with `.lpf(800).lpq(⟪0⟫)`: raise the number to 10 or more and hear a whistle at the cutoff; then move `.lpf()` and hear the whistle move with it (not graded; `must-use tb.lpq`; the notes must not change).",
          term: "term.resonance",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          features: ["step.probe"],
          what: "Pluck: the riff on `.lpf(300)`; the target opens it on every note and closes it fast (`.lpf(300).lpenv(4).lpd(.2)`: up four octaves to 4800 Hz, back down in 0.2 s). Starter `.lpf(300)⟪⟫`. Graded: `controls` on `mel`, `lpenv` `linear` tol 1, `lpdecay` (`lpd`) `linear` tol 0.1 (PLANNED; until then `must-use tb.lpenv` + `arg-matches` on `lpenv` `^[3-5](\\.\\d+)?$`). Equivalent: `.lpenv(3.5).lpd(.25)`.",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.snd.params` level 1 (generator stimulus, cutoff): two bars, the filter moved between them; brighter or darker?",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Filter your loop: the A1 loop with a raw sawtooth bass and square riff; sit the bass under a low-pass and give one part a filter envelope.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The loop from Waves & Harmonics, raw: a sawtooth bass and a square riff with nothing taken away. Put the bass under a low-pass so the riff sits on top, then give one part movement with a filter envelope. Or bring a loop of your own.",
        required: {
          rule: "uses",
          label: "One part moves with a filter envelope",
          why: "`uses` `tb.lpenv` (min 1; the toolbox row matches `lpenv`, `lpa`, `lpd`, `lps` and `lpr`). The starter (no filter) fails; a loop with only `.lpf()` fails too: the static filter is C1's preset already, the movement is this lesson's. Override `rubric.unmet` with \"{label}: not yet.\"",
        },
        suggestions: ["a low-pass on the bass (`uses` `tb.lpf`)", "resonance somewhere (`uses` `tb.lpq`)"],
        band: "band.two-chord-vamp",
        tracks: ["chords"],
        flavours: "No sound swaps; the Band's chords carry the flavour.",
      },
      srs: [{ family: "fam.snd.params", mode: "seed", level: 1 }],
      mistakes: [
        'S4: the cutoff lowered but not far enough (`.lpf(1200)`): the `controls` miss (pin the code the grader prints; with the fallback, `code.arg-mismatch` overridden: "Darker still: the target keeps only the bass\'s lowest harmonics.")',
        "S4: `.hpf(400)` instead of `.lpf(400)`: the low note disappears; `code.must-use` `tb.lpf` overridden to say which way each filter cuts",
        "S6: `.lpenv(4)` with no `.lpd()`: passes on `lpenv`, and the default decay 0.14 s is within 0.1 of 0.2 (so it passes; say so in the pass text)",
        "S6: the cutoff raised instead (`.lpf(4800)`): no movement; the `controls` miss on `lpenv`",
        "S4/S6 unchanged: `code.unchanged`",
        "Make starter and a static `.lpf()` only: `rubric.unmet`",
      ],
      connects: {
        back: "A1.L01: a sound is a stack of harmonics, and a sawtooth has them all. C1 (if taken) used `.lpf(600)` as a preset; here it becomes a dial.",
        forward:
          "A1.L03 shapes the loudness of each note the way `.lpenv()` shaped its cutoff: attack, decay, sustain and release. U08.L05 chooses a bass's tone with the same filter.",
      },
      epr: {
        enjoyment:
          "The raw sawtooth bass becomes a round record bass under the riff, and the riff gets the plucked, rubbery attack of a real synth part: the learner's own loop, sounding produced.",
        pace: "One idea: a filter takes harmonics away above a cutoff, and the cutoff can move. High-pass and band-pass are named once in a hint, not practised; filter LFOs wait for A1.L06; amplitude envelopes for A1.L03.",
        return:
          "The Coda says: you can shape a sound with a filter and a filter envelope. Next, whenever you like: A1.L03 shapes how every note starts and ends.",
      },
      notes: [
        'Today offer: "Tame a raw synth bass with a filter and give your riff the pluck of a record."',
        "Evaluated: the hook's bass events carry `cutoff: 400, resonance: 4`; the riff's `cutoff: 300, lpenv: 4, lpdecay: 0.2`. With the filter envelope's sustain 0 by default, the cutoff falls back to 300 Hz after each pluck.",
        "`.lpf()` is granted at A1.L02 itself (its alternative site) for a learner who has not reached C1 or U03.L03; no ceremony if they already have it (contracts §3.1 rule 11). The ear step plays `fam.snd.params` level 1, the family this lesson seeds: one short in-lesson set is within budget; the blocked-intro sets run in tomorrow's warm-up.",
        "If `step.probe` is not listed when you author, drop `features` and the `ui.probe` lines: S3 still works with `.scope()` (the wave visibly loses its corners as the cutoff falls).",
      ],
    },
    {
      id: "A1.L03",
      author: "A1",
      idea: "Every note has a shape in time, its envelope: how fast it starts (attack), how fast it falls (decay), the level it holds while the note lasts (sustain) and how long it rings after (release), each set with `.attack() .decay() .sustain() .release()`. A pluck is a fast attack and a short decay to nothing; a pad is a slow attack, full sustain and a long release.",
      hook: {
        hear: "The A1 loop with a punchy plucked bass (`.decay(.2).sustain(0)`) under a riff that swells in like a pad (`.attack(.3).release(.8)`), after the same loop with every note the default shape.",
        code: `${T}${DRUMS}\n${BASS}.s("sawtooth").lpf(500).decay(.2).sustain(0)\nmel: n("<[4 ~ 2 ~] [5 ~ 3 ~]>").scale("C4:major").s("square").attack(.3).release(.8).gain(.7)`,
      },
      key: C,
      meter: "4/4",
      bpm: BPM,
      canDo: ["cd.code.envelopes"],
      uses: [...BASE, ...L01, ...L02, "tb.adsr"],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Pluck and pad: the loop with default note shapes, then the plucked bass under a riff that swells in and rings on.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: 'One held c4 on a sawtooth with `.attack("<0 .1 .3 .6>")`, a bar each: what changes? (`choose`: it fades in more slowly each bar / it gets shorter / it gets higher)',
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          features: ["step.probe"],
          what: '`note("c4 ~ ~ ~").s("sawtooth").attack(.3).decay(.2).sustain(.5).release(.8).scope()` with the `envelope` probe (`ui.probe: { kind: "envelope", track: "mel" }`): which control makes the note ring on after it ends (choice: `.release()`); for how many seconds does it ring after the note ends? (number: 0.8). The pass text adds what `.sustain(0)` would do: the note dies away while it is still held.',
          term: "term.envelope",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          features: ["step.probe"],
          what: 'Pluck the bass: the A1 bass on `.s("sawtooth").lpf(500)⟪⟫`; the target (audible only) is `.decay(.2).sustain(0)`. Graded: `controls` on `bass`, `decay` `linear` tol 0.1, `sustain` `linear` tol 0.1 (PLANNED; until then `must-use tb.adsr` + `arg-matches` on `decay` `^0?\\.(1|2|3)\\d*$`). Equivalent: `.decay(.2)` alone (sustain then falls to nothing, superdough\'s rule).',
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          features: ["step.probe"],
          what: 'A pad from the riff: the riff on quarter notes (`n("<[4 ~ 2 ~] [5 ~ 3 ~]>")`, square); the target swells in and rings on (`.attack(.3).release(.8)`). Graded: `controls` on `mel`, `attack` `linear` tol 0.15, `release` `linear` tol 0.3 (PLANNED; until then `arg-matches` on `attack` `^0?\\.(2|3|4)\\d*$` and on `release` `^(0?\\.[5-9]\\d*|1(\\.\\d+)?)$`). Equivalent: `.attack(.25).release(1)`.',
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.snd.params` level 3 (generator stimulus, attack and release): two bars; softer start or longer tail?",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Shape your loop: the filtered A1 loop; give the bass a shape and the riff another (pluck, pad, or something between).",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The loop from Filters, every note in its default shape. Give the bass a shape and the riff another: a punchy pluck, a slow swell, a long tail. Or bring a loop of your own.",
        required: {
          rule: "uses",
          label: "A part shaped with attack, decay, sustain or release",
          why: '`uses` `tb.adsr` (min 1; the row matches `.attack()`, `.decay()`, `.sustain()` and `.release()`). The starter fails. Override `rubric.unmet` with "{label}: not yet."',
        },
        suggestions: [
          "two parts with different shapes (`uses` `tb.adsr`, `min: 2`)",
          "a filter envelope as well (`uses` `tb.lpenv`)",
        ],
        band: "band.two-chord-vamp",
        tracks: ["chords"],
        flavours: "No sound swaps; the Band's chords carry the flavour.",
      },
      srs: [{ family: "fam.snd.params", mode: "review-if-due", level: 3 }],
      mistakes: [
        "S4: `.sustain(0)` alone (with no attack or decay set, both fall to 0.001 s: each note is a click): the `controls` miss on `decay`",
        "S4: `.release(.2)` for `.decay(.2)` (the tail, not the fall): the `controls` miss; override names the difference",
        "S5: `.attack(.3)` only: the release miss (pin it); `.attack(3)`: attack far off (seconds, not tenths)",
        "S4/S5 unchanged: `code.unchanged`; the riff's notes changed: `code.edit-outside`",
        "Make starter: `rubric.unmet`",
      ],
      connects: {
        back: "A1.L02 moved a filter's cutoff with an envelope (`.lpenv()`, `.lpd()`); this lesson moves the loudness with the same four stages. U02.L08 heard `.clip()` shorten a note: release is what happens after it.",
        forward:
          "A1.L04 puts the shaped loop in a space: a room and echoes. A long release and a reverb tail are two different things, and A1.L04 says how to hear which is which.",
      },
      epr: {
        enjoyment:
          "The loop gets a bass that punches and stops and a riff that blooms like a pad: the same notes, now with the feel of a produced track the learner would loop on repeat.",
        pace: "One idea: a note's loudness has a shape in time. Filter envelopes were A1.L02's; reverb and delay tails are A1.L04's; no new notes or rhythms (the pad riff is the A1 riff on quarter notes).",
        return:
          "The Coda says: you can shape a note's attack, decay, sustain and release. Next, whenever you like: A1.L04 places your loop in a room, with echoes in time.",
      },
      notes: [
        'Today offer: "Shape how each note starts and ends: a punchy bass, a riff that swells in, a tail that rings."',
        "Evaluated: the hook's bass carries `decay: 0.2, sustain: 0` and `cutoff: 500`; the riff `attack: 0.3, release: 0.8`. Superdough's synth defaults when nothing is set are attack 0.001, decay 0.05, sustain 0.6, release 0.01, so a note with only `.attack()` or `.release()` set holds at full level (sustain 1), a little louder than the default: say so if a learner asks why.",
        "S3's investigate response carries one `choice` and one `number` (the grader reads one of each), so the second question is the release time, 0.8. If the `envelope` probe is not listed, the scope shows the note's loudness as the wave's height swelling and dying.",
        "S4's equivalent `.decay(.2)` alone relies on superdough's dependent default (decay set without sustain → sustain 0.001). The `controls` matcher must apply that rule for a left-out `sustain`; if it uses the static default 0.6 instead, drop the equivalent and report it to the grader engineer.",
      ],
    },
    {
      id: "A1.L04",
      author: "A1",
      idea: "Space is reverb and delay. `.room()` sends a part to a reverb and `.roomsize()` sets how big the room is; `.delay()` sends it to an echo, `.delaytime()` sets the gap in seconds (60 ÷ BPM per beat) and `.delayfeedback()` how many repeats. Each orbit has one reverb and one delay shared by its parts; `.orbit(2)` gives a part a space of its own.",
      hook: {
        hear: "The A1 loop dry, then with the snare in a big room and the riff echoing an eighth later (on its own orbit): the loop sounds like it was recorded somewhere.",
        code: `${T}kick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd").room(.5).roomsize(6)\nhats: s("hh*8").gain(.5)\n${BASS}.s("sawtooth").lpf(500).decay(.2).sustain(0)\n${RIFF}.s("square").lpf(2000).delay(.4).delaytime(.3).delayfeedback(.4).orbit(2)`,
      },
      key: C,
      meter: "4/4",
      bpm: BPM,
      canDo: ["cd.code.space"],
      uses: [
        ...BASE,
        ...L01,
        ...L02,
        "tb.adsr",
        "tb.room",
        "tb.roomsize",
        "tb.delay",
        "tb.delaytime",
        "tb.delayfeedback",
        "tb.orbit",
      ],
      steps: [
        {
          kind: "listen",
          exercise: "listen",
          minutes: 0.5,
          what: "Dry and placed: the shaped A1 loop with no space, then with a big room on the snare and echoes on the riff.",
        },
        {
          kind: "predict",
          exercise: "predict",
          answer: ["choice"],
          minutes: 0.5,
          what: "The riff with `.delay(.5).delaytime(.6)` at 100 BPM: where does each echo land? (`choose`: one beat after its note / half a beat after / on the next bar). A beat lasts 60 ÷ 100 = 0.6 seconds.",
        },
        {
          kind: "investigate",
          exercise: "run-investigate",
          answer: ["choice", "number"],
          minutes: 1,
          what: 'The riff with `.delay(.5).delaytime(.3).delayfeedback("<.2 .7>")`: in which bar do the echoes go on longer? (choice: bar 2); what `delaytime` puts the echo half a beat after the note at 100 BPM? (number: 0.3, tol 0.01).',
          term: "term.delay",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "Match the echo: the riff with `.delay(.4).delaytime(⟪.6⟫).delayfeedback(⟪.7⟫)`; the target (audible only) echoes half a beat later, twice or so (`.delaytime(.3).delayfeedback(.3)`). Graded: `controls` on `mel`, `delaytime` `linear` tol 0.02, `delayfeedback` `linear` tol 0.15 (PLANNED; until then `arg-matches` on `delaytime` `^0?\\.(29\\d*|3|30\\d*|31\\d*)$` and on `delayfeedback` `^0?\\.[1-4]\\d*$`). Equivalent: `.delaytime(.30).delayfeedback(.25)`. Avoid a target of 0.45: it equals the left-out default (3/16 of a bar at 100 BPM).",
          term: "term.feedback",
        },
        {
          kind: "modify",
          exercise: "code-modify",
          answer: ["code"],
          minutes: 1.25,
          graded: true,
          what: "Two rooms: the snare in a big room (`.room(.5).roomsize(6)`) and the riff in a small one (`.room(.3).roomsize(1)`) on the same orbit, so the one reverb keeps switching size and its tails are cut. Give the riff its own: `.orbit(2)`. Graded: `controls` on `mel`, `orbit` `exact` (PLANNED; until then `must-use tb.orbit` + `arg-matches` on `orbit` `^[2-9]$`, which reads the first `.orbit(…)` call) with `events` on the notes. Equivalent: `.orbit(3)`, or the snare moved to orbit 2 instead (the point is two orbits, so this step keeps the `arg-matches` form even once `controls` lands: a `controls` match on one track cannot see the other).",
        },
        {
          kind: "ear",
          exercise: "identify",
          answer: ["choice"],
          minutes: 1.25,
          graded: true,
          what: "From `fam.snd.params` level 4 (generator stimulus, room and delay): two bars; more room, or echoes?",
        },
        {
          kind: "make",
          exercise: "code-make",
          answer: ["code"],
          minutes: 2.75,
          what: "Place your loop: the shaped A1 loop, dry; give it a room and the riff echoes in time, each part where it belongs.",
        },
      ],
      wrapAt: 4,
      make: {
        brief:
          "The loop from Envelopes, dry. Put it somewhere: a room for the drums or the riff, echoes timed to the beat (60 ÷ BPM seconds a beat), and an orbit of its own for any part that needs a different space. Or bring a loop of your own.",
        required: {
          rule: "uses",
          label: "A space you set: a room size or an echo time",
          why: '`uses` `["tb.roomsize", "tb.delaytime"]` (min 1): the lesson\'s two new dials. The starter (dry) fails; `.room()` alone fails (U02.L08\'s, already the learner\'s). Override `rubric.unmet` with "{label}: not yet."',
        },
        suggestions: ["echoes on a part (`uses` `tb.delay`)", "a part on its own orbit (`uses` `tb.orbit`)"],
        band: "band.two-chord-vamp",
        tracks: ["chords"],
        flavours: "No sound swaps; the Band's chords carry the flavour.",
      },
      srs: [{ family: "fam.snd.params", mode: "review-if-due", level: 4 }],
      mistakes: [
        "S4: `.delaytime(3)` for 0.3 (seconds, not tenths): the `controls` miss; override says the unit",
        "S4: the default delay time left in place by deleting `.delaytime()` (0.45 s): the miss on `delaytime`",
        "S5: `.room(0)` on the riff instead of a new orbit (the riff loses its room): the `controls` miss on `orbit`; hint 3 says the room is shared, not the send",
        "S4/S5 unchanged: `code.unchanged`; the riff's notes changed: `code.edit-outside`",
        "Make starter, and `.room()` only: `rubric.unmet`",
      ],
      connects: {
        back: "U02.L08 heard `.room()` as the sound of a space; A1.L03 gave notes their tails. A1.L01–L03 made the parts themselves; this lesson places them.",
        forward:
          "U10.L09 uses `.delay()` on a minor ballad (no ceremony if it is already granted here). A2 (after U10.CP) mixes the parts: levels, panning and room for each.",
      },
      epr: {
        enjoyment:
          "The loop the learner started A1 with now has a snare in a room and a riff that echoes on the beat: it sounds recorded rather than typed, and it is theirs to keep in Studio.",
        pace: "One idea: space, as reverb and delay, with orbits only as the reason two spaces can coexist. Panning and the mix wait for A2; no new notes, rhythms or synthesis.",
        return:
          "The Coda says: you can place a sound in a space with reverb and delay. The four side lessons are done; A1.L05–L07 (grit, movement, richer synths) open after U09.CP.",
      },
      notes: [
        'Today offer: "Put your loop in a room: reverb, echoes in time, and a space for each part."',
        "Evaluated: the hook's snare carries `room: 0.5, roomsize: 6`; the riff `delay: 0.4, delaytime: 0.3, delayfeedback: 0.4, orbit: 2`. At 100 BPM a beat is 0.6 s, so 0.3 is half a beat (an eighth).",
        "`tb.delay` has two sites (U10.L09 or A1.L04): granted here for a learner who has not reached U10.L09, silently if already granted. The orbit fact is superdough's (superdoughoutput.mjs `getDelay`/`getReverb` are per orbit; the last note to set a time, feedback or size sets it for the orbit).",
        "S5's grading accepts either part moving: two reference solutions (riff on orbit 2; snare on orbit 2), an `events` matcher on the notes, `must-use tb.orbit` and `arg-matches` on the first `.orbit(…)` argument.",
      ],
    },
  ],
  capstones: [],
};

// The live examples of the tools U08–U11 and the A1 side lessons unlock (Wave 5): each plays the tool inside a
// short groove that sounds like music, not a bare test tone (the catalog's own demo is the tool alone, which the
// unlock moment and the locked teaser keep). Each uses only what its unlock site guarantees (the A1 examples stay
// inside U03.L02's tools: note(), s(), drums, no chords), and each was played in headless Strudel
// (demos.test.ts). The page also says which panel or probe shows the tool at work.
import type { VisualProbe } from "@oak/strudel/probes";
import type { PanelId } from "../workbench/panels.ts";

export interface ToolDemo {
  code: string;
  /** Panels open on the page (the form map, the scope). */
  panels?: Partial<Record<PanelId, boolean>>;
  /** Probes drawn beside the example (the filter curve, the envelope, the echoes, the harmonics). */
  probes?: VisualProbe["kind"][];
  /** One line over the example: what to listen and look for, and what to change. */
  hint: string;
}

const FORM_SONG = `setcpm(100/4)

const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("bd bd sd [~ bd]")
const hatsVerse = s("~ hh ~ hh")
const hatsChorus = s("hh*8")
const chordsVerse = chord("<C Am>").voicing().s("piano").gain(.55)
const chordsChorus = chord("<F G>").voicing().s("piano").gain(.75)
const bassVerse = note("<c2 a1>").s("sawtooth").lpf(600)
const bassChorus = note("<[f2 ~ f2 c2] [g2 ~ g2 d2]>").s("sawtooth").lpf(700)

drums: arrange([2, drumsVerse], [2, drumsChorus])
hats: arrange([2, hatsVerse], [2, hatsChorus])
chords: arrange([2, chordsVerse], [2, chordsChorus])
bass: arrange([2, bassVerse], [2, bassChorus])`;

const BASS_SAW = (body: string) => `setcpm(90/4)

drums: s("bd ~ sd ~")
hats: s("hh*8").gain(.4)
bass: ${body}`;

export const TOOL_DEMOS: Readonly<Record<string, ToolDemo>> = {
  // --- U08 Bass Lines ---------------------------------------------------------------------------------
  "tb.rootNotes": {
    code: `setcpm(88/4)

drums: s("bd ~ sd ~")
chords: chord("<C Am F G>").voicing().s("piano").gain(.55)
bass: chord("<C Am F G>").rootNotes(2).s("sawtooth").lpf(600)`,
    hint: "The bass plays the root of each chord, two octaves down. Change the chords in both lines and press Run: the bass follows.",
  },
  "tb.const": {
    code: `setcpm(96/4)

const groove = "x ~ ~ x ~ ~ x ~"

kick: s("bd").struct(groove)
snare: s("~ sd ~ sd")
bass: note("<c2 a1 f1 g1>").struct(groove).s("sawtooth").lpf(600)`,
    hint: "One groove, named once, drives the kick and the bass together. Change the x's in groove and both move.",
  },
  "snd.fingerbass": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
chords: chord("<C Am F G>").voicing().s("piano").gain(.5)
bass: note("<[c2 ~ c2 g1] [a1 ~ a1 e2] [f1 ~ f1 c2] [g1 ~ g1 d2]>").s("fingerbass")`,
    hint: "Root, root, then the fifth: a finger-played bass under four chords.",
  },
  "tb.template.synthbass": {
    code: BASS_SAW(`note("<[c2 c2 ~ g1] [bb1 bb1 ~ f1]>").s("sawtooth").lpf(600)`),
    hint: "The synth-bass recipe: a sawtooth with the highs filtered away. Try .lpf(400) or .lpf(1200).",
  },
  // --- U09 Form ---------------------------------------------------------------------------------------
  "tb.lens.form": {
    code: FORM_SONG,
    panels: { form: true },
    hint: "Each track is arranged the same way, so the ribbon over the roll shows a verse then a chorus. Click a section to loop it; the form map draws the energy rising into the chorus. Shift+E opens the map anywhere.",
  },
  "tb.arrange": {
    code: FORM_SONG,
    hint: "One arrange() per labelled track, the same bars in the same order: two bars of verse, two of chorus. Swap the order in every track and press Run.",
  },
  "tb.signal": {
    code: `setcpm(96/4)

kick: s("bd*4")
hats: s("hh*8").gain(sine.range(.25, .9).slow(2))
chords: chord("<C F>").voicing().s("piano").gain(.5)`,
    hint: "A sine wave moves the hats' volume up and down every two bars, smoothly.",
  },
  "tb.range": {
    code: `setcpm(96/4)

kick: s("bd*4")
hats: s("hh*16").gain(saw.range(.15, .9).slow(4))
chords: chord("<C Am F G>").voicing().s("piano").gain(.5)`,
    hint: "saw.range(.15, .9) climbs from quiet to loud over four bars: a build-up. Change the two numbers to change how far it climbs.",
  },
  "tb.segment": {
    code: `setcpm(96/4)

kick: s("bd*4")
riser: n(saw.range(0, 7).segment(8).slow(2)).scale("C4:major").s("piano")`,
    hint: "The rising saw cut into eight steps per cycle becomes a scale that climbs over two bars.",
  },
  "tb.mask": {
    code: `setcpm(96/4)

kick: s("bd*4")
hats: s("hh*8").gain(.5).mask("<0 1>")
snare: s("~ sd ~ sd").mask("<0 0 1 1>")
bass: note("<c2 c2 f1 g1>").s("sawtooth").lpf(600)`,
    hint: "The hats drop in every other bar, the snare for the last two: the same lines, switched on and off by bar.",
  },
  // --- U10 Minor --------------------------------------------------------------------------------------
  "scale.minor": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
mel: n("<[0 2 4 2] [3 2 1 ~] [5 4 2 4] [1 ~ 0 ~]>").scale("C4:minor").s("piano")
bass: note("<c2 c2 ab1 g1>").s("sawtooth").lpf(600)`,
    hint: "The same degree numbers as a major tune, in C minor: 3, 6 and 7 come out flat (me, le, te). Change minor to major and press Run.",
  },
  "scale.harmonic-minor": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
mel: n("<[4 3 2 1] [6 ~ 7 ~]>").scale("A3:harmonic:minor").s("piano")
bass: note("<a1 e2>").s("sawtooth").lpf(600)`,
    hint: "Harmonic minor raises 7 (ti): G♯ in A minor pulls hard up to A. Change harmonic:minor to minor to hear the plain G.",
  },
  "scale.melodic-minor": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
mel: n("<[0 1 2 3] [4 5 6 7]>").scale("A3:melodic:minor").s("piano")
bass: note("a1").s("sawtooth").lpf(600)`,
    hint: "Melodic minor going up: 6 and 7 are raised (F♯ and G♯ in A minor), so the climb runs smoothly into the top note.",
  },
  "snd.strings": {
    code: `setcpm(80/4)

drums: s("bd ~ ~ ~, ~ ~ sd ~")
pad: n("<[0,2,4] [5,7,9] [2,4,6] [6,8,10]>").scale("A3:minor").s("strings").gain(.7)
bass: note("<a1 f1 c2 g1>").s("sawtooth").lpf(500)`,
    hint: "Strings hold the minor chords i VI III VII under a quiet beat: the Aeolian loop.",
  },
  // --- U11 Pentatonic & Blues -------------------------------------------------------------------------
  "scale.major-pentatonic": {
    code: `setcpm(96/4)

drums: s("bd ~ sd ~")
chords: chord("<C Am F G>").voicing().s("piano").gain(.5)
mel: n("<[0 1 2 4] [3 2 1 ~] [2 3 4 5] [4 ~ ~ ~]>").scale("C4:major:pentatonic").s("piano")`,
    hint: "Five notes, no half steps: every note of C major pentatonic fits over every chord here. Change the numbers freely.",
  },
  "scale.minor-pentatonic": {
    code: `setcpm(96/4)

drums: s("bd ~ sd ~")
hats: s("hh*8").gain(.4)
riff: n("0 ~ 1 2 ~ 3 2 1").scale("A3:minor:pentatonic").s("piano")
bass: note("a1 ~ a1 ~").s("sawtooth").lpf(600)`,
    hint: "A minor pentatonic: 1 ♭3 4 5 ♭7. The riff counts the scale's own notes, so n(1) is C, the ♭3.",
  },
  "scale.blues": {
    code: `setcpm(96/4)

drums: s("bd ~ sd ~")
riff: n("<[0 1 2 3] [4 ~ 3 2] [1 2 1 0] [~ ~ 0 ~]>").scale("C4:blues").s("piano")
bass: note("<c2 c2 f2 c2>").s("sawtooth").lpf(600)`,
    hint: "The blues scale adds the ♭5 (G♭) between 4 and 5. With the blue-note lens on, ♭3, ♭5 and ♭7 are ringed. Shift+U turns it off and on.",
  },
  "chord.dom7": {
    code: `setcpm(96/4)

drums: s("bd ~ sd ~")
chords: chord("<C7 F7 C7 G7>").voicing().s("piano").gain(.6)
bass: chord("<C7 F7 C7 G7>").rootNotes(2).s("sawtooth").lpf(600)`,
    hint: "Every chord a dominant seventh: the blues sound. The chord band names each one; drop the 7s to hear plain triads.",
  },
  "snd.crunch": {
    code: `setcpm(96/4)

drums: s("bd ~ sd ~")
gtr: n("0 ~ 1 2 ~ 1 0 ~").scale("E2:minor:pentatonic").s("crunch").gain(.7)`,
    hint: "An overdriven guitar on an E minor pentatonic riff.",
  },
  "tb.swing": {
    code: `setcpm(120/4)

drums: s("bd ~ sd ~")
hats: s("hh*8").swing(4)
riff: n("0 ~ 2 3 4 ~ 3 2").scale("C4:blues").s("piano").swing(4)`,
    hint: "Every second eighth lands late: a shuffle. The track chips say Swing 8ths; remove .swing(4) to hear it straight.",
  },
  "tb.swingBy": {
    code: `setcpm(120/4)

drums: s("bd ~ sd ~")
hats: s("hh*8").swingBy(1/3, 4)
riff: n("0 ~ 2 3 4 ~ 3 2").scale("C4:blues").s("piano").swingBy(1/3, 4)`,
    hint: "1/3 is a full triplet shuffle; try 1/6 for a lighter swing, 0 for straight.",
  },
  "tb.delay": {
    code: `setcpm(80/4)

drums: s("bd ~ sd ~")
mel: note("<[c4 ~ e4 ~] [g4 ~ ~ ~] [a4 ~ g4 ~] [e4 ~ ~ ~]>").s("piano").delay(.4)`,
    probes: ["delay"],
    hint: "Each note comes back as quieter echoes. The picture shows when each echo lands and how loud it is.",
  },
  "tb.distort": {
    code: BASS_SAW(`note("<[c2 c2 ~ g1] [bb1 bb1 ~ f1]>").s("sawtooth").distort(1.5).lpf(900).gain(.6)`),
    hint: "Distortion adds grit and new harmonics; .lpf(900) keeps the top from turning harsh.",
  },
  // --- A1 Sound (side lessons): note(), s() and drums only -------------------------------------------
  "tb.scope": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
bass: note("<c2 c2 g1 bb1>").s("sawtooth").lpf(800).scope()`,
    panels: { scope: true },
    hint: ".scope() opens Oak's scope: press Play and the wave of what plays stands still on the screen. Shift+W opens it anywhere.",
  },
  "tb.partials": {
    code: `setcpm(80/4)

mel: note("<c3 g3 e3 c3>").s("sine").partials([1, .5, .3, .2])
kick: s("bd ~ ~ ~")`,
    probes: ["harmonics"],
    hint: "Four numbers, four harmonics: the fundamental, then each harmonic quieter. Try [1, 0, .3] for a hollow sound.",
  },
  "tb.lpf": {
    code: BASS_SAW(`note("<[c2 c2 ~ g1] [bb1 bb1 ~ f1]>").s("sawtooth").lpf(600)`),
    probes: ["filter"],
    hint: "Everything above 600 Hz fades. Change 600 and press Run: the curve moves with it.",
  },
  "tb.hpf": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
lead: note("<[c4 e4 g4 e4] [a3 c4 e4 c4]>").s("sawtooth").hpf(800).gain(.6)`,
    probes: ["filter"],
    hint: "A high-pass keeps the highs and thins the lows: the lead gets out of the bass's way.",
  },
  "tb.bpf": {
    code: `setcpm(90/4)

drums: s("bd ~ sd ~")
lead: note("<[c3 e3 g3 c4] [bb2 d3 f3 bb3]>").s("sawtooth").bpf(900)`,
    probes: ["filter"],
    hint: "A band-pass keeps a band around 900 Hz: a nasal, telephone-like voice.",
  },
  "tb.lpq": {
    code: BASS_SAW(`note("<[c2 c2 ~ g1] [bb1 bb1 ~ f1]>").s("sawtooth").lpf(700).lpq(12)`),
    probes: ["filter"],
    hint: "Resonance lifts a peak right at the cutoff: the bass starts to sing. Try .lpq(2) and .lpq(20).",
  },
  "tb.lpenv": {
    code: BASS_SAW(`note("<[c2 c2 ~ g1] [bb1 bb1 ~ f1]>").s("sawtooth").lpf(300).lpenv(4).lpd(.2)`),
    probes: ["filter"],
    hint: "The filter opens at each note and closes again within .lpd(.2) seconds: the classic synth-bass pluck.",
  },
  "tb.adsr": {
    code: `setcpm(80/4)

kick: s("bd ~ ~ ~")
pad: note("<c4 a3 f3 g3>").s("sawtooth").attack(.3).release(.8).lpf(1500).gain(.5)`,
    probes: ["envelope"],
    hint: "A slow attack fades each note in; a long release lets it ring on. The shape shows both.",
  },
  "tb.roomsize": {
    code: `setcpm(80/4)

kick: s("bd ~ ~ ~")
mel: note("<[c4 ~ g4 ~] [e4 ~ ~ ~]>").s("piano").room(.5).roomsize(6)`,
    hint: "A bigger room rings longer. Try .roomsize(1) and .roomsize(9).",
  },
  "tb.delaytime": {
    code: `setcpm(80/4)

kick: s("bd ~ ~ ~")
mel: note("<[c4 ~ e4 ~] [g4 ~ ~ ~]>").s("piano").delay(.4).delaytime(.25)`,
    probes: ["delay"],
    hint: "A quarter of a second between echoes. Change .25 and the echoes in the picture spread out or close up.",
  },
  "tb.delayfeedback": {
    code: `setcpm(80/4)

kick: s("bd ~ ~ ~")
mel: note("<[c4 ~ e4 ~] [g4 ~ ~ ~]>").s("piano").delay(.4).delayfeedback(.6)`,
    probes: ["delay"],
    hint: "Feedback decides how many echoes you hear: each is 60% of the one before.",
  },
  "tb.orbit": {
    code: `setcpm(80/4)

kick: s("bd ~ ~ ~")
mel: note("<[c4 ~ g4 ~] [e4 ~ ~ ~]>").s("piano").room(.6).orbit(2)`,
    hint: "A separate orbit gives this track its own reverb, so the kick stays dry.",
  },
};

export function toolDemo(toolId: string): ToolDemo | null {
  return TOOL_DEMOS[toolId] ?? null;
}

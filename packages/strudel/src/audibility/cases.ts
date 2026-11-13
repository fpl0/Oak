// The audibility catalog (contracts §3.1 rule 7): every group-H control and every sound the unlock table
// names, with the base expression that makes it audible and a non-default value (spike S3: a control
// can need a partner, e.g. lpenv needs lpf, speed needs a sample). The harness turns this into
// `packages/strudel/audibility.json`; content CI reads `audible` from there.

export interface ControlCase {
  id: string;
  control: string;
  /** A JS literal, or raw code prefixed with "=" (`"=rev"`). */
  value: string | number;
  base?: string;
  /** The full code WITH the control, when appending `.control(value)` to the base is not the test. */
  withCode?: string;
}
export interface SoundCase {
  id: string;
  sound: string;
  code: string;
}

const ARP = 'note("c3 e3 g3 c4").s("sawtooth")';
const SAMPLE = 's("cr")';

const PIANO_TRIAD = 'note("[c3,e3,g3]").s("piano")';
const VOICED_C = 'chord("C").voicing().s("piano")';
const pair = (id: string, control: string, base: string, withCode: string): ControlCase => ({
  id,
  control,
  value: "=",
  base,
  withCode,
});

/** The U05–U07 tools: each as the same music without the tool and with it. */
function wave4Cases(): ControlCase[] {
  return [
    pair("tb.arp", "arp", PIANO_TRIAD, 'note("[c3,e3,g3]").arp("0 1 2 1").s("piano")'),
    pair(
      "chord.triad",
      "chord",
      'chord("C C C C").voicing().s("piano")',
      'chord("C Cm Co Caug").voicing().s("piano")',
    ),
    pair("tb.chord", "chord", VOICED_C, 'chord("Am").voicing().s("piano")'),
    pair("tb.voicing", "voicing", PIANO_TRIAD, VOICED_C),
    pair("tb.anchor", "anchor", VOICED_C, 'chord("C").anchor("g4").voicing().s("piano")'),
    // `below` is the default mode, so it is heard against root position.
    pair(
      "tb.mode.below",
      "mode",
      'chord("C").mode("root:c3").voicing().s("piano")',
      'chord("C").mode("below").voicing().s("piano")',
    ),
    pair("tb.dict.triads", "dict", VOICED_C, 'chord("C").dict("triads").voicing().s("piano")'),
    pair(
      "tb.add",
      "add",
      'n("0 2 4").scale("C4:major").s("piano")',
      'n("0 2 4").add(n("2")).scale("C4:major").s("piano")',
    ),
    pair("tb.mode.root", "mode", VOICED_C, 'chord("C").mode("root:g2").voicing().s("piano")'),
    pair("tb.rev", "rev", 'note("c3 e3 g3 c4").s("piano")', 'note("c3 e3 g3 c4").rev().s("piano")'),
    pair(
      "tb.scaleTranspose",
      "scaleTranspose",
      'n("0 1 2 3").scale("C4:major").s("piano")',
      'n("0 1 2 3").scale("C4:major").scaleTranspose(2).s("piano")',
    ),
    pair("tb.struct", "struct", PIANO_TRIAD, 'note("[c3,e3,g3]").struct("x ~ x x").s("piano")'),
    // One rendered cycle: `lastOf(1, …)` and `firstOf(1, …)` apply in it.
    pair("tb.lastOf", "lastOf", ARP, `${ARP}.lastOf(1, x => x.rev())`),
    pair("tb.firstOf", "firstOf", ARP, `${ARP}.firstOf(1, x => x.fast(2))`),
    pair("tb.off", "off", ARP, `${ARP}.off(1/8, x => x.add(note(7)))`),
    pair("tb.superimpose", "superimpose", ARP, `${ARP}.superimpose(x => x.add(note(12)))`),
    pair("tb.mini.maybe", "?", 'note("c3*8").s("sawtooth")', 'note("c3*8?").s("sawtooth")'),
    pair(
      "tb.degradeBy",
      "degradeBy",
      'note("c3*8").s("sawtooth")',
      'note("c3*8").degradeBy(0.5).s("sawtooth")',
    ),
    pair(
      "tb.sometimesBy",
      "sometimesBy",
      'note("c3*8").s("sawtooth")',
      'note("c3*8").sometimesBy(0.5, x => x.add(note(12))).s("sawtooth")',
    ),
  ];
}

/**
 * The U08–U11 tools that change what is heard (Wave 5): the root-bass helper, the energy-curve tools, layer
 * entries, swing and shuffle, the dominant seventh and every minor, pentatonic and blues scale, each as the same
 * music without the tool and with it.
 */
export function wave5Cases(): ControlCase[] {
  const SCALE_RUN = (name: string) => `n("0 1 2 3 4 5 6 7").scale("C4:${name}").s("piano")`;
  const scale = (id: string, name: string): ControlCase =>
    pair(id, "scale", SCALE_RUN("major"), SCALE_RUN(name));
  return [
    pair(
      "tb.rootNotes",
      "rootNotes",
      'note("c2*4").s("ebass")',
      'chord("Am").rootNotes(2).struct("x*4").s("ebass")',
    ),
    pair("tb.signal", "sine", 'note("c3*8").s("sawtooth")', 'note("c3*8").s("sawtooth").gain(sine)'),
    pair(
      "tb.range",
      "range",
      'note("c3*8").s("sawtooth").lpf(2000)',
      'note("c3*8").s("sawtooth").lpf(saw.range(200, 4000).segment(8))',
    ),
    pair(
      "tb.segment",
      "segment",
      'note("c3*8").s("sawtooth").lpf(saw.range(200, 4000))',
      'note("c3*8").s("sawtooth").lpf(saw.range(200, 4000).segment(2))',
    ),
    pair("tb.mask", "mask", 'note("c3*8").s("sawtooth")', 'note("c3*8").s("sawtooth").mask("1 0 1 1")'),
    // Swing moves the off-beat eighths onto the last triplet: the same hats, later.
    pair("tb.swingBy", "swingBy", 's("hh*8")', 's("hh*8").swingBy(1/3, 4)'),
    pair("tb.swing", "swing", 's("hh*8")', 's("hh*8").swing(4)'),
    pair("chord.dom7", "chord", VOICED_C, 'chord("C7").voicing().s("piano")'),
    scale("scale.minor", "minor"),
    scale("scale.harmonic-minor", "harmonic:minor"),
    scale("scale.melodic-minor", "melodic:minor"),
    scale("scale.major-pentatonic", "major:pentatonic"),
    scale("scale.minor-pentatonic", "minor:pentatonic"),
    scale("scale.blues", "blues"),
  ];
}

export const CONTROL_CASES: ControlCase[] = [
  { id: "tb.room", control: "room", value: 0.6 },
  { id: "tb.clip", control: "clip", value: 0.25 },
  { id: "tb.lpf", control: "lpf", value: 400 },
  { id: "tb.delay", control: "delay", value: 0.5 },
  { id: "tb.distort", control: "distort", value: 2 },
  { id: "tb.pan", control: "pan", value: 0 },
  { id: "tb.jux", control: "jux", value: "=rev" },
  {
    id: "tb.partials",
    control: "partials",
    value: "=[1, 0, 0.5, 0, 0.25]",
    base: 'note("c3 e3 g3 c4").s("user")',
  },
  { id: "tb.hpf", control: "hpf", value: 2000 },
  { id: "tb.bpf", control: "bpf", value: 800 },
  { id: "tb.lpq", control: "lpq", value: 20, base: `${ARP}.lpf(600)` },
  { id: "tb.lpenv", control: "lpenv", value: 4, base: `${ARP}.lpf(300)` },
  { id: "tb.lpenv", control: "lpa", value: 0.2, base: `${ARP}.lpf(300).lpenv(4)` },
  { id: "tb.lpenv", control: "lpd", value: 0.05, base: `${ARP}.lpf(300).lpenv(4)` },
  { id: "tb.lpenv", control: "lps", value: 0.1, base: `${ARP}.lpf(300).lpenv(4)` },
  { id: "tb.lpenv", control: "lpr", value: 0.5, base: `${ARP}.lpf(300).lpenv(4)` },
  { id: "tb.adsr", control: "attack", value: 0.1 },
  { id: "tb.adsr", control: "decay", value: 0.05 },
  { id: "tb.adsr", control: "sustain", value: 0.2 },
  { id: "tb.adsr", control: "release", value: 0.5 },
  { id: "tb.roomsize", control: "roomsize", value: 6, base: `${ARP}.room(0.6)` },
  { id: "tb.delaytime", control: "delaytime", value: 0.125, base: `${ARP}.delay(0.5)` },
  { id: "tb.delayfeedback", control: "delayfeedback", value: 0.8, base: `${ARP}.delay(0.5)` },
  // Effects are per orbit: a kick on the arpeggio's orbit retunes its delay line; on its own orbit it does not.
  {
    id: "tb.orbit",
    control: "orbit",
    value: 2,
    base: `stack(${ARP}.delay(0.6).delaytime(0.25), s("~ bd ~ bd").delay(0.6).delaytime(0.0625))`,
    withCode: `stack(${ARP}.delay(0.6).delaytime(0.25), s("~ bd ~ bd").delay(0.6).delaytime(0.0625).orbit(2))`,
  },
  { id: "tb.crush", control: "crush", value: 4 },
  { id: "tb.coarse", control: "coarse", value: 8 },
  { id: "tb.distorttype", control: "distorttype", value: "fold", base: `${ARP}.distort(2)` },
  { id: "tb.vib", control: "vib", value: 6 },
  { id: "tb.vib", control: "vibmod", value: 2, base: `${ARP}.vib(4)` },
  { id: "tb.phaser", control: "phaser", value: 4 },
  { id: "tb.tremolo", control: "tremolosync", value: 4 },
  { id: "tb.tremolo", control: "tremolodepth", value: 0.9, base: `${ARP}.tremolosync(4)` },
  { id: "tb.lpmod", control: "lprate", value: 4, base: `${ARP}.lpf(600).lpdepth(0.8)` },
  { id: "tb.lpmod", control: "lpdepth", value: 0.8, base: `${ARP}.lpf(600).lprate(4)` },
  { id: "tb.fm", control: "fm", value: 4 },
  { id: "tb.fm", control: "fmh", value: 2.5, base: `${ARP}.fm(4)` },
  { id: "tb.unison", control: "unison", value: 1, base: 'note("c3 e3 g3 c4").s("supersaw")' },
  { id: "tb.unison", control: "detune", value: 0.8, base: 'note("c3 e3 g3 c4").s("supersaw")' },
  { id: "tb.unison", control: "spread", value: 0, base: 'note("c3 e3 g3 c4").s("supersaw")' },
  { id: "tb.pw", control: "pw", value: 0.15, base: 'note("c3 e3 g3 c4").s("pulse")' },
  { id: "tb.chop", control: "chop", value: 4, base: SAMPLE },
  { id: "tb.chop", control: "striate", value: 4, base: SAMPLE },
  { id: "tb.chop", control: "slice", value: '=4, "0 2"', base: SAMPLE },
  { id: "tb.chop", control: "splice", value: '=4, "0 2"', base: SAMPLE },
  { id: "tb.loopAt", control: "loopAt", value: 2, base: SAMPLE },
  { id: "tb.speed", control: "speed", value: 2, base: SAMPLE },
  { id: "tb.speed", control: "begin", value: 0.25, base: SAMPLE },
  { id: "tb.speed", control: "end", value: 0.25, base: SAMPLE },
  { id: "tb.compressor", control: "compressor", value: "-30:20:10:.002:.02" },
  { id: "tb.postgain", control: "postgain", value: 0.3 },
  // The ducking trigger must not sit at t = 0 (superdough schedules the duck 10 ms early).
  {
    id: "tb.duck",
    control: "duckorbit",
    value: 1,
    base: `stack(${ARP}.orbit(1), s("~ bd ~ bd").orbit(2))`,
    withCode: `stack(${ARP}.orbit(1), s("~ bd ~ bd").orbit(2).duckorbit(1))`,
  },
  {
    id: "tb.duck",
    control: "duckdepth",
    value: 1,
    base: `stack(${ARP}.orbit(1), s("~ bd ~ bd").orbit(2).duckorbit(1).duckdepth(0.3))`,
    withCode: `stack(${ARP}.orbit(1), s("~ bd ~ bd").orbit(2).duckorbit(1).duckdepth(1))`,
  },
  { id: "tb.velocity", control: "velocity", value: 0.3 },
  { id: "tb.gain", control: "gain", value: 0.3 },
  // Wave 4: the pattern, chord and voicing tools U05–U07 unlock (the voicing gate's tools included). A pattern
  // tool is audible when the code with it sounds different from the same music without it; each pair is
  // written out in STYLE order (controls before `.voicing()`, `.add()` before `.scale()`).
  ...wave4Cases(),
  // Wave 5: the tools U08–U11 unlock.
  ...wave5Cases(),
  // Known silent no-ops (contracts §3.1 rule 7): never taught; listed so a Strudel update that changes them shows.
  { id: "noop.leslie", control: "leslie", value: 1 },
  { id: "noop.lrate", control: "lrate", value: 4 },
  { id: "noop.lsize", control: "lsize", value: 2 },
  { id: "noop.amp", control: "amp", value: 0.3 },
  { id: "noop.squiz", control: "squiz", value: 2 },
  { id: "noop.triode", control: "triode", value: 0.5 },
  { id: "noop.ring", control: "ring", value: 1 },
];

const pitched = (id: string, sound: string, notes = "c3 e3 g3 c4"): SoundCase => ({
  id,
  sound,
  code: `note("${notes}").s("${sound}")`,
});
const drum = (role: string): SoundCase => ({
  id: `snd.drum.${role}`,
  sound: role,
  code: `s("${role} ${role}")`,
});
const bank = (name: string): SoundCase => ({
  id: `snd.bank.${name}`,
  sound: name,
  code: `s("bd sd hh cp").bank("${name}")`,
});

export const SOUND_CASES: SoundCase[] = [
  ...["bd", "sd", "hh", "cp", "rim", "oh", "cr", "rd", "lt", "mt", "ht", "sh", "cb", "tb"].map(drum),
  ...["RolandTR909", "RolandTR808", "LinnDrum", "AkaiLinn", "RolandTR707"].map(bank),
  { id: "snd.jazzkit", sound: "jazzkit", code: 's("bd sd hh rd").bank("jazzkit")' },
  { id: "snd.brk", sound: "brk", code: 's("brk")' },
  pitched("snd.piano", "piano"),
  ...["sine", "triangle", "square", "sawtooth", "supersaw", "pulse"].map((w) => pitched(`snd.wave.${w}`, w)),
  pitched("snd.ebass", "ebass", "c2 e2 g2 c3"),
  pitched("snd.acgtr", "acgtr"),
  pitched("snd.upright", "upright", "c2 e2 g2 c3"),
  pitched("snd.rhodes", "rhodes"),
  pitched("snd.organ", "organ"),
  pitched("snd.pad", "pad"),
  pitched("snd.fingerbass", "fingerbass", "c2 e2 g2 c3"),
  pitched("snd.strings", "strings"),
  pitched("snd.crunch", "crunch", "e2 b2 e3 b2"),
  pitched("snd.jazzgtr", "jazzgtr"),
  pitched("snd.cleangtr", "cleangtr"),
  pitched("snd.horns", "horns", "c4 e4 g4 c5"),
  pitched("snd.trumpet", "trumpet", "c4 e4 g4 c5"),
  pitched("snd.tenor", "tenor", "c4 e4 g4 c5"),
  pitched("snd.vibes", "vibes", "c4 e4 g4 c5"),
  pitched("snd.mutetpt", "mutetpt", "c4 e4 g4 c5"),
  pitched("snd.clav", "clav"),
  pitched("snd.choir", "choir"),
  // U08.L05's synth-bass recipe (a template row: the sawtooth with the bass preset).
  { id: "tb.template.synthbass", sound: "sawtooth", code: 'note("c2 e2 g2 c3").s("sawtooth").lpf(600)' },
];

/** A pitched alias the sound-quality harness measures: tuning at `notes`, clicks at `clickNote`, loudness of `phrase`. */
export interface QualityCase {
  id: string;
  sound: string;
  /** MIDI notes whose fundamental is checked: A1/A2/A3 for basses, A2/A3/A4 or A3/A4 for the rest. */
  notes: number[];
  clickNote: number;
  phrase: string;
  /** Used by U03–U04 (the Band's jazz-soul and indie kits, and U03.L11): asserted, not only reported. */
  wave3: boolean;
}

const q = (sound: string, notes: number[], phrase: string, wave3 = false): QualityCase => ({
  id: `snd.${sound}`,
  sound,
  notes,
  clickNote: notes[1] ?? (notes[0] as number),
  phrase: `note("${phrase}").s("${sound}")`,
  wave3,
});
const MID = "c4 e4 g4 c5";
const LOW = "c2 e2 g2 c3";

export const QUALITY_CASES: QualityCase[] = [
  q("piano", [45, 57, 69], MID, true),
  q("rhodes", [45, 57, 69], MID, true),
  q("acgtr", [45, 57, 69], MID, true),
  q("upright", [33, 45, 57], LOW, true),
  q("ebass", [33, 45, 57], LOW, true),
  q("organ", [45, 57, 69], MID),
  q("jazzgtr", [45, 57, 69], MID),
  q("cleangtr", [45, 57, 69], MID),
  q("crunch", [45, 57, 69], "e3 g3 b3 e4"),
  q("strings", [45, 57, 69], MID),
  q("horns", [57, 69], MID),
  q("tenor", [57, 69], MID),
  q("fingerbass", [33, 45, 57], LOW),
  q("trumpet", [57, 69], MID),
  q("mutetpt", [57, 69], MID),
  q("vibes", [57, 69, 81], MID),
  q("clav", [45, 57, 69], MID),
  q("pad", [45, 57, 69], MID),
  q("choir", [45, 57, 69], MID),
];

/**
 * A control heard in the context a lesson teaches it (Wave 5): the lesson's own parts, tempo and values, so
 * "only audible controls are taught" holds where the learner meets the control, not only on the harness's arpeggio.
 * A row with `same: true` is an equivalence a lesson relies on (two spellings that must sound alike); it is
 * asserted NOT audible and never decides an id.
 */
export interface LessonCase extends ControlCase {
  lesson: string;
  /** What the row proves, in the lesson's words. */
  claim: string;
  cps: number;
  cycles: number;
  same?: true;
}

/** The A1 loop (content/specs/A1.ts): 100 BPM in 4/4, the bass in note names, the riff in degrees of C major. */
const A1_CPS = 100 / 240;
const A1_BASS = 'note("<[c2 ~ c2 g1] [f1 ~ f1 c2]>")';
const A1_RIFF = 'n("<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 0 ~]>").scale("C4:major")';
const A1_PAD = 'n("<[4 ~ 2 ~] [5 ~ 3 ~]>").scale("C4:major")';
const A1_SNARE = 's("~ sd ~ sd")';
const a1 = (
  lesson: string,
  id: string | undefined,
  control: string,
  base: string,
  withCode: string,
  claim: string,
  extra: Partial<LessonCase> = {},
): LessonCase => ({
  ...(id ? { id } : { id: "" }),
  lesson,
  control,
  value: "=",
  base,
  withCode,
  claim,
  cps: A1_CPS,
  cycles: 2,
  ...extra,
});

/** Every control A1.L01–L04 teach, in the lesson's own loop and values (content/specs/A1.ts). */
export const A1_CASES: LessonCase[] = [
  // A1.L01 Waves & Harmonics
  ...(["triangle", "square", "sawtooth"] as const).map((w) =>
    a1(
      "A1.L01",
      `snd.wave.${w}`,
      "s",
      `${A1_RIFF}.s("sine")`,
      `${A1_RIFF}.s("${w}")`,
      `a ${w} sounds unlike a sine`,
    ),
  ),
  a1(
    "A1.L01",
    "tb.partials",
    "partials",
    `${A1_RIFF}.s("sawtooth").partials([1, 0, 0, 0])`,
    `${A1_RIFF}.s("sawtooth").partials([1, 1, 1, 1])`,
    "S5: four equal harmonics are brighter than the fundamental alone",
  ),
  a1(
    "A1.L01",
    "tb.partials",
    "partials",
    `${A1_BASS}.s("sawtooth")`,
    `${A1_BASS}.s("sawtooth").partials([1, 1, 1, 1, 1, 1])`,
    "hook: six equal harmonics on the sawtooth bass change it",
  ),
  a1(
    "A1.L01",
    "tb.partials",
    "partials",
    `${A1_RIFF}.s("square")`,
    `${A1_RIFF}.s("square").partials([1, 1, 1, 1, 1]).gain(.8)`,
    "hook: five equal partials on the square riff change it",
  ),
  // A1.L02 Filters
  a1(
    "A1.L02",
    "tb.lpf",
    "lpf",
    `${A1_BASS}.s("sawtooth")`,
    `${A1_BASS}.s("sawtooth").lpf(400)`,
    "the bass under .lpf(400)",
  ),
  a1(
    "A1.L02",
    "tb.lpf",
    "lpf",
    `${A1_BASS}.s("sawtooth").lpf(4000)`,
    `${A1_BASS}.s("sawtooth").lpf(400)`,
    "S4: the starter's 4000 against the target 400",
  ),
  a1(
    "A1.L02",
    "tb.lpf",
    "lpf",
    `${A1_RIFF}.s("sawtooth").lpf(1000)`,
    `${A1_RIFF}.s("sawtooth").lpf(500)`,
    "S2: each step of <4000 2000 1000 500> is heard (the last one)",
  ),
  a1(
    "A1.L02",
    "tb.lpq",
    "lpq",
    `${A1_BASS}.s("sawtooth").lpf(400)`,
    `${A1_BASS}.s("sawtooth").lpf(400).lpq(4)`,
    "hook: .lpq(4) on the bass at 400 Hz",
  ),
  a1(
    "A1.L02",
    "tb.lpq",
    "lpq",
    `${A1_RIFF}.s("sawtooth").lpf(800).lpq(0)`,
    `${A1_RIFF}.s("sawtooth").lpf(800).lpq(10)`,
    "S5: a whistle at the cutoff from 10",
  ),
  a1(
    "A1.L02",
    "tb.lpenv",
    "lpenv",
    `${A1_RIFF}.s("sawtooth").lpf(300)`,
    `${A1_RIFF}.s("sawtooth").lpf(300).lpenv(4).lpd(.2)`,
    "S6: the pluck, up four octaves and back in 0.2 s",
  ),
  a1(
    "A1.L02",
    "tb.hpf",
    "hpf",
    `${A1_RIFF}.s("square")`,
    `${A1_RIFF}.s("square").hpf(400)`,
    "the riff under .hpf(400)",
  ),
  a1(
    "A1.L02",
    "tb.bpf",
    "bpf",
    `${A1_RIFF}.s("sawtooth")`,
    `${A1_RIFF}.s("sawtooth").bpf(800)`,
    "the riff through .bpf(800)",
  ),
  // A1.L03 Envelopes
  a1(
    "A1.L03",
    "tb.adsr",
    "decay",
    `${A1_BASS}.s("sawtooth").lpf(500)`,
    `${A1_BASS}.s("sawtooth").lpf(500).decay(.2).sustain(0)`,
    "S4: the plucked bass",
  ),
  a1(
    "A1.L03",
    "tb.adsr",
    "attack",
    `${A1_PAD}.s("square").gain(.7)`,
    `${A1_PAD}.s("square").attack(.3).release(.8).gain(.7)`,
    "S5: the riff swells in and rings on",
  ),
  a1(
    "A1.L03",
    "tb.adsr",
    "attack",
    `${A1_PAD}.s("square")`,
    `${A1_PAD}.s("square").attack(.3)`,
    "attack alone",
  ),
  a1(
    "A1.L03",
    "tb.adsr",
    "release",
    `${A1_PAD}.s("square")`,
    `${A1_PAD}.s("square").release(.8)`,
    "release alone",
  ),
  a1(
    "A1.L03",
    "tb.adsr",
    "sustain",
    `${A1_PAD}.s("square")`,
    `${A1_PAD}.s("square").sustain(0)`,
    "mistake: .sustain(0) alone makes each note a click",
  ),
  a1(
    "A1.L03",
    undefined,
    "decay",
    `${A1_BASS}.s("sawtooth").lpf(500).decay(.2).sustain(0)`,
    `${A1_BASS}.s("sawtooth").lpf(500).decay(.2)`,
    "S4 equivalent: .decay(.2) alone sounds as .decay(.2).sustain(0)",
    { same: true },
  ),
  // A1.L04 Space
  a1("A1.L04", "tb.room", "room", A1_SNARE, `${A1_SNARE}.room(.5)`, "the snare in a room"),
  a1(
    "A1.L04",
    "tb.roomsize",
    "roomsize",
    `${A1_SNARE}.room(.5)`,
    `${A1_SNARE}.room(.5).roomsize(6)`,
    "hook: a big room (size 6) against the default",
  ),
  a1(
    "A1.L04",
    "tb.roomsize",
    "roomsize",
    `${A1_SNARE}.room(.5).roomsize(1)`,
    `${A1_SNARE}.room(.5).roomsize(6)`,
    "S5: a small room against a big one",
  ),
  a1(
    "A1.L04",
    "tb.delay",
    "delay",
    `${A1_RIFF}.s("square").lpf(2000)`,
    `${A1_RIFF}.s("square").lpf(2000).delay(.4)`,
    "the riff echoes",
  ),
  a1(
    "A1.L04",
    "tb.delaytime",
    "delaytime",
    `${A1_RIFF}.s("square").lpf(2000).delay(.4)`,
    `${A1_RIFF}.s("square").lpf(2000).delay(.4).delaytime(.3)`,
    "hook: half a beat (0.3 s) against the left-out default (0.45 s at 100 BPM)",
  ),
  a1(
    "A1.L04",
    "tb.delaytime",
    "delaytime",
    `${A1_RIFF}.s("square").delay(.4).delaytime(.6).delayfeedback(.3)`,
    `${A1_RIFF}.s("square").delay(.4).delaytime(.3).delayfeedback(.3)`,
    "S4: the starter's 0.6 against the target 0.3",
  ),
  a1(
    "A1.L04",
    "tb.delayfeedback",
    "delayfeedback",
    `${A1_RIFF}.s("square").delay(.4).delaytime(.3).delayfeedback(.7)`,
    `${A1_RIFF}.s("square").delay(.4).delaytime(.3).delayfeedback(.3)`,
    "S4: the starter's 0.7 against the target 0.3",
  ),
  a1(
    "A1.L04",
    "tb.delayfeedback",
    "delayfeedback",
    `${A1_RIFF}.s("square").delay(.5).delaytime(.3).delayfeedback(.2)`,
    `${A1_RIFF}.s("square").delay(.5).delaytime(.3).delayfeedback(.7)`,
    'S3: the two bars of delayfeedback("<.2 .7>")',
  ),
  // Orbits: the riff's small room shares the snare's orbit, so one reverb keeps switching size; orbit 2 gives the
  // riff its own (S5).
  a1(
    "A1.L04",
    "tb.orbit",
    "orbit",
    `stack(${A1_SNARE}.room(.5).roomsize(6), ${A1_PAD}.s("square").lpf(2000).room(.3).roomsize(1))`,
    `stack(${A1_SNARE}.room(.5).roomsize(6), ${A1_PAD}.s("square").lpf(2000).room(.3).roomsize(1).orbit(2))`,
    "S5: two rooms on one orbit, then the riff on its own",
  ),
  // The hook moves the echoing riff to orbit 2 while only the snare has a room: nothing on orbit 1 sets a delay,
  // so this is reported (does the hook's .orbit(2) change what is heard?), never used to decide tb.orbit.
  a1(
    "A1.L04",
    undefined,
    "orbit",
    `stack(${A1_SNARE}.room(.5).roomsize(6), ${A1_RIFF}.s("square").lpf(2000).delay(.4).delaytime(.3).delayfeedback(.4))`,
    `stack(${A1_SNARE}.room(.5).roomsize(6), ${A1_RIFF}.s("square").lpf(2000).delay(.4).delaytime(.3).delayfeedback(.4).orbit(2))`,
    "hook: .orbit(2) on the echoing riff when only the snare has a room",
  ),
];

/** U08.L05's bass tone: each bass sound, darker and brighter under the bass preset `.lpf()`, at 96 BPM. */
const U08_BASS = 'n("<[0 ~ 0 4] [5 ~ 5 9] [3 ~ 3 7] [4 ~ 4 8]>").scale("C2:major")';
export const BASS_TONE_CASES: LessonCase[] = (
  ["ebass", "fingerbass", "upright", "sawtooth"] as const
).flatMap((sound) => [
  {
    id: "tb.lpf",
    lesson: "U08.L05",
    control: "lpf",
    value: "=",
    base: `${U08_BASS}.s("${sound}")`,
    withCode: `${U08_BASS}.s("${sound}").lpf(600)`,
    claim: `the bass preset .lpf(600) darkens ${sound}`,
    cps: 96 / 240,
    cycles: 2,
  },
  {
    id: "tb.lpf",
    lesson: "U08.L05",
    control: "lpf",
    value: "=",
    base: `${U08_BASS}.s("${sound}").lpf(1200)`,
    withCode: `${U08_BASS}.s("${sound}").lpf(400)`,
    claim: `moving .lpf() from 1200 to 400 is heard on ${sound}`,
    cps: 96 / 240,
    cycles: 2,
  },
]);

/** Every U08–U11 lesson context and A1 row, in the order audibility.pw.ts renders them. */
export const LESSON_CASES: LessonCase[] = [...A1_CASES, ...BASS_TONE_CASES];

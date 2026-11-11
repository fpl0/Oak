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
];

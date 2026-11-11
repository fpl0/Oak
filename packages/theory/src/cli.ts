// The `theory` CLI (AUTHORING §9.2): content reviewers re-derive every note, interval, chord, numeral, cadence
// and schema claim with it. Pure: `runTheoryCli(args)` returns the text; `cli.bun.ts` is the process host.
import { type KeySpec, METER_IDS, type MeterId, parseRat } from "@oak/content-kit";
import {
  barPosition,
  bpmToCpm,
  CHORD_TABLE,
  characteristicTones,
  chordFamilyOf,
  chordInDict,
  chordNotes,
  chordPcs,
  circleOfFifths,
  classifyCadence,
  degreeOf,
  diatonicChords,
  displayName,
  euclid,
  formatRN,
  formatScaleName,
  functionOf,
  gridSteps,
  gridToMini,
  identifyChord,
  intervalBetween,
  intervalSemitones,
  invertInterval,
  isCanonicalCode,
  keySignature,
  METERS,
  midiToFreq,
  normalizeText,
  noteToMidi,
  parallelKey,
  parseChordWithBass,
  parseKeyText,
  parseNote,
  parseRN,
  parseScaleArg,
  RHYTHM_GRIDS,
  relativeKey,
  rhythmGrid,
  rnToChord,
  romanOf,
  SCHEMAS,
  scaleNotes,
  scalePcs,
  schemaMatch,
  spellMidi,
  stepToMidi,
  strudelStep,
  tempoLine,
  toAbcChord,
  toCode,
  toJazzGlyph,
  toLeadSheet,
  transposeKey,
  VOICING_DICTS,
  type VoicingDict,
} from "./index.ts";
import type { ChordId, NoteTextKind, RomanNumeral } from "./types.ts";

export const CLI_HELP = `theory <op> [args]   (keys: C:major, Eb, F#m, A:harmonic:minor, D_dorian; output is JSON)

notes and intervals
  note <name...>                 Strudel note names → MIDI, scientific name, frequency ("cs4", "ef", "f4")
  spell <midi> [key] [--chord X] [--up|--down]   spell a MIDI note in context
  interval <low> <high>          interval name ("C4" "E5" → M10; "F" "B" → A4)
  invert <interval>              m3 → M6
keys, scales, degrees
  scale <key>                    notes, pitch classes, signature, .scale() name, characteristic tones
  keysig <key>  |  relative <key>  |  parallel <key>  |  transpose <key> <semitones>  |  circle
  degree <note|midi> <key>       degree, syllable, n step
  step <degree> <key>            the n value for a degree ("#4" C:major → "3#")
  n <scale> <step...>            what n("…").scale(scale) plays ("C4:major" 0 2 4 3# 6b)
chords
  chord <symbol>                 every dialect, tones, pitch classes, family, dictionary matrix
  dict <symbol> [dict]           ok | missing | wrong | unknown-chord
  identify <note|midi...> [--bass X] [--rootless]   name sounding notes (hand voicings only)
  diatonic <key> [--sevenths]
Roman numerals, function, cadences, schemas
  rn <chord> <key> [next]        Roman numeral of a chord (C/E for inversions)
  chord-of <rn> <key>            the chord of a numeral ("V65/V" C)
  function <rn> <key>
  cadence <rn> <rn> <key> [--melody-not-tonic]
  progression <key> <chord...>   numerals, functions, schema
  schema <key> <rn...>  |  schemas
time
  meter <id> [bpm]  |  tempo <bpm> <meter>  |  pos <onset> <meter> [--pickup]
  euclid <k> <n> [rotation]  |  grid [id]
text
  normalize <note|chord|rn|interval|key> <text>`;

class CliError extends Error {}
const fail = (msg: string): never => {
  throw new CliError(msg);
};

function keyArg(text: string | undefined): KeySpec {
  if (!text) return fail("missing key");
  const k = parseKeyText(text.replace(/_/g, " "));
  return k ?? fail(`not a key: ${text}`);
}
function chordArg(text: string | undefined): ChordId {
  if (!text) return fail("missing chord");
  return parseChordWithBass(text) ?? fail(`not a chord symbol: ${text}`);
}
function rnArg(text: string | undefined, key: KeySpec): RomanNumeral {
  if (!text) return fail("missing Roman numeral");
  return parseRN(text, key) ?? fail(`not a Roman numeral: ${text}`);
}
function midiArg(text: string | undefined): number {
  if (!text) return fail("missing note");
  if (/^-?\d+$/.test(text)) return Number(text);
  return noteToMidi(text) ?? fail(`not a note: ${text}`);
}
function meterArg(text: string | undefined): MeterId {
  if (!text || !(METER_IDS as readonly string[]).includes(text))
    return fail(`meter must be one of ${METER_IDS.join(" ")}`);
  return text as MeterId;
}
const keyText = (k: KeySpec) => `${k.tonic} ${k.mode}`;
function chordInfo(c: ChordId) {
  return {
    code: toCode(c),
    leadSheet: toLeadSheet(c),
    jazz: toJazzGlyph(c),
    abc: toAbcChord(c),
    quality: c.quality,
    notes: chordNotes(c),
    pcs: chordPcs(c),
    ...(c.bassPc !== c.rootPc ? { bass: c.bass ?? null } : {}),
  };
}

function run(op: string, a: string[], flags: Set<string>, opts: Map<string, string>): unknown {
  switch (op) {
    case "note":
      return a.map((n) => {
        const p = parseNote(n) ?? fail(`not a Strudel note: ${n}`);
        const s = spellMidi(p.midi, { key: null });
        return {
          input: n,
          midi: p.midi,
          name: `${p.letter}${p.alt > 0 ? "#".repeat(p.alt) : "b".repeat(-p.alt)}${p.oct}`,
          defaultedOctave: p.defaultedOctave,
          hz: Math.round(midiToFreq(p.midi) * 100) / 100,
          defaultSpelling: s.name,
        };
      });
    case "spell": {
      const midi = midiArg(a[0]);
      const key = a[1] ? keyArg(a[1]) : null;
      const chord = opts.get("chord");
      const ctx: Parameters<typeof spellMidi>[1] = { key };
      if (chord) ctx.chord = chordArg(chord);
      if (flags.has("up")) ctx.direction = 1;
      if (flags.has("down")) ctx.direction = -1;
      const s = spellMidi(midi, ctx);
      return { ...s, display: displayName(s) };
    }
    case "interval": {
      const name = intervalBetween(a[0] ?? fail("missing note"), a[1] ?? fail("missing note"));
      return { interval: name, semitones: intervalSemitones(name), inversion: invertInterval(name) };
    }
    case "invert":
      return { interval: a[0], inversion: invertInterval(a[0] ?? fail("missing interval")) };
    case "scale": {
      const k = keyArg(a[0]);
      return {
        key: keyText(k),
        notes: scaleNotes(k),
        pcs: scalePcs(k),
        signature: keySignature(k),
        scaleArg: formatScaleName(k, 4),
        characteristic: characteristicTones(k.mode),
        relative: keyText(relativeKey(k)),
        parallel: keyText(parallelKey(k)),
      };
    }
    case "keysig":
      return keySignature(keyArg(a[0]));
    case "relative":
      return keyText(relativeKey(keyArg(a[0])));
    case "parallel":
      return keyText(parallelKey(keyArg(a[0])));
    case "transpose":
      return keyText(transposeKey(keyArg(a[0]), Number(a[1] ?? fail("missing semitones"))));
    case "circle":
      return circleOfFifths().map((e) => ({
        accidentals: e.accidentals,
        major: e.major.tonic,
        minor: e.minor.tonic,
        ...(e.enharmonic ? { enharmonic: e.enharmonic.tonic } : {}),
      }));
    case "degree": {
      const k = keyArg(a[1]);
      const midi = midiArg(a[0]);
      return { ...degreeOf(midi, k), note: spellMidi(midi, { key: k }).name };
    }
    case "step": {
      const k = keyArg(a[1]);
      const deg = a[0] ?? fail("missing degree");
      const step = strudelStep(deg as never, k);
      const ref = parseScaleArg(formatScaleName(k, 4));
      const midi = ref
        ? stepToMidi(step, { tonic: ref.tonic, octave: 4, mode: k.mode, strudelName: ref.def.strudelName })
        : null;
      return {
        degree: deg,
        step,
        code: `n("${step}").scale("${formatScaleName(k, 4)}")`,
        midi,
        note: midi === null ? null : spellMidi(midi, { key: k }).name,
      };
    }
    case "n": {
      const ref = parseScaleArg(a[0] ?? fail("missing scale")) ?? fail(`not a .scale() argument: ${a[0]}`);
      const key: KeySpec | null = ref.def.mode ? { tonic: ref.tonic, mode: ref.def.mode } : null;
      return a.slice(1).map((s) => {
        const step = /^-?\d+$/.test(s) ? Number(s) : s;
        const midi = stepToMidi(step, {
          tonic: ref.tonic,
          octave: ref.octave,
          mode: ref.def.mode ?? "major",
          strudelName: ref.def.strudelName,
        });
        return {
          step: s,
          midi,
          note: spellMidi(midi, { key }).name,
          ...(key ? { degree: degreeOf(midi, key).degree } : {}),
        };
      });
    }
    case "chord": {
      const sym = a[0] ?? fail("missing chord");
      const c = chordArg(sym);
      const dicts: Record<string, string> = {};
      for (const d of VOICING_DICTS) dicts[d] = chordInDict(sym, d);
      return {
        input: sym,
        canonical: isCanonicalCode(sym),
        family: chordFamilyOf(sym.split("/")[0] ?? sym),
        ...chordInfo(c),
        dicts,
      };
    }
    case "dict": {
      const sym = a[0] ?? fail("missing chord");
      const dict = (a[1] ?? "ireal") as VoicingDict;
      if (!(VOICING_DICTS as readonly string[]).includes(dict))
        fail(`dict must be one of ${VOICING_DICTS.join(" ")}`);
      return { symbol: sym, dict, status: chordInDict(sym, dict) };
    }
    case "identify": {
      const midis = a.map(midiArg);
      const bass = opts.get("bass");
      const o: Parameters<typeof identifyChord>[1] = {};
      if (bass) o.bassPc = (((midiArg(/\d/.test(bass) ? bass : `${bass}3`) % 12) + 12) % 12) as never;
      if (flags.has("rootless")) o.allowRootless = true;
      return identifyChord(midis, o)
        .slice(0, 5)
        .map((c) => ({ chord: toLeadSheet(c), code: toCode(c), fit: c.fit }));
    }
    case "diatonic": {
      const k = keyArg(a[0]);
      return diatonicChords(k, flags.has("sevenths")).map((c) => ({
        rn: formatRN(romanOf(c, k)),
        chord: toLeadSheet(c),
        code: toCode(c),
      }));
    }
    case "rn": {
      const k = keyArg(a[1]);
      const c = chordArg(a[0]);
      const rn = romanOf(c, k, a[2] ? chordArg(a[2]) : undefined);
      return { chord: toLeadSheet(c), key: keyText(k), rn: formatRN(rn), function: functionOf(rn, k) };
    }
    case "chord-of": {
      const k = keyArg(a[1]);
      const rn = rnArg(a[0], k);
      return { rn: formatRN(rn), key: keyText(k), ...chordInfo(rnToChord(rn, k)) };
    }
    case "function": {
      const k = keyArg(a[1]);
      const rn = rnArg(a[0], k);
      return { rn: formatRN(rn), function: functionOf(rn, k) };
    }
    case "cadence": {
      const k = keyArg(a[2]);
      return {
        cadence: classifyCadence(
          rnArg(a[0], k),
          rnArg(a[1], k),
          k,
          flags.has("melody-not-tonic") ? { melodyOnTonic: false } : {},
        ),
      };
    }
    case "progression": {
      const k = keyArg(a[0]);
      const chords = a.slice(1).map(chordArg);
      const rns = chords.map((c, i) => romanOf(c, k, chords[i + 1]));
      const m = schemaMatch(rns, SCHEMAS, k);
      return {
        key: keyText(k),
        rn: rns.map(formatRN),
        function: rns.map((r) => functionOf(r, k)),
        schema: m ? { id: m.schema.id, title: m.schema.title, rotation: m.rotation } : null,
      };
    }
    case "schema": {
      const k = keyArg(a[0]);
      const m = schemaMatch(
        a.slice(1).map((t) => rnArg(t, k)),
        SCHEMAS,
        k,
      );
      return m ? { id: m.schema.id, title: m.schema.title, rotation: m.rotation } : null;
    }
    case "schemas":
      return SCHEMAS.map((s) => ({
        id: s.id,
        title: s.title,
        mode: s.mode,
        rn: s.rn.join(" "),
        ...(s.slotBars ? { slotBars: s.slotBars } : {}),
      }));
    case "meter": {
      const m = METERS[meterArg(a[0])];
      const bpm = a[1] ? Number(a[1]) : null;
      return { ...m, ...(bpm ? { tempoLine: tempoLine(bpm, m), cpm: bpmToCpm(bpm, m) } : {}) };
    }
    case "tempo": {
      const bpm = Number(a[0] ?? fail("missing bpm"));
      const m = meterArg(a[1]);
      return {
        bpm,
        meter: m,
        tempoLine: tempoLine(bpm, m),
        cpm: bpmToCpm(bpm, m),
        cps: bpmToCpm(bpm, m) / 60,
      };
    }
    case "pos": {
      const onset = parseRat(a[0] ?? fail("missing onset"));
      return barPosition(onset, meterArg(a[1]), flags.has("pickup") ? { units: [1, 1] } : undefined);
    }
    case "euclid": {
      const g = euclid(Number(a[0]), Number(a[1]), a[2] ? Number(a[2]) : 0);
      return {
        grid: g.map((b) => (b ? "x" : ".")).join(""),
        mini: `x(${a[0]},${a[1]}${a[2] ? `,${a[2]}` : ""})`,
      };
    }
    case "grid": {
      if (!a[0]) return RHYTHM_GRIDS.map((g) => g.id);
      const g =
        rhythmGrid(a[0]) ?? fail(`unknown grid ${a[0]}; one of ${RHYTHM_GRIDS.map((x) => x.id).join(" ")}`);
      return {
        ...g,
        steps: gridSteps(g)
          .map((b) => (b ? "x" : "."))
          .join(""),
        mini: gridToMini(g),
      };
    }
    case "normalize": {
      const kind = a[0] as NoteTextKind;
      if (!["note", "chord", "rn", "interval", "key"].includes(kind))
        fail("kind must be note|chord|rn|interval|key");
      return { kind, input: a.slice(1).join(" "), normalized: normalizeText(kind, a.slice(1).join(" ")) };
    }
    case "table":
      return CHORD_TABLE.map((r) => ({
        quality: r.quality,
        code: `C${r.code}`,
        leadSheet: `C${r.leadSheet}`,
        jazz: `C${r.jazz}`,
        family: r.family,
        dicts: r.dicts,
      }));
    default:
      return fail(`unknown op "${op}"`);
  }
}

/** Runs one CLI command. Exit code 0 with JSON on success, 1 with a message on a usage error, 0 with help. */
export function runTheoryCli(argv: readonly string[]): { code: number; out: string } {
  const [op, ...rest] = argv;
  if (!op || op === "help" || op === "--help" || op === "-h") return { code: 0, out: CLI_HELP };
  const flags = new Set<string>();
  const opts = new Map<string, string>();
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i] as string;
    if (t === "--chord" || t === "--bass") {
      opts.set(t.slice(2), rest[++i] ?? "");
    } else if (t.startsWith("--")) flags.add(t.slice(2));
    else args.push(t);
  }
  try {
    return { code: 0, out: JSON.stringify(run(op, args, flags, opts), null, 2) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, out: `theory ${op}: ${msg}\n\n${CLI_HELP}` };
  }
}

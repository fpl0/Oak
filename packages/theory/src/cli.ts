// The `theory` CLI (AUTHORING §9.2): content reviewers re-derive every note, interval, chord, numeral, cadence
// and schema claim with it. Pure: `runTheoryCli(args)` returns the text; `cli.bun.ts` is the process host.
import { type KeySpec, METER_IDS, type MeterId, parseRat } from "@oak/content-kit";
import {
  cadenceOf,
  chordOfRoman,
  chordSymbol,
  harmonicFunction,
  readChord,
  romanParts,
  romanText,
  toneRole,
} from "./harmony.ts";
import {
  approachKind,
  approachTones,
  BLUE_NOTES,
  barPosition,
  bassRole,
  blueNoteOf,
  bluesKey,
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
  fifthsNeighbours,
  formatRN,
  formatScaleName,
  functionOf,
  gridSteps,
  gridToMini,
  identifyChord,
  intervalBetween,
  intervalInKey,
  intervalOf,
  intervalSemitones,
  invertInterval,
  isCanonicalCode,
  isDominantSeventhPcs,
  isDominantSeventhSymbol,
  keySignature,
  keyTwins,
  labelPitch,
  METERS,
  type MinorForm,
  midiToFreq,
  minorDegrees,
  minorKey,
  minorKeyChords,
  minorScaleNotes,
  normalizeText,
  noteToMidi,
  type PentatonicKind,
  parallelKey,
  parseChordWithBass,
  parseInterval,
  parseKeyText,
  parseNote,
  parseRN,
  parseScaleArg,
  parseStrudelInterval,
  pentatonicKey,
  RHYTHM_GRIDS,
  relativeKey,
  rhythmGrid,
  rnToChord,
  romanOf,
  SCHEMAS,
  scaleDegrees,
  scaleNotes,
  scalePcs,
  schemaChords,
  schemaMatch,
  signatureOf,
  spellBlueNote,
  spellMidi,
  stepToMidi,
  strudelInterval,
  strudelStep,
  type TwelveBarForm,
  tempoLine,
  toAbcChord,
  toCode,
  toJazzGlyph,
  toLeadSheet,
  transposeKey,
  twelveBarChords,
  twelveBarFormOf,
  twelveBarPlan,
  VOICING_DICTS,
  type VoicingDict,
} from "./index.ts";

const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;

import { CLI_HELP_WAVE6, runWave6Op, seventhsTable } from "./cli-wave6.ts";
import type { ChordId, NoteTextKind, RomanNumeral, SchemaDef } from "./types.ts";

export const CLI_HELP = `theory <op> [args]   (keys: C:major, Eb, F#m, A:harmonic:minor, D_dorian; output is JSON)

notes and intervals
  note <name...>                 Strudel note names → MIDI, scientific name, frequency ("cs4", "ef", "f4")
  spell <midi> [key] [--chord X] [--up|--down]   spell a MIDI note in context
  interval <low> <high>          interval name ("C4" "E5" → M10; "F" "B" → A4)
  invert <interval>              m3 → M6
  between <a> <b> [key]          generic and specific interval, direction, Strudel string ("C4" "Eb4"; MIDI spelled in key)
  ivl <name|strudel> [--down]    an interval name both ways: M3 ↔ "3M", m2 down ↔ "-2m", semitones
keys, scales, degrees
  scale <key>                    notes, pitch classes, signature, .scale() name, characteristic tones
  keysig <key>  |  relative <key>  |  parallel <key>  |  transpose <key> <semitones>  |  circle
  degree <note|midi> <key>       degree, syllable, n step
  label <note|midi> <key> [--up|--down]   degree (b3, #4), syllable and spelling in the key (the lenses' label)
  signature <key|fifths> [--minor]        sharps or flats in written order, and the two keys that share them
  neighbours <key>               circle of fifths: clockwise, counterclockwise, relative, parallel
  degree-interval <deg> <deg> <key> [--down]   interval from one degree to another, spelled in the key (7 4 C → d5)
  step <degree> <key>            the n value for a degree ("#4" C:major → "3#")
  n <scale> <step...>            what n("…").scale(scale) plays ("C4:major" 0 2 4 3# 6b)
chords
  chord <symbol>                 every dialect, tones, pitch classes, family, dictionary matrix
  dict <symbol> [dict]           ok | missing | wrong | unknown-chord
  identify <note|midi...> [--bass X] [--rootless]   name sounding notes (hand voicings only)
  read <note|midi...> [--bass X] [--key K]   a triad or seventh stacked in 3rds: root, quality, inversion,
                                 names; null for a cluster ("C4 E4 G4 --bass E" → C/E, I6 in C)
  symbol <text> [--dict D]       one chord symbol in every dialect (C° Co Cdim → C°, Co; G/B → code G)
  diatonic <key> [--sevenths]
  dom7 <symbol|note...>          is it a dominant seventh? (from a symbol, or from hand-voiced notes; --bass X)
minor, pentatonic and blues (Wave 5)
  minor <tonic> [--natural|--harmonic|--melodic] [--sevenths]   notes, degrees (do-based: me le te), chords
                                 (harmonic: V and vii° with the raised 7), signature, relative and parallel
  twins <key>                    relative and parallel key ("C" → A minor and C minor)
  schema-chords <schema> <key>   a schema's chords in a key ("schema.aeolian" "A:minor" → Am F C G)
  pentatonic <tonic> <major|minor>   the five notes and their degrees
  blues <tonic>                  the blues scale, its degrees and the blue notes (♭3 ♭5 ♭7: me se te)
  blue <note|midi> <tonic> [--up|--down]   which blue note it is against the tonic, spelled by direction
  twelve-bar <tonic> [--quick] [--turnaround]   the 12-bar chorus in a key: numerals and chord symbols
  twelve-bar-of <chord...>       which 12-bar form twelve chords are (variant, turnaround), or null
bass lines (Wave 5)
  bass-role <note|midi> <chord> [--root X] [--next-chord Y] [--before] [--key K]   root, fifth, octave, third,
                                 seventh, approach or other
  approach <note|midi> <key>     the approach notes into that root: a step below and above, a half step
                                 below and above, the fifth below
Roman numerals, function, cadences, schemas
  rn <chord> <key> [next]        Roman numeral of a chord (C/E for inversions)
  chord-of <rn> <key>            the chord of a numeral ("V65/V" C)
  function <rn> <key>
  cadence <rn> <rn> <key> [--melody-not-tonic]
  cadence-of <chord> <chord> <key> [--melody X]   the cadence two chords make (PAC needs the melody on 1)
  rn-parts <rn> <key>            the (degree, quality, inversion) an RN answer is graded by
  tone <note|midi> <chord> [--prev X] [--next X] [--strong] [--next-chord Y]   chord tone or which NCT
  progression <key> <chord...>   numerals, functions, schema
  schema <key> <rn...>  |  schemas
time
  meter <id> [bpm]  |  tempo <bpm> <meter>  |  pos <onset> <meter> [--pickup]
  euclid <k> <n> [rotation]  |  grid [id]
text
  normalize <note|chord|rn|interval|key> <text>
${CLI_HELP_WAVE6}
  sevenths-table                 the five seventh qualities with their code and lead-sheet spellings`;

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
    case "between": {
      const parse = (t: string | undefined): number | string => {
        if (!t) return fail("missing note");
        if (/^-?\d+$/.test(t)) return Number(t);
        if (/^[A-Ga-g](?:##|bb|#|b)?-?\d+$/.test(t)) return t;
        return midiArg(t);
      };
      const key = a[2] ? keyArg(a[2]) : null;
      const info = intervalOf(parse(a[0]), parse(a[1]), key);
      return {
        ...info,
        strudel: strudelInterval(info.name, info.direction === "down" ? "down" : "up"),
        inversion: invertInterval(info.name),
      };
    }
    case "ivl": {
      const text = a[0] ?? fail("missing interval");
      const p = parseStrudelInterval(flags.has("down") && !text.startsWith("-") ? `-${text}` : text);
      if (!p) return fail(`not an interval name: ${text} (write M3, "3M" or "-2m")`);
      const info = parseInterval(p.name);
      return { ...p, inversion: invertInterval(p.name), compound: (info?.num ?? 0) > 8 };
    }
    case "label": {
      const k = keyArg(a[1]);
      const midi = midiArg(a[0]);
      return labelPitch(
        midi,
        k,
        flags.has("up") ? { direction: 1 } : flags.has("down") ? { direction: -1 } : {},
      );
    }
    case "signature": {
      const t = a[0] ?? fail("missing key or fifths");
      const sig = /^[-+]?\d+$/.test(t) ? signatureOf(Number(t)) : signatureOf(keyArg(t));
      return {
        fifths: sig.fifths,
        accidentals: sig.fifths > 0 ? sig.sharps : sig.flats,
        kind: sig.fifths > 0 ? "sharps" : sig.fifths < 0 ? "flats" : "none",
        major: keyText(sig.major),
        minor: keyText(sig.minor),
        ...(flags.has("minor") ? { key: keyText(sig.minor) } : { key: keyText(sig.major) }),
      };
    }
    case "neighbours": {
      const n = fifthsNeighbours(keyArg(a[0]));
      return {
        key: keyText(n.key),
        fifths: n.fifths,
        clockwise: keyText(n.clockwise),
        counterclockwise: keyText(n.counterclockwise),
        relative: keyText(n.relative),
        parallel: keyText(n.parallel),
      };
    }
    case "degree-interval": {
      const k = keyArg(a[2]);
      const info = intervalInKey(
        a[0] ?? fail("missing degree"),
        a[1] ?? fail("missing degree"),
        k,
        flags.has("down") ? { direction: "down" } : {},
      );
      return { ...info, strudel: strudelInterval(info.name, info.direction === "down" ? "down" : "up") };
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
        // A chromatic step keeps the degree it is written as (`4#` is ♯5, G♯ in C, never ♭6, A♭): the natural step
        // is spelled in the key, then the written sign moves it (corrections pass, theory-f).
        const written = /^(-?\d+)([#b]+)$/.exec(String(step));
        if (written) {
          const natural = stepToMidi(Number(written[1]), {
            tonic: ref.tonic,
            octave: ref.octave,
            mode: ref.def.mode ?? "major",
            strudelName: ref.def.strudelName,
          });
          const alt = [...(written[2] as string)].reduce((m, c) => m + (c === "#" ? 1 : -1), 0);
          return {
            step: s,
            midi,
            note: alterSpelling(spellMidi(natural, { key }).name, alt),
            ...(key ? { degree: alterDegree(degreeOf(natural, key).degree, alt) } : {}),
          };
        }
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
    case "read": {
      const midis = a.map(midiArg);
      if (midis.length === 0) fail("missing notes");
      const bass = opts.get("bass");
      const bassPc = bass ? mod12(midiArg(/\d/.test(bass) ? bass : `${bass}3`)) : mod12(Math.min(...midis));
      const r = readChord(
        midis.map((m) => mod12(m)),
        bassPc,
      );
      if (!r) return null;
      const k = opts.get("key");
      const key = k ? keyArg(k) : null;
      return {
        leadSheet: r.leadSheet,
        code: r.code,
        root: r.root,
        quality: r.quality,
        inversion: r.inversion,
        slash: r.slash,
        ...(key
          ? { key: keyText(key), rn: romanText(r.chord, key), function: harmonicFunction(r.chord, key) }
          : {}),
      };
    }
    case "symbol": {
      const text = a.join(" ");
      if (!text) fail("missing chord symbol");
      const dict = opts.get("dict") as VoicingDict | undefined;
      if (dict && !(VOICING_DICTS as readonly string[]).includes(dict))
        fail(`dict must be one of ${VOICING_DICTS.join(" ")}`);
      const out = {
        input: text,
        leadSheet: chordSymbol(text, "lead-sheet"),
        code: chordSymbol(text, "code", dict ? { dict } : {}),
        jazz: chordSymbol(text, "jazz"),
        abc: chordSymbol(text, "abc"),
        ...(dict ? { dict, inDict: chordInDict(chordSymbol(text, "code") ?? text, dict) } : {}),
      };
      return out.leadSheet === null ? fail(`not a chord symbol: ${text}`) : out;
    }
    case "cadence-of": {
      const k = keyArg(a[2]);
      const m = opts.get("melody");
      return {
        key: keyText(k),
        rn: [romanText(chordArg(a[0]), k, chordArg(a[1])), romanText(chordArg(a[1]), k)],
        cadence: cadenceOf(chordArg(a[0]), chordArg(a[1]), k, m ? { melodyMidi: midiArg(m) } : {}),
      };
    }
    case "rn-parts": {
      const k = keyArg(a[1]);
      const parts = romanParts(a[0] ?? fail("missing Roman numeral"), k);
      if (!parts) fail(`not a plain Roman numeral: ${a[0]}`);
      const c = chordOfRoman(a[0] as string, k) as ChordId;
      return { rn: a[0], key: keyText(k), ...parts, chord: toLeadSheet(c), function: harmonicFunction(c, k) };
    }
    case "tone": {
      const midi = midiArg(a[0]);
      const c = chordArg(a[1]);
      const prev = opts.get("prev");
      const next = opts.get("next");
      const nextChord = opts.get("next-chord");
      return {
        note: spellMidi(midi, { key: null }).name,
        chord: toLeadSheet(c),
        role: toneRole(midi, c, {
          strong: flags.has("strong"),
          ...(prev ? { prev: midiArg(prev) } : {}),
          ...(next ? { next: midiArg(next) } : {}),
          ...(nextChord ? { nextChord: chordArg(nextChord) } : {}),
        }),
      };
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
    case "dom7": {
      if (a.length === 1 && !/^-?\d+$/.test(a[0] as string) && parseChordWithBass(a[0] as string))
        return { symbol: a[0], dominantSeventh: isDominantSeventhSymbol(a[0] as string) };
      const midis = a.map(midiArg);
      const bass = opts.get("bass");
      return {
        notes: midis,
        dominantSeventh: isDominantSeventhPcs(midis, bass ? mod12(midiArg(bass)) : mod12(Math.min(...midis))),
      };
    }
    case "minor": {
      const tonic = a[0] ?? fail("missing tonic");
      parseKeyText(tonic) ?? fail(`not a tonic: ${tonic}`);
      const form: MinorForm = flags.has("harmonic")
        ? "harmonic"
        : flags.has("melodic")
          ? "melodic"
          : "natural";
      const key = minorKey(tonic, form);
      const twins = keyTwins(key);
      return {
        key: keyText(key),
        form,
        notes: minorScaleNotes(tonic, form),
        degrees: minorDegrees(form).map((d) => ({ degree: d.degree, syllable: d.syllable, n: d.n })),
        signature: keySignature({ tonic, mode: "minor" }).notes,
        relative: keyText(twins.relative),
        parallel: keyText(twins.parallel),
        // Melodic minor's own chords (i ii III+ IV V vi° vii°), never harmonic minor's under its name; its sevenths
        // are not built (corrections pass, theory-e).
        chords:
          form === "melodic"
            ? flags.has("sevenths")
              ? fail(
                  "the seventh chords of melodic minor are not built (its III is an augmented major seventh)",
                )
              : diatonicChords({ tonic, mode: "melodic minor" }).map((c) => ({
                  rn: romanText(c, { tonic, mode: "minor" }),
                  symbol: toLeadSheet(c),
                  code: toCode(c),
                }))
            : minorKeyChords(tonic, {
                form: form === "natural" ? "natural" : "harmonic",
                seventh: flags.has("sevenths"),
              }).map((c) => ({ rn: c.rn, symbol: c.symbol, code: toCode(c.chord) })),
      };
    }
    case "twins": {
      const t = keyTwins(keyArg(a[0]));
      return { relative: keyText(t.relative), parallel: keyText(t.parallel) };
    }
    case "schema-chords": {
      const id = a[0] ?? fail("missing schema");
      if (!SCHEMAS.some((s) => s.id === id)) fail(`unknown schema ${id}`);
      return schemaChords(id as SchemaDef["id"], keyArg(a[1])).map((c) => toLeadSheet(c));
    }
    case "pentatonic": {
      const tonic = a[0] ?? fail("missing tonic");
      const kind = a[1] ?? fail("missing major|minor");
      if (kind !== "major" && kind !== "minor") fail("kind must be major or minor");
      const k = pentatonicKey(tonic, kind as PentatonicKind);
      return { key: keyText(k), notes: scaleNotes(k), degrees: scaleDegrees(k) };
    }
    case "blues": {
      const tonic = a[0] ?? fail("missing tonic");
      const k = bluesKey(tonic);
      const t = 60 + mod12(noteToMidi(`${tonic}4`) ?? fail(`not a tonic: ${tonic}`));
      return {
        key: keyText(k),
        notes: scaleNotes(k),
        degrees: scaleDegrees(k),
        blueNotes: BLUE_NOTES.map((b) => ({
          degree: b.degree,
          name: b.name,
          syllable: b.syllable,
          up: spellBlueNote(t + b.semitones, k, 1).name,
          down: spellBlueNote(t + b.semitones, k, -1).name,
        })),
      };
    }
    case "blue": {
      const midi = midiArg(a[0]);
      const tonic = a[1] ?? fail("missing tonic");
      const k = { tonic, mode: "major" } as KeySpec;
      const b = blueNoteOf(midi, k);
      const dir = flags.has("up") ? 1 : flags.has("down") ? -1 : undefined;
      return b ? { ...b, spelled: spellBlueNote(midi, k, dir).name } : null;
    }
    case "twelve-bar": {
      const tonic = a[0] ?? fail("missing tonic");
      const form: TwelveBarForm = {
        variant: flags.has("quick") ? "quick-change" : "standard",
        turnaround: flags.has("turnaround"),
      };
      return {
        form,
        rn: twelveBarPlan(form),
        chords: twelveBarChords(tonic, form).map((c) => toLeadSheet(c)),
        code: twelveBarChords(tonic, form).map((c) => toCode(c)),
      };
    }
    case "twelve-bar-of": {
      const chords = a.map(chordArg);
      if (chords.length !== 12) fail("give twelve chords, one per bar");
      const tonic = (chords[0] as ChordId).rootPc;
      return twelveBarFormOf(chords.map((c) => mod12(c.rootPc - tonic)));
    }
    case "bass-role": {
      const midi = midiArg(a[0]);
      const chord = chordArg(a[1]);
      const root = opts.get("root");
      const next = opts.get("next-chord");
      const key = opts.get("key");
      const nextChord = next ? chordArg(next) : null;
      const k = key ? keyArg(key) : null;
      return {
        role: bassRole(midi, chord, {
          ...(root ? { rootMidi: midiArg(root) } : {}),
          ...(nextChord ? { nextChord } : {}),
          beforeChange: flags.has("before"),
          key: k,
        }),
        approach: nextChord ? approachKind(midi, nextChord, k) : null,
      };
    }
    case "approach":
      return approachTones(midiArg(a[0]), keyArg(a[1]));
    case "table":
      return CHORD_TABLE.map((r) => ({
        quality: r.quality,
        code: `C${r.code}`,
        leadSheet: `C${r.leadSheet}`,
        jazz: `C${r.jazz}`,
        family: r.family,
        dicts: r.dicts,
      }));
    case "sevenths-table":
      return seventhsTable();
    default: {
      // Wave 6 (U12–U17): cli-wave6.ts.
      const out = runWave6Op(op, a, flags, opts);
      return out === undefined ? fail(`unknown op "${op}"`) : out;
    }
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
    if (
      [
        "--chord",
        "--bass",
        "--key",
        "--melody",
        "--prev",
        "--next",
        "--next-chord",
        "--dict",
        "--from",
        "--kind",
      ].includes(t)
    ) {
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

/** A spelled note moved by `alt` half steps on its own letter: `alterSpelling("G4", 1)` → "G#4". */
export function alterSpelling(name: string, alt: number): string {
  const m = /^([A-G])([#b]*)(-?\d+)$/.exec(name);
  if (!m) return name;
  const acc = [...(m[2] as string)].reduce((x, c) => x + (c === "#" ? 1 : -1), 0) + alt;
  return `${m[1]}${acc > 0 ? "#".repeat(acc) : "b".repeat(-acc)}${m[3]}`;
}
/** A degree moved by `alt` half steps: `alterDegree("5", 1)` → "#5", `alterDegree("b3", 1)` → "3". */
export function alterDegree(degree: string, alt: number): string {
  const m = /^([#b]*)(\d+)$/.exec(degree);
  if (!m) return degree;
  const acc = [...(m[1] as string)].reduce((x, c) => x + (c === "#" ? 1 : -1), 0) + alt;
  return `${acc > 0 ? "#".repeat(acc) : "b".repeat(-acc)}${m[2]}`;
}

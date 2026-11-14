// The Wave 6 ops of the `theory` CLI (U12–U17; AUTHORING §19): sevenths and guide tones, interval facts, modes,
// chromatic degrees, applied and borrowed chords, pivots and key plans, beat grids and pushes. Each op is one
// call of `wave6.ts`, printed as JSON, so a reviewer re-derives a lesson's claim with the code the app runs.
import { type KeySpec, METER_IDS, type MeterId } from "@oak/content-kit";
import { parseChordWithBass, toCode, toLeadSheet } from "./chords.ts";
import { noteToMidi } from "./notes.ts";
import { parseKeyText } from "./text.ts";
import type { ChordId } from "./types.ts";
import {
  APPLIED_KINDS,
  type AppliedKind,
  appliedChords,
  appliedReading,
  appliedTargets,
  beatGrid,
  borrowedChords,
  CHROMATIC_DEGREE_TABLE,
  CHROMATIC_SOLFEGE,
  characteristicTonesOf,
  chromaticChordKind,
  chromaticLabel,
  compoundInterval,
  dominantChain,
  dorianFour,
  guideToneLine,
  guideTones,
  intervalFacts,
  keyDisplay,
  keyDistance,
  keyLiftScale,
  keySevenths,
  modalChords,
  modalProgression,
  modeColour,
  modesContaining,
  outsideChordKind,
  parentMajor,
  parseKeyPlan,
  picardy,
  pivotChords,
  pushAmount,
  SEVENTH_CHORDS,
  seventhFromPcs,
  seventhInfo,
  seventhQualityOf,
} from "./wave6.ts";

export const CLI_HELP_WAVE6 = `sevenths, guide tones, intervals (Wave 6, U12)
  sevenths <key> [--harmonic]    the seventh chord on every degree: numeral, symbol, code (minor: --harmonic for V7, vii°7)
  seventh <symbol | note...> [--bass X]   which of the five seventh qualities: from a symbol, or from hand-voiced notes
  guide <chord...> [--from third|seventh]   the 3rd and 7th of each chord and the guide-tone line through them
  interval-facts <name>          simple form, octaves, inversion, semitones ("M10" → M3 + an octave, inverts to m6)
modes (U14)
  mode <key>                     the colour note, the colour chords, the characteristic progression, the parent major
  modes-of <tonic> <note...>     the taught modes on a tonic whose scale holds every note, brightest first
chromatic degrees, applied and borrowed chords (U15, U16)
  chromatic <key>                the ten chromatic degrees: syllable, note, n step, where each resolves
  chromatic-label <note|midi> <key> [--chord X] [--up|--down]   ♯ or ♭ by the chord under it, then by direction
  applied <key> [--kind V|V7|viio|viio7]   every applied chord of a key with its target and leading tone
  applied-of <chord> <key> [next]   how a chord reads as an applied chord, and whether it resolves
  chain <key> [n]                a chain of dominants into V ("C" 4 → E7 A7 D7 G7)
  borrowed <key>                 major: iv ♭VI ♭VII ♭III ii° from the parallel minor; minor: the Picardy I, the Dorian IV
  chord-kind <chord> <key> [next]   diatonic | applied | borrowed | picardy | dorian-iv | other
key changes (U17)
  pivots <from> <to>             the chords two keys share, named in both; the distance between the keys
  key-plan <scale-arg>           a patterned .scale() read bar by bar ("<C4:major!16 D4:major!8>")
  lift <tonic> <barsBefore> <semitones> <barsAfter>   the .scale() argument of a lifted last section
rhythm II (U13)
  beat-grid <meter> [--triplets] beats and subdivisions with their counts (6/8: 1 la li 2 la li)
  push <meter> <8|16>            what .early() takes to push by an eighth or a sixteenth`;

class CliError extends Error {}
const fail = (msg: string): never => {
  throw new CliError(msg);
};
const keyArg = (text: string | undefined): KeySpec =>
  (text ? parseKeyText(text.replace(/_/g, " ")) : null) ?? fail(text ? `not a key: ${text}` : "missing key");
const chordArg = (text: string | undefined): ChordId =>
  (text ? parseChordWithBass(text) : null) ?? fail(text ? `not a chord symbol: ${text}` : "missing chord");
const midiArg = (text: string | undefined): number => {
  if (!text) return fail("missing note");
  if (/^-?\d+$/.test(text)) return Number(text);
  return noteToMidi(text) ?? fail(`not a note: ${text}`);
};
const meterArg = (text: string | undefined): MeterId =>
  text && (METER_IDS as readonly string[]).includes(text)
    ? (text as MeterId)
    : fail(`meter must be one of ${METER_IDS.join(" ")}`);
const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
const keyChords = (cs: readonly { rn: string; symbol: string; chord: ChordId }[]) =>
  cs.map((c) => ({ rn: c.rn, symbol: c.symbol, code: toCode(c.chord) }));

/** The ops this file knows. */
export const WAVE6_OPS = [
  "sevenths",
  "seventh",
  "guide",
  "interval-facts",
  "mode",
  "modes-of",
  "chromatic",
  "chromatic-label",
  "applied",
  "applied-of",
  "chain",
  "borrowed",
  "chord-kind",
  "pivots",
  "key-plan",
  "lift",
  "beat-grid",
  "push",
] as const;

/** Runs a Wave 6 op; `undefined` when `op` is not one of them. Usage errors throw with the message to print. */
export function runWave6Op(op: string, a: string[], flags: Set<string>, opts: Map<string, string>): unknown {
  switch (op) {
    case "sevenths": {
      const key = keyArg(a[0]);
      return keyChords(keySevenths(key, flags.has("harmonic") ? { form: "harmonic" } : {}));
    }
    case "seventh": {
      const first = a[0] ?? fail("missing chord symbol or notes");
      if (a.length === 1 && !/^-?\d+$/.test(first) && parseChordWithBass(first)) {
        const q = seventhQualityOf(first);
        return q ? { symbol: first, ...seventhInfo(q) } : { symbol: first, quality: null };
      }
      const midis = a.map(midiArg);
      const bass = opts.get("bass");
      const hit = seventhFromPcs(midis.map(mod12), bass ? mod12(midiArg(bass)) : mod12(Math.min(...midis)));
      return hit
        ? {
            quality: hit.quality,
            symbol: hit.symbol,
            inversion: hit.inversion,
            name: seventhInfo(hit.quality).name,
          }
        : null;
    }
    case "guide": {
      if (a.length === 0) fail("give one chord or more");
      const chords = a.map(chordArg);
      const from = opts.get("from");
      if (from !== undefined && from !== "third" && from !== "seventh") fail("--from is third or seventh");
      const start = (from ?? "third") as "third" | "seventh";
      return {
        chords: chords.map((c) => {
          const g = guideTones(c);
          return { symbol: toLeadSheet(c), third: g.third?.name ?? null, seventh: g.seventh?.name ?? null };
        }),
        line: guideToneLine(chords, { start }).map((s) =>
          s ? { chord: toLeadSheet(s.chord), role: s.role, name: s.name, move: s.move } : null,
        ),
      };
    }
    case "interval-facts": {
      const name = a[0] ?? fail("missing interval");
      try {
        const f = intervalFacts(name);
        return f.compound ? f : { ...f, anOctaveUp: compoundInterval(f.name) };
      } catch {
        return fail(`not an interval: ${name}`);
      }
    }
    case "mode": {
      const key = keyArg(a[0]);
      const colour = modeColour(key.mode) ?? fail(`not a taught mode: ${key.mode}`);
      return {
        key: keyDisplay(key),
        family: colour.family,
        colour: colour.colour,
        characteristic: characteristicTonesOf(key).map((t) => ({
          degree: t.display,
          syllable: t.syllable,
          note: t.name,
          n: t.n,
        })),
        chords: keyChords(modalChords(key)),
        progression: modalProgression(key).map((c) => c.rn),
        progressionChords: modalProgression(key).map((c) => c.symbol),
        parentMajor: keyDisplay(parentMajor(key)),
        brightness: colour.brightness,
      };
    }
    case "modes-of": {
      const tonic = a[0] ?? fail("missing tonic");
      const tonicPc = mod12(noteToMidi(`${tonic}4`) ?? fail(`not a tonic: ${tonic}`));
      if (a.length < 2) fail("give the notes after the tonic");
      return modesContaining(a.slice(1).map(midiArg), tonicPc);
    }
    case "chromatic": {
      const key = keyArg(a[0]);
      const tonic = noteToMidi(`${key.tonic}4`) ?? 60;
      return {
        key: keyDisplay(key),
        up: CHROMATIC_SOLFEGE.up,
        down: CHROMATIC_SOLFEGE.down,
        degrees: CHROMATIC_DEGREE_TABLE.map((d) => ({
          degree: d.display,
          syllable: d.syllable,
          note: chromaticLabel(tonic + d.semitones, key, { direction: d.raised ? 1 : -1 }).name,
          n: d.step,
          resolvesTo: d.resolvesTo,
        })),
      };
    }
    case "chromatic-label": {
      const midi = midiArg(a[0]);
      const key = keyArg(a[1]);
      const chord = opts.get("chord");
      const direction = flags.has("up") ? 1 : flags.has("down") ? -1 : undefined;
      return chromaticLabel(midi, key, {
        ...(chord ? { chord: chordArg(chord) } : {}),
        ...(direction !== undefined ? { direction } : {}),
      });
    }
    case "applied": {
      const key = keyArg(a[0]);
      const kind = opts.get("kind");
      if (kind !== undefined && !(APPLIED_KINDS as readonly string[]).includes(kind))
        fail(`--kind is one of ${APPLIED_KINDS.join(" ")}`);
      return {
        targets: appliedTargets(key).map((t) => `${t.rn} (${t.symbol})`),
        chords: appliedChords(key, kind ? [kind as AppliedKind] : ["V", "V7"]).map((c) => ({
          rn: c.rn,
          symbol: c.symbol,
          code: toCode(c.chord),
          target: `${c.target.rn} (${c.target.symbol})`,
          leadingTone: `${c.leadingTone.name} (${c.leadingTone.display}) → ${c.leadingTone.resolvesTo}`,
          chromatic: c.chromatic,
        })),
      };
    }
    case "applied-of": {
      const chord = chordArg(a[0]);
      const key = keyArg(a[1]);
      const next = a[2] ? chordArg(a[2]) : undefined;
      const r = appliedReading(chord, key, next);
      return r
        ? {
            rn: r.rn,
            kind: r.kind,
            target: `${r.target.rn} (${r.target.symbol})`,
            resolves: next ? r.resolves : null,
          }
        : null;
    }
    case "chain": {
      const key = keyArg(a[0]);
      const n = a[1] === undefined ? 4 : Number(a[1]);
      if (!Number.isInteger(n) || n < 1 || n > 7) fail("length is 1 to 7");
      return dominantChain(key, n).map((c) => ({
        symbol: c.symbol,
        rn: c.rn,
        byRoot: c.chainRn,
        code: toCode(c.chord),
      }));
    }
    case "borrowed": {
      const key = keyArg(a[0]);
      if (key.mode === "major")
        return borrowedChords(key).map((b) => ({
          rn: b.rn,
          symbol: b.symbol,
          code: toCode(b.chord),
          from: b.sourceRn,
          lowered: b.lowered,
          lesson: b.lesson,
        }));
      if (key.mode !== "minor") fail("give a major or a minor key");
      const p = picardy(key);
      const d = dorianFour(key);
      return {
        picardy: { rn: p.rn, symbol: p.symbol, raised: `${p.raised.name} (${p.raised.degree})` },
        dorianFour: { rn: d.rn, symbol: d.symbol, raised: `${d.raised.name} (${d.raised.degree})` },
      };
    }
    case "chord-kind": {
      const chord = chordArg(a[0]);
      const key = keyArg(a[1]);
      const next = a[2] ? chordArg(a[2]) : undefined;
      return { kind: chromaticChordKind(chord, key, next), outside: outsideChordKind(chord, key, next) };
    }
    case "pivots": {
      const from = keyArg(a[0]);
      const to = keyArg(a[1]);
      return {
        from: keyDisplay(from),
        to: keyDisplay(to),
        distance: keyDistance(from, to),
        pivots: pivotChords(from, to).map((p) => ({ symbol: p.symbol, inFrom: p.from, inTo: p.to })),
      };
    }
    case "key-plan": {
      const arg = a.join(" ") || fail("missing .scale() argument");
      const plan = parseKeyPlan(arg) ?? fail(`not a key plan: ${arg}`);
      return {
        totalBars: plan.totalBars,
        spans: plan.spans.map((s) => ({
          key: keyDisplay(s.key),
          bars: `${s.fromBar + 1}–${s.fromBar + s.bars}`,
          text: s.text,
        })),
        changes: plan.changes.map((c) => ({
          bar: c.bar + 1,
          from: keyDisplay(c.from),
          to: keyDisplay(c.to),
          relation: c.distance.relation,
          semitones: c.distance.semitones,
        })),
      };
    }
    case "lift": {
      const tonic = a[0] ?? fail("missing tonic");
      const [before, semis, after] = [a[1], a[2], a[3]].map((x) => Number(x));
      if (![before, semis, after].every((x) => Number.isInteger(x)))
        fail("lift <tonic> <barsBefore> <semitones> <barsAfter>");
      return { scale: keyLiftScale(tonic, before as number, semis as number, after as number) };
    }
    case "beat-grid": {
      const g = beatGrid(meterArg(a[0]), { triplets: flags.has("triplets") });
      return {
        meter: g.meter,
        beats: g.beats,
        division: g.division,
        compound: g.compound,
        counts: g.lines.map((l) => l.label).join(" "),
        lines: g.lines.map((l) => ({ at: `${l.at[0]}/${l.at[1]}`, level: l.level, label: l.label })),
      };
    }
    case "push": {
      const by = Number(a[1]);
      if (by !== 8 && by !== 16) fail("push <meter> <8|16>");
      const p = pushAmount(meterArg(a[0]), by as 8 | 16);
      return { cycles: `${p.cycles[0]}/${p.cycles[1]}`, code: p.code };
    }
    default:
      return undefined;
  }
}
/** The five seventh qualities as a table (`theory sevenths-table`). */
export const seventhsTable = () =>
  SEVENTH_CHORDS.map((s) => ({
    quality: s.quality,
    name: s.name,
    code: `C${s.code}`,
    leadSheet: `C${s.leadSheet}`,
  }));

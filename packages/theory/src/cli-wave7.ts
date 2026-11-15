// The Wave 7 ops of the `theory` CLI (the advanced tracks; AUTHORING §20): ii–V–I in a key, a chord's tensions and
// scales, a voicing's type, a substitution, a Euclidean pattern, a clave, a swing ratio, microtiming in ms. Each op
// is one call of `wave7.ts`, printed as JSON, so a reviewer re-derives a lesson's claim with the code the app runs.
import { METER_IDS, type MeterId } from "@oak/content-kit";
import { chordPcs, parseChordWithBass, toCode, toLeadSheet } from "./chords.ts";
import { noteToMidi } from "./notes.ts";
import { euclid } from "./rhythm.ts";
import type { ChordId } from "./types.ts";
import {
  availableTensions,
  backdoor,
  CHORD_SCALE_NAMES,
  CHORD_SCALES,
  type ChordScaleId,
  chordScales,
  claveOf,
  claveSteps,
  coltraneCycle,
  diminishedPassing,
  drop2,
  euclidIdentity,
  jazzSymbol,
  lateFor,
  lateMs,
  meterGroups,
  polymeterPeriod,
  rootlessVoicing,
  secondaryTwoFive,
  shellVoicing,
  swingAmount,
  swingOffbeat,
  swingRatio,
  tensionsOf,
  tritoneSub,
  twoFiveOne,
  twoFiveOnesAllKeys,
  voicingType,
} from "./wave7.ts";

export const CLI_HELP_WAVE7 = `jazz, rhythm and sound (Wave 7, the advanced tracks)
  two-five <tonic> [major|minor] [--all]        ii–V–I in a key (or all twelve round the cycle of 4ths)
  tensions <chord> [--scale <id>]               chord-scales, tensions and avoid notes of a chord
  voicing-type <chord> <note...>                the voicing of sounding notes (octave-aware: drop-2, rootless A/B, shell)
  voice <chord> shell|rootless-a|rootless-b|drop-2   build a voicing (MIDI and names)
  sub <chord> tritone|backdoor|secondary|dim <to>     a reharmonisation device for a chord
  coltrane [tonic]                              the Coltrane cycle
  euclid-id <steps> <onset...>                  which E(k, n, r) a bar of onsets is
  clave son|rumba 3-2|2-3 | clave-of <step...>  a clave on the two-bar 16-step grid, or which clave steps are
  swing <amount> | swing --ratio <r>            amount ↔ long:short ratio and where the off-beat lands
  late <cycles> <bpm> [meter] | late --ms <ms> <bpm>   microtiming in milliseconds at a tempo, or back
  groups <meter> | polymeter <steps> <perBar>   odd-meter groupings; the bars a polymeter takes to line up`;

const chordArg = (s: string | undefined): ChordId => {
  const c = s ? parseChordWithBass(s) : null;
  if (!c) throw new Error(`not a chord: ${s ?? "(none)"}`);
  return c;
};
const names = (midis: readonly number[]): string[] =>
  midis.map((m) => {
    const pcs = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    return `${pcs[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  });

/** Runs one Wave 7 op, or returns `undefined` when `op` is not one. */
export function runWave7Op(op: string, a: string[], flags: Set<string>, opts: Map<string, string>): unknown {
  switch (op) {
    case "two-five": {
      const mode = a[1] === "minor" ? "minor" : "major";
      if (flags.has("all"))
        return twoFiveOnesAllKeys(mode).map((t) => ({
          key: `${t.key.tonic} ${t.key.mode}`,
          symbols: t.symbols,
        }));
      const t = twoFiveOne(a[0] ?? "C", mode);
      return { key: `${t.key.tonic} ${t.key.mode}`, symbols: t.symbols, rn: t.rn };
    }
    case "tensions": {
      const c = chordArg(a[0]);
      const scale = opts.get("scale") as ChordScaleId | undefined;
      if (scale && !(scale in CHORD_SCALES)) throw new Error(`unknown scale: ${scale}`);
      return {
        chord: toLeadSheet(c),
        jazz: jazzSymbol(c).glyph,
        scales: chordScales(c).map((id) => ({ id, name: CHORD_SCALE_NAMES[id] })),
        tensions: tensionsOf(c, scale).map((t) => ({ label: t.label, semis: t.semis, avoid: t.avoid })),
        available: availableTensions(c, scale).map((t) => t.label),
      };
    }
    case "voicing-type": {
      const c = chordArg(a[0]);
      const midis = a.slice(1).map((n) => {
        const m = noteToMidi(n);
        if (m === null) throw new Error(`not a note with an octave: ${n}`);
        return m;
      });
      return { chord: toLeadSheet(c), notes: names(midis), ...voicingType(midis, c) };
    }
    case "voice": {
      const c = chordArg(a[0]);
      const kind = a[1] ?? "shell";
      const midis =
        kind === "rootless-a"
          ? rootlessVoicing(c, "A")
          : kind === "rootless-b"
            ? rootlessVoicing(c, "B")
            : kind === "drop-2"
              ? drop2(closeOf(c))
              : shellVoicing(c);
      return { chord: toLeadSheet(c), kind, midis, notes: names(midis), reads: voicingType(midis, c).type };
    }
    case "sub": {
      const c = chordArg(a[0]);
      switch (a[1]) {
        case "tritone":
          return { from: toLeadSheet(c), to: toLeadSheet(tritoneSub(c)) };
        case "backdoor":
          return { tonic: a[0], chords: backdoor(a[0] as string).map((x) => toCode(x)) };
        case "secondary":
          return { target: toLeadSheet(c), chords: secondaryTwoFive(c).map((x) => toCode(x)) };
        case "dim": {
          const to = chordArg(a[2]);
          const d = diminishedPassing(c, to);
          return { from: toLeadSheet(c), to: toLeadSheet(to), passing: d ? toCode(d) : null };
        }
        default:
          throw new Error("sub <chord> tritone|backdoor|secondary|dim <to>");
      }
    }
    case "coltrane":
      return coltraneCycle(a[0] ?? "B").map((x) => toCode(x));
    case "euclid-id": {
      const steps = Number(a[0]);
      const onsets = a.slice(1).map(Number);
      const id = euclidIdentity(onsets, steps);
      return id
        ? {
            ...id,
            mini: `x(${id.pulses},${id.steps}${id.rotation ? `,${id.rotation}` : ""})`,
            pattern: euclid(id.pulses, id.steps, id.rotation)
              .map((b) => (b ? "x" : "~"))
              .join(" "),
          }
        : null;
    }
    case "clave": {
      const type = a[0] === "rumba" ? "rumba" : "son";
      const dir = a[1] === "2-3" ? "2-3" : "3-2";
      const steps = claveSteps(type, dir);
      return {
        type,
        direction: dir,
        steps,
        bars: [steps.filter((s) => s < 8), steps.filter((s) => s >= 8).map((s) => s - 8)],
      };
    }
    case "clave-of":
      return claveOf(a.map(Number));
    case "swing": {
      if (opts.has("ratio") || flags.has("ratio")) {
        const r = Number(opts.get("ratio") ?? a[0]);
        return { ratio: r, amount: swingAmount(r) };
      }
      const amount = Number(a[0] ?? "0.3333333333");
      return {
        amount,
        ratio: swingRatio(amount),
        offbeat8: swingOffbeat(amount, 8),
        offbeat16: swingOffbeat(amount, 16),
      };
    }
    case "late": {
      const meter = (a[2] && (METER_IDS as readonly string[]).includes(a[2]) ? a[2] : "4/4") as MeterId;
      if (opts.has("ms")) {
        const ms = Number(opts.get("ms"));
        const bpm = Number(a[0]);
        return { ms, bpm, cycles: lateFor(ms, bpm, meter) };
      }
      const cycles = Number(a[0]);
      const bpm = Number(a[1]);
      const ms = lateMs(cycles, bpm, meter);
      return {
        cycles,
        bpm,
        ms,
        feel: ms >= 8 && ms <= 45 ? "a feel" : ms > 45 ? "a displacement" : "on the grid",
      };
    }
    case "groups":
      return meterGroups((a[0] ?? "7/8") as MeterId);
    case "polymeter": {
      const steps = Number(a[0]);
      const perBar = Number(a[1]);
      return { steps, perBar, bars: polymeterPeriod(steps, perBar) };
    }
    default:
      return undefined;
  }
}
/** The close voicing of a seventh chord from its root up, inside an octave (C4 E4 G4 B4). */
function closeOf(c: ChordId): number[] {
  const root = 60 + c.rootPc;
  const rel = [...new Set(chordPcs(c).map((pc) => (((pc - c.rootPc) % 12) + 12) % 12))].sort((x, y) => x - y);
  return rel.slice(0, 4).map((x) => root + x);
}

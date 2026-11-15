// Chords built on the staff (`StaffExpect` `chords`, Wave 4, U05.CP): one chord per symbol, in order; a chord
// is the notes that start together. Each chord must hold exactly its symbol's pitch classes (any octave, any
// stacking); `spelling: "strict"` checks the letters too; `bass: true` checks the lowest note (the root, or
// the note after the slash). A miss names the actual mistake: a wrong note, a misspelling, the bass.
import type { Diagnostic, KeySpec, MeterId, NEvent, PickupSpec, Rat, VoicingShape } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import { chordNotes, chordPcs, parseChordWithBass, toLeadSheet } from "@oak/theory";
import { locAt, mod12, pitched } from "../analyze/events.ts";
import { diag } from "../feedback/catalog.ts";
import { bassMember } from "../match/harmony.ts";
import type { AnswerCheck } from "./answers.ts";
import { staffName, staffSlip } from "./answers.ts";
import { voicingShapeCheck } from "./answers-wave7.ts";

export interface StaffChordsExpect {
  symbols: readonly string[];
  spelling: "strict" | "enharmonic";
  bass: boolean;
  /** Wave 7 (`staff-expect.voicing`): each chord also written in this shape, octave-aware. */
  voicing?: VoicingShape | VoicingShape[];
}

/** The chords of a staff answer: notes that start together, in time order. */
export function staffChordGroups(
  staff: readonly NEvent[],
): { at: Rat; notes: (NEvent & { midi: number })[] }[] {
  const groups = new Map<string, (NEvent & { midi: number })[]>();
  for (const e of pitched(staff)) {
    const k = `${e.onset[0]}/${e.onset[1]}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()]
    .map((notes) => ({ at: (notes[0] as NEvent).onset, notes: notes.sort((a, b) => a.midi - b.midi) }))
    .sort((a, b) => R.cmp(a.at, b.at));
}

const letters = (names: readonly string[]): string[] => names.map((n) => n.replace(/-?\d+$/, "")).sort();

export function staffChordsCheck(
  expect: StaffChordsExpect,
  staff: readonly NEvent[],
  o: { key: KeySpec | null; meter: MeterId; pickup?: PickupSpec },
): AnswerCheck {
  const pos = { meter: o.meter, ...(o.pickup ? { pickup: o.pickup } : {}) };
  const groups = staffChordGroups(staff);
  const want = expect.symbols.map((s) => parseChordWithBass(s.trim()));
  const diagnostics: Diagnostic[] = [];
  const slots: number[] = [];
  const n = Math.max(want.length, groups.length);
  let pcsOk = 0;
  let bassOk = 0;
  let spellOk = 0;
  for (let i = 0; i < n; i++) {
    const c = want[i];
    const g = groups[i];
    if (c === undefined) {
      slots.push(0);
      if (g)
        diagnostics.push(
          diag(
            "harmony.extra-chord",
            {},
            locAt(g.at, pos, { slot: i + 1, noteIds: g.notes.map((x) => x.id) }),
            "harmonicRhythm",
          ),
        );
      continue;
    }
    if (!g) {
      slots.push(0);
      const last = groups[groups.length - 1];
      const at = last ? R.add(last.at, last.notes[0]?.dur ?? [1, 4]) : ([0, 1] as Rat);
      diagnostics.push(
        diag(
          "harmony.missing-chord",
          { exp: expect.symbols[i] ?? "" },
          locAt(at, pos, { slot: i + 1 }),
          "harmonicRhythm",
        ),
      );
      continue;
    }
    if (c === null) {
      slots.push(0);
      continue;
    }
    const chord = c as ChordId;
    const target = [...new Set(chordPcs(chord).map(mod12))].sort((a, b) => a - b);
    const have = [...new Set(g.notes.map((x) => mod12(x.midi)))].sort((a, b) => a - b);
    const where = locAt(g.at, pos, { slot: i + 1, noteIds: g.notes.map((x) => x.id) });
    // Wave 7 (`staff-expect.voicing`): a shell has no 5th and a rootless voicing no root, so the chord is read by
    // its shape over the symbol (octave-aware), not by the triad's pitch classes.
    const shaped = expect.voicing
      ? voicingShapeCheck(
          g.notes.map((x) => x.midi),
          expect.symbols[i] ?? "",
          expect.voicing,
        )
      : null;
    const samePcs = shaped
      ? shaped.ok
      : target.length === have.length && target.every((p, k) => p === have[k]);
    const inter = target.filter((p) => have.includes(p)).length;
    const union = new Set([...target, ...have]).size;
    const pcsCredit = samePcs ? 1 : union === 0 ? 0 : (inter / union) * 0.5;
    if (samePcs) pcsOk++;
    else if (shaped)
      diagnostics.push(
        diag("harmony.voicing-shape", { slot: i + 1, got: shaped.got, want: shaped.want }, where, "quality"),
      );
    else
      diagnostics.push(
        diag(
          "harmony.pcset",
          {
            // The learner's notes as written on the staff; the target spelled by its chord (C E G♯ for C+).
            got:
              [...new Set(g.notes.map((x) => staffName(x, o.key).replace(/-?\d+$/, "")))].join(" ") ||
              "nothing",
            exp: chordNotes(chord).join(" "),
          },
          where,
          "quality",
        ),
      );
    let spellCredit = 1;
    if (expect.spelling === "strict" && samePcs) {
      const wrote = g.notes.map((x) => staffName(x, o.key));
      const shouldBe = chordNotes(chord);
      const got = letters(wrote);
      const exp = letters(shouldBe);
      const same = got.length === exp.length && got.every((x, k) => x === exp[k]);
      if (same) spellOk++;
      else {
        spellCredit = 0.5;
        // Name the first misspelled note: the written note whose pitch class is right but whose name is not.
        const bad = wrote.find((w) => !shouldBe.includes(w.replace(/-?\d+$/, "")));
        const target1 = bad ? shouldBe.find((sb) => sameSound(sb, bad)) : undefined;
        diagnostics.push(
          bad && target1
            ? staffSlip("enharmonic", target1, bad.replace(/-?\d+$/, ""), i, o.key)
            : diag("id.chord-spelling", { exp: toLeadSheet(chord), got: wrote.join(" ") }, where, "spelling"),
        );
      }
    } else spellOk++;
    let bassCredit = 1;
    if (expect.bass) {
      const low = g.notes[0]?.midi;
      if (low !== undefined && mod12(low) === chord.bassPc) bassOk++;
      else {
        bassCredit = 0;
        if (samePcs)
          diagnostics.push(diag("harmony.inversion", { member: bassMember(chord) }, where, "inversion"));
      }
    }
    const parts = [
      pcsCredit * 0.6,
      ...(expect.spelling === "strict" ? [spellCredit * 0.2] : []),
      ...(expect.bass ? [bassCredit * 0.2] : []),
    ];
    const wsum = 0.6 + (expect.spelling === "strict" ? 0.2 : 0) + (expect.bass ? 0.2 : 0);
    slots.push(parts.reduce((a, b) => a + b, 0) / wsum);
  }
  const score = n === 0 ? 0 : slots.reduce((a, b) => a + b, 0) / n;
  const k = Math.max(1, want.length);
  return {
    score,
    dims: {
      quality: { score: pcsOk / k, weight: 0.6, n: want.length },
      ...(expect.spelling === "strict"
        ? { spelling: { score: spellOk / k, weight: 0.2, n: want.length } }
        : {}),
      ...(expect.bass ? { bass: { score: bassOk / k, weight: 0.2, n: want.length } } : {}),
    },
    diagnostics,
    slots,
  };
}

function sameSound(a: string, b: string): boolean {
  const pa = /^([A-G])(##|bb|#|b)?/.exec(a);
  const pb = /^([A-G])(##|bb|#|b)?/.exec(b);
  if (!pa || !pb) return false;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (x?: string) => (x === "#" ? 1 : x === "##" ? 2 : x === "b" ? -1 : x === "bb" ? -2 : 0);
  return (
    mod12((base[pa[1] as string] as number) + acc(pa[2])) ===
    mod12((base[pb[1] as string] as number) + acc(pb[2]))
  );
}

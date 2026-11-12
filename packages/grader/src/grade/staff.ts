// Staff writing with pitch and rhythm (`StaffExpect` `events`, Wave 3): the events matcher compares
// sounding pitch and time; this pass reads what the learner WROTE. A note an octave off, a note on the
// right line or space with the wrong accidental, and a note that sounds right but is spelled against the
// key are three different findings (`staff.octave`, `staff.accidental`, `staff.enharmonic`), never one
// generic "wrong note". Pure.
import type { Diagnostic, KeySpec, NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { spellMidi } from "@oak/theory";
import type { PosContext } from "../analyze/events.ts";
import { locAt, mod12 } from "../analyze/events.ts";
import type { MatchResult } from "../types.ts";
import { staffSlip, staffSlipKind } from "./answers.ts";

/** How a reference event is written in the key: its own spelling (`note("F#4")`), else spelled in the key. */
export function expectedSpelling(e: NEvent, key: KeySpec | null): string | null {
  if (e.midi === null) return null;
  if (e.written && /^[A-G](?:##|bb|#|b)?-?\d+$/.test(e.written)) return e.written;
  return spellMidi(e.midi, { key }).name;
}

/**
 * Refines an events-matcher result for a staff answer: `melody.octave` and an accidental-only
 * `melody.wrong-degree` become `staff.octave` / `staff.accidental`; a note at the right time and pitch but
 * spelled against the key adds `staff.enharmonic` and half-credits that note (spelling counts on paper).
 */
export function refineStaffResult(
  m: MatchResult,
  reference: readonly NEvent[],
  answer: readonly NEvent[],
  key: KeySpec | null,
  pos: PosContext,
): MatchResult {
  const written = answer.filter((a) => a.midi !== null && a.written);
  if (written.length === 0) return m;
  const byId = new Map(answer.map((a) => [a.id, a]));
  const refAt = (a: NEvent): NEvent[] => reference.filter((t) => t.midi !== null && R.eq(t.onset, a.onset));
  const idx = (a: NEvent): number => Math.max(0, answer.indexOf(a));
  const at = (a: NEvent) => {
    const l = locAt(a.onset, pos);
    return { bar: l.bar ?? 1, beat: l.beat ?? 1, beatLabel: l.beatLabel ?? "" };
  };
  const diagnostics: Diagnostic[] = [];
  for (const d of m.diagnostics) {
    const a = d.where?.noteIds?.[0] ? byId.get(d.where.noteIds[0]) : undefined;
    if (!a?.written || a.midi === null || (d.id !== "melody.octave" && d.id !== "melody.wrong-degree")) {
      diagnostics.push(d);
      continue;
    }
    // The reference note this one stands for: same onset, nearest by pitch class then by octave.
    const cands = refAt(a);
    const t =
      cands.find((x) => mod12((x.midi as number) - (a.midi as number)) === 0) ??
      cands.sort(
        (x, y) =>
          Math.abs((x.midi as number) - (a.midi as number)) -
          Math.abs((y.midi as number) - (a.midi as number)),
      )[0];
    const exp = t ? expectedSpelling(t, key) : null;
    const kind = exp ? staffSlipKind(exp, a.written, true) : null;
    if (!exp || !kind) {
      diagnostics.push(d);
      continue;
    }
    diagnostics.push({ ...staffSlip(kind, exp, a.written, idx(a), key, at(a)), where: { ...d.where } });
  }
  // Right time and sound, written against the key.
  let misspelt = 0;
  const matched = written.filter((a) => m.overlay?.answer.some((o) => o.id === a.id && o.ok) ?? true);
  for (const a of matched) {
    const t = refAt(a).find((x) => x.midi === a.midi);
    const exp = t ? expectedSpelling(t, key) : null;
    if (!exp || !a.written || exp === a.written) continue;
    if (exp[0] === a.written[0]) continue; // same letter: an accidental question, not an enharmonic one
    misspelt++;
    const l = at(a);
    diagnostics.push({
      ...staffSlip("enharmonic", exp, a.written, idx(a), key, l),
      where: { bar: l.bar, beat: l.beat, beatLabel: l.beatLabel, noteIds: [a.id], track: a.track },
    });
  }
  if (misspelt === 0) return { ...m, diagnostics };
  const n = Math.max(1, reference.filter((t) => t.midi !== null).length);
  const share = 1 - (0.5 * misspelt) / n;
  return {
    ...m,
    score: m.score * share,
    dims: { ...m.dims, spelling: { score: share, weight: 0, n } },
    diagnostics,
  };
}

// Reading a built Score: what sounds at a cycle (highlighting), and the score back to events (staff input).
import type { NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { withIds } from "./notelist.ts";
import type { NoteItem, Score } from "./types.ts";

function* itemsOf(score: Score): Generator<NoteItem> {
  for (const s of score.staves) for (const v of s.voices) for (const b of v.bars) yield* b.items;
}

/** The `n`s of the items sounding at `cycle`, wrapped into the engraved span (for `.oak-playing`). */
export function activeNotes(score: Score, cycle: number): number[] {
  if (score.bars <= 0) return [];
  const span = score.bars;
  const pos = score.startBar + ((((cycle - score.startBar) % span) + span) % span);
  const out = new Set<number>();
  for (const it of itemsOf(score)) {
    if (it.n === null) continue;
    const a = R.toNum(it.onset);
    if (a <= pos + 1e-12 && pos < a + R.toNum(it.dur) - 1e-12) out.add(it.n);
  }
  return [...out].sort((a, b) => a - b);
}

/** The staff-input answer model back to events: tie chains become one event; spelled names go to `written`. */
export function scoreToEvents(score: Score, track = "main"): NEvent[] {
  const chains = new Map<number, { first: NoteItem; dur: Rat }>();
  for (const it of itemsOf(score)) {
    if (it.n === null || it.hidden) continue;
    const c = chains.get(it.n);
    if (c) c.dur = R.add(c.dur, it.dur);
    else chains.set(it.n, { first: it, dur: it.dur });
  }
  const out: Omit<NEvent, "id">[] = [];
  for (const { first, dur } of chains.values()) {
    const drums = first.drums ?? (first.drum ? [first.drum] : null);
    if (drums) {
      for (const d of drums) {
        out.push({
          track,
          onset: first.onset,
          dur,
          midi: null,
          pitchSource: "none",
          s: d.s,
          gain: 0.8,
          locs: [],
        });
      }
      continue;
    }
    for (const p of first.pitches) {
      out.push({
        track,
        onset: first.onset,
        dur,
        midi: p.midi,
        pitchSource: "note-str",
        written: p.name,
        gain: 0.8,
        locs: [],
      });
    }
  }
  out.sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0));
  return withIds(out);
}

/**
 * How the staff spells each engraved event, by `NEvent.id` (Wave 5): the one spelling a lens label, a tooltip or a
 * note name next to the staff should show, so text and staff never disagree (approach tones, blue notes, raised
 * 6 and 7 in minor). A unison doubled in one notehead (c5) maps both events to that head's pitch. Drum strokes and
 * rests are left out.
 */
export function spelledByEvent(score: Score): Map<string, SpelledPitch> {
  const out = new Map<string, SpelledPitch>();
  for (const s of score.staves) {
    if (s.clef === "perc") continue;
    for (const v of s.voices)
      for (const b of v.bars)
        for (const it of b.items) {
          if (it.kind === "rest" || it.tieFromPrev) continue;
          it.eventIds.forEach((id, i) => {
            // An event beyond the heads doubles one of them (`NoteItem.doubled`).
            const p = it.pitches[i] ?? it.pitches[it.doubled?.[i - it.pitches.length] ?? -1];
            if (p && !out.has(id)) out.set(id, p);
          });
        }
  }
  return out;
}

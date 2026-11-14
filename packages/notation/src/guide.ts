// Wave 6 (U12.L05, the guide-tone lens of docs/design/wave6.md §4.3): which noteheads of a Score are the 3rd and
// the 7th of the chord sounding under them. Pure; `markGuideTones` (render.dom.ts) gives those heads the classes of
// `GUIDE_TONE_CLASSES` after abcjs has drawn them, and `measureStaff` gives their boxes for the line a host draws
// through them (`NoteGeometry.heads[member]`).
import type { NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { toRat } from "./q.ts";
import { guideTonePcs } from "./theory-port.ts";
import type { NotationInput, Score } from "./types.ts";

/** Stable classes on a marked notehead: `oak-guide` plus the role's. */
export const GUIDE_TONE_CLASSES = {
  base: "oak-guide",
  third: "oak-guide-third",
  seventh: "oak-guide-seventh",
} as const;

export interface GuideToneMark {
  /** The engraved note or chord (`oak-e{n}`) and the head inside it, low to high (`NoteItem.pitches[member]`). */
  n: number;
  member: number;
  /** The event that head engraves. */
  eventId: string;
  role: "third" | "seventh";
  /** The head's spelled pitch ("F#4") and the chord it is read against, in code spelling ("D7"). */
  pitch: string;
  chord: string;
  onset: Rat;
}

/**
 * The guide tones on the staff: every notehead whose pitch class is the 3rd or the 7th of the chord sounding where
 * the note starts. The chord is the event's own `chordSymbol` (a `chord().voicing()` line; pass `events`), else the
 * last of `chords` at or before the note (`NotationInput.chords`: absolute 0-based bars, 1-based beats), else the
 * Score's own chord symbols. A triad marks its 3rd only; a chord the table does not know marks nothing. Tied
 * continuations are not listed again: a mark holds for the whole tie chain (`n`).
 */
export function guideToneMarks(
  score: Score,
  opts: {
    events?: readonly Pick<NEvent, "id" | "chordSymbol">[];
    chords?: NotationInput["chords"];
  } = {},
): GuideToneMark[] {
  const upb = score.meter.unitsPerBar;
  const list: { at: Rat; symbol: string }[] = opts.chords
    ? opts.chords.map((c) => ({
        at: R.add([c.bar, 1], R.div(toRat(c.beat - 1), [upb, 1])),
        symbol: c.symbol,
      }))
    : (score.chords ?? []).map((c) => ({ at: c.at, symbol: c.source }));
  list.sort((a, b) => R.cmp(a.at, b.at));
  const own = new Map((opts.events ?? []).flatMap((e) => (e.chordSymbol ? [[e.id, e.chordSymbol]] : [])));
  const chordAt = (t: Rat): string | undefined => {
    let found: string | undefined;
    for (const c of list) if (R.lte(c.at, t)) found = c.symbol;
    return found;
  };
  const out: GuideToneMark[] = [];
  const seen = new Set<string>();
  for (const staff of score.staves) {
    if (staff.clef === "perc") continue;
    for (const v of staff.voices)
      for (const b of v.bars)
        for (const it of b.items) {
          if (it.n === null || it.kind === "rest" || it.tieFromPrev) continue;
          it.pitches.forEach((p, member) => {
            const eventId = it.eventIds[member];
            if (eventId === undefined || seen.has(`${it.n}|${member}`)) return;
            const symbol = own.get(eventId) ?? chordAt(it.onset);
            const g = symbol ? guideTonePcs(symbol) : null;
            if (!symbol || !g) return;
            const pc = ((p.midi % 12) + 12) % 12;
            const role = pc === g.third ? "third" : pc === g.seventh ? "seventh" : null;
            if (!role) return;
            seen.add(`${it.n}|${member}`);
            out.push({
              n: it.n as number,
              member,
              eventId,
              role,
              pitch: p.name,
              chord: symbol,
              onset: it.onset,
            });
          });
        }
  }
  return out.sort((a, b) => R.cmp(a.onset, b.onset) || a.n - b.n || a.member - b.member);
}

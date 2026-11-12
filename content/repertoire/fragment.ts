// Oak's own renditions of the repertoire fragments U03 uses (contracts §2.8): a `song.ts` per song, built
// from its registry entry (content/repertoire/index.ts) so title, year, status, provenance, key, meter and
// form are stated once. Each answer key is the fragment the unit spec prints (content/specs/U03.ts), in
// the key of the cited edition, as degrees: no pickup (it starts at a full bar, or with a rest on beat 1),
// no dot, no tie, nothing over a bar line, so U03 can play it before U07.L08 and U13.L03.
//
// `verifiedBy` is required by the schema (a human who checked the answer key against the cited edition).
// No human has yet: the registry entries stay `verified: false` and every song here says "pending". The
// notes are cross-checked by repertoire.test.ts against a transcription written separately in 1-based
// degrees and beats, and against the spec's letters.
import { defineSong, type SongDef, type SongId } from "@oak/content-kit";
import { songById } from "./index.ts";

export const PENDING_VERIFIER = "pending: no human has checked this answer key against the cited edition yet";

export interface Fragment {
  id: SongId;
  bpm: number;
  /** `n()` mini-notation over the entry's key at octave 4, one cycle a bar. */
  degrees: string;
  bars: number;
  /** How the plain-rhythm setting departs from the source, in words. */
  setting: string;
}

export const scaleOf = (s: { key: { tonic: string; mode: string } }): string =>
  `${s.key.tonic}4:${s.key.mode}`;

export function fragmentSong(f: Fragment): SongDef {
  const entry = songById.get(f.id);
  if (!entry) throw new Error(`no repertoire entry ${f.id}`);
  const melody = `n("${f.degrees}").scale("${scaleOf(entry)}")`;
  return defineSong({
    id: entry.id,
    title: entry.title,
    year: entry.year,
    status: entry.status,
    provenance: entry.provenance,
    verifiedBy: PENDING_VERIFIER,
    key: entry.key,
    meter: entry.meter,
    bpm: f.bpm,
    form: entry.form,
    answerKey: {
      bars: f.bars,
      code: `setcpm(${f.bpm}/4)\n\nmel: ${melody}.s("piano")`,
      layers: { melody },
      phrases: [[1, f.bars]],
    },
    ...(entry.availableFrom ? { availableFrom: entry.availableFrom } : {}),
  });
}

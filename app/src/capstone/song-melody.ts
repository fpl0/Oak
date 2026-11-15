// The picked song's melody as the grader reads it (carry f4; docs/design/wave7.md §3.2 `GradeContext.songMelody`):
// the answer key's melody layer evaluated once, note by note, with bars counted from the first full bar (a pickup's
// notes are negative). CF-T's arrangement session, JC3's contrafact, JC4's reharmonisation and AC1's two versions
// pass it, so `song-melody-kept` and `contrafact` compare the learner's tune with the song's own. The evaluation is
// injected (the browser's grader host, or the headless grader in tests). The query is cached per song for the
// page's life.
import type { MeterId, Rat, SongDef } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { type EvalOptions, type EvalResult, normalize, type SongMelodyNote } from "@oak/grader";
import { queryOptions, useQuery } from "@tanstack/react-query";

export type Analyze = (code: string, opts: EvalOptions) => Promise<EvalResult>;

/** The melody layer as a one-track piece (`melody:`), or `null` when the answer key has no melody layer. */
export function melodyLayerCode(song: Pick<SongDef, "answerKey">): string | null {
  const layer = song.answerKey.layers.melody?.trim();
  if (!layer) return null;
  return `melody: ${layer.replace(/^[A-Za-z_$][\w$]*\s*:\s*/, "")}`;
}

/** The song's melody, note by note, from its answer key (`[]` with no melody layer or one that does not run). */
export async function songMelodyOf(
  song: Pick<SongDef, "answerKey" | "meter" | "pickup">,
  analyze: Analyze,
): Promise<SongMelodyNote[]> {
  const code = melodyLayerCode(song);
  if (!code) return [];
  const shift = song.pickup ? 1 : 0;
  const bars = song.answerKey.bars + shift;
  const ev = await analyze(code, { mode: "capstone", bars, lint: null, meter: song.meter as MeterId });
  if (!ev.ok) return [];
  const n = normalize(ev, { meter: song.meter as MeterId });
  const back: Rat = [shift, 1];
  return (n.byTrack.melody ?? [])
    .filter((e) => e.midi !== null && R.toNum(e.onset) < bars - 1e-9)
    .sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi as number) - (b.midi as number))
    .map((e) => ({ onset: R.sub(e.onset, back), dur: e.dur, midi: e.midi as number }));
}

/** The song's melody for the browser, evaluated once per song through the shared grader host. */
export function useSongMelody(song: Pick<SongDef, "id" | "answerKey" | "meter" | "pickup"> | null) {
  return useQuery(
    queryOptions({
      queryKey: ["capstone-song-melody", song?.id ?? null] as const,
      queryFn: async () => {
        if (!song) return [];
        const { analyzeCode } = await import("../lib/grader-client.ts");
        return songMelodyOf(song, (code, opts) => analyzeCode(code, opts));
      },
      enabled: song !== null,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    }),
  );
}

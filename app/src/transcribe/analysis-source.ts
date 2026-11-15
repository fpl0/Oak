// A song's chart as the analysis stage reads it (`SongDef` → `AnalysisSource`). The page loads the one song it
// analyses (songs.ts: one chunk per song, so the answer keys of the songs not chosen never reach the page).
import type { SongDef } from "@oak/content-kit";
import type { AnalysisSource } from "./analysis.ts";

/** The chart, the key plan and the sections of a song with an answer key (check `analysable` first). */
export function analysisSourceOf(song: SongDef): AnalysisSource {
  return {
    title: song.title,
    key: song.key,
    keyPlan: song.keyPlan ?? null,
    bars: song.answerKey.bars,
    chords: song.answerKey.chords ?? [],
    sections: (song.answerKey.sections ?? []).map((s) => ({ label: s.label, bars: s.bars })),
  };
}

/** Whether a song can be analysed: it has a chart and a form map. */
export const analysable = (song: SongDef): boolean =>
  (song.answerKey.chords?.length ?? 0) > 0 && (song.answerKey.sections?.length ?? 0) > 0;

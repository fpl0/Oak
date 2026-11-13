// The songs a transcribe capstone offers (X1: Aura Lee or Red River Valley, contracts §2.4, §2.8): Oak's own
// renditions with their answer keys (`content/repertoire/<slug>/song.ts`). Phrase checks are graded in the
// browser in capstone mode (wave4.md §5.1), so the answer key is loaded here, lazily, one chunk per song.
// Vite only (import.meta.glob).
import type { SongDef, SongId } from "@oak/content-kit";
import { queryOptions, useQuery } from "@tanstack/react-query";

const SONG_FILES = import.meta.glob<Record<string, unknown>>("../../../../content/repertoire/*/song.ts");

/** `song.aura-lee` → `aura-lee` (the folder). */
export const songSlug = (id: string): string => id.replace(/^song\./, "");

function fileOf(id: string): (() => Promise<Record<string, unknown>>) | null {
  const slug = songSlug(id);
  for (const [path, load] of Object.entries(SONG_FILES)) if (path.endsWith(`/${slug}/song.ts`)) return load;
  return null;
}

function isSong(x: unknown, id: string): x is SongDef {
  return typeof x === "object" && x !== null && (x as { id?: unknown }).id === id && "answerKey" in x;
}

/** The song's definition, or `null` when its answer key is not written yet. */
export async function loadSong(id: SongId): Promise<SongDef | null> {
  const load = fileOf(id);
  if (!load) return null;
  const mod = await load();
  const def = mod.default ?? Object.values(mod).find((v) => isSong(v, id));
  return isSong(def, id) ? def : null;
}

export const songQuery = (id: SongId | null) =>
  queryOptions({
    queryKey: ["capstone-song", id] as const,
    queryFn: () => (id ? loadSong(id) : Promise.resolve(null)),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

export function useSong(id: SongId | null) {
  return useQuery({ ...songQuery(id), enabled: id !== null });
}

/** The songs of a capstone whose answer keys exist, for the picker. */
export function useSongs(ids: readonly SongId[]) {
  return useQuery({
    queryKey: ["capstone-songs", ...ids] as const,
    queryFn: async () => {
      const out: SongDef[] = [];
      for (const id of ids) {
        const s = await loadSong(id);
        if (s) out.push(s);
      }
      return out;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The rhythm of phrase 1 a song's module gives the learner in X1.S1 (`export const phrase1Rhythm`: one hit per
 * note, no pitches). Per song, so it is read from the song, not from the capstone's checks.
 */
export async function loadPhrase1Rhythm(id: SongId): Promise<string | null> {
  const load = fileOf(id);
  if (!load) return null;
  const mod = await load();
  const r = mod.phrase1Rhythm;
  return typeof r === "string" && r.trim() ? r : null;
}

export function usePhrase1Rhythm(id: SongId | null) {
  return useQuery({
    queryKey: ["capstone-song-rhythm", id] as const,
    queryFn: () => (id ? loadPhrase1Rhythm(id) : Promise.resolve(null)),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

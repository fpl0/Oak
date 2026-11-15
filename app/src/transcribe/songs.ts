// One repertoire song's module, loaded on its own (Vite: one chunk per song), for the analysis page: the answer
// keys of the songs not chosen never reach the page (Wave 6 gate). Vite only (import.meta.glob).
import type { SongDef, SongId } from "@oak/content-kit";
import { useQuery } from "@tanstack/react-query";

const SONG_FILES = import.meta.glob<Record<string, unknown>>("../../../content/repertoire/*/song.ts");

const slugOf = (id: string): string => id.replace(/^song\./, "");

function isSong(x: unknown, id: string): x is SongDef {
  return typeof x === "object" && x !== null && (x as { id?: unknown }).id === id && "answerKey" in x;
}

/** The song's definition, or `null` when its answer key is not written yet. */
export async function loadRepertoireSong(id: SongId): Promise<SongDef | null> {
  const slug = slugOf(id);
  const load = Object.entries(SONG_FILES).find(([p]) => p.endsWith(`/${slug}/song.ts`))?.[1];
  if (!load) return null;
  const mod = await load();
  const def = mod.default ?? Object.values(mod).find((v) => isSong(v, id));
  return isSong(def, id) ? def : null;
}

export const songWrittenHere = (id: string): boolean =>
  Object.keys(SONG_FILES).some((p) => p.endsWith(`/${slugOf(id)}/song.ts`));

export function useRepertoireSong(id: SongId | null) {
  return useQuery({
    queryKey: ["transcribe-song", id] as const,
    queryFn: () => (id ? loadRepertoireSong(id) : Promise.resolve(null)),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

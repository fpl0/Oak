// The music behind a cover: a released version's code, analysed once in the browser grader host (capstone mode,
// the first pass of the piece) and cached for good (a version's code never changes). A version imported from a
// backup runs only after the strict lint passes (contracts §11.3); otherwise its cover grows from the seed alone.
import type { FlavourId, KeySpec, MeterId, SketchVersion } from "@oak/api";
import { keyEstimate, lintStrict, normalize } from "@oak/grader";
import { useQuery } from "@tanstack/react-query";
import { hasPitches, MAX_CAPSTONE_BARS, pieceAnalysis, pieceBars, truncate } from "../capstone/piece.ts";
import { graderHost } from "../lib/grader-client.ts";
import { apiQuery } from "../lib/queries.ts";
import type { CoverInput } from "./cover.ts";

export type CoverMusic = Omit<CoverInput, "title" | "seed" | "albumTitle">;

export async function musicOf(
  v: Pick<SketchVersion, "code" | "meter" | "key" | "flags">,
  flavour: FlavourId | null,
): Promise<CoverMusic | null> {
  if (v.flags.reviewBeforeRun && lintStrict(v.code).length > 0) return null;
  const meter: MeterId = v.meter ?? "4/4";
  const host = await graderHost();
  const ev = await host.analyze(v.code, { mode: "capstone", bars: MAX_CAPSTONE_BARS, lint: null, meter });
  if (!ev.ok) return null;
  const full = normalize(ev, { meter });
  const bars = pieceBars(v.code, full.all);
  const n = truncate(full, bars);
  const key: KeySpec | null = v.key ?? (hasPitches(n) ? (keyEstimate(n.all)[0]?.key ?? null) : null);
  const analysis = pieceAnalysis(n, { code: v.code, meter, key, bars });
  return { events: n.all, bars, key: hasPitches(n) ? key : null, bpm: n.bpm, flavour, slots: analysis.slots };
}

/** The cover music of one version of a sketch (`null` while loading or when the code does not evaluate). */
export function useCoverMusic(
  ref: { sketchId: string; sketchVersion: number } | null,
  flavour: FlavourId | null,
) {
  const sketch = useQuery({
    ...apiQuery("sketches.get", { params: { id: ref?.sketchId ?? "none" } }),
    enabled: ref !== null,
    staleTime: 60_000,
  });
  const version = ref ? sketch.data?.versions.find((x) => x.version === ref.sketchVersion) : undefined;
  const music = useQuery({
    queryKey: ["cover-music", ref?.sketchId ?? null, ref?.sketchVersion ?? null, flavour] as const,
    queryFn: () => musicOf(version as SketchVersion, flavour),
    enabled: version !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    retry: 0,
  });
  // Pending while the sketch or the analysis is on its way; a cover then shows its wood without rings.
  const pending =
    ref !== null && !sketch.isError && (sketch.isPending || (version !== undefined && music.isPending));
  return { music: music.data ?? null, pending, version: version ?? null, sketch };
}

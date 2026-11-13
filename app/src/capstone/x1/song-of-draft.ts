// Which song a transcribe capstone's draft is of (pure; tested in capstone/wave5.test.ts).
import type { CapstoneDef } from "@oak/content-kit";

/**
 * The song a transcribe capstone's draft is of: its `song.*` tag, else the first song the capstone offers whose
 * answer key is written (`written`, as the Start page picks it), else the first it offers.
 */
export function songOfDraft(
  def: Pick<CapstoneDef, "song">,
  tags: readonly string[],
  written: readonly string[] = [],
): string | null {
  return (
    tags.find((t) => t.startsWith("song.")) ??
    (def.song ?? []).find((id) => written.includes(id)) ??
    def.song?.[0] ??
    null
  );
}

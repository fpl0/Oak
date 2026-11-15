// Brief tests that read a song's answer key (wave7.md §3.2): kept out of content/capstones.ts, which the app loads,
// and joined to the brief here for content CI (`checkCapstone`, the corrections standard and the course tests).
import type { CapstoneDef, TestCase } from "@oak/content-kit";

const SONG_BRIEF_TESTS: Record<string, () => Promise<readonly TestCase[]>> = {
  JC4: async () => (await import("../advanced/capstones/JC4/brief-tests.ts")).JC4_BRIEF_TESTS,
};

/** The capstone with its song-reading brief tests appended (the same object when it has none). */
export async function withSongBriefTests(c: CapstoneDef): Promise<CapstoneDef> {
  const more = SONG_BRIEF_TESTS[c.id];
  if (!more || !c.brief) return c;
  return { ...c, brief: { ...c.brief, tests: [...c.brief.tests, ...(await more())] } };
}

/** Every capstone with its song-reading brief tests appended. */
export async function capstonesWithSongTests(list: readonly CapstoneDef[]): Promise<CapstoneDef[]> {
  return Promise.all(list.map(withSongBriefTests));
}

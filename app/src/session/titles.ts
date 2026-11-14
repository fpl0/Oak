// Titles of map items for the session surfaces. `titleOf` (lib/content-model.ts, frozen) reads a capstone session
// only when its capstone starts with "C" (`C2.S2`); X1, X2, JC1 and CF-T sessions fall back to their raw ID there.
// This reads every capstone session as its capstone ("X1 Folk Transcription · session 2") and defers to
// `titleOf` for everything else.
import { titleOf } from "../lib/content-model.ts";

/** The two parts of the core finale read by what they are ("Album Single"), never by their registry prefix. */
const finale = (title: string): string => /^CF-[AT] Core Finale: (.+)$/.exec(title)?.[1] ?? title;

export function itemTitle(id: string | null | undefined, titles: Map<string, string>): string {
  if (!id) return "";
  const own = titles.get(id);
  if (own) return finale(own);
  const m = /^(.+)\.S(\d+)$/.exec(id);
  const cap = m && !id.startsWith("GYM.") ? titles.get(m[1] as string) : undefined;
  if (m && cap) return m[2] === "1" ? finale(cap) : `${finale(cap)} · session ${m[2]}`;
  if (/^GYM\.\d+$/.test(id)) return `Transcription Gym · ${id}`;
  return titleOf(id, titles);
}

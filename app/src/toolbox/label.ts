// The label a learner sees for a tool on the Toolbox and Studio surfaces: `lib/tool-label.ts` `toolLabel`, without
// the catalog's internal "†" (contracts §3.2 rule 7: a row whose audibility the S3 harness still has to confirm).
// The mark is a note for authors, not for the learner: ".partials([…]) †" reads ".partials([…])".
import { type ToolLabel, toolLabel } from "../lib/tool-label.ts";

export function shownToolLabel(t: Parameters<typeof toolLabel>[0]): ToolLabel {
  const l = toolLabel(t);
  return { ...l, text: l.text.replace(/\s*†\s*$/u, "").replace(/\s+†\s+/gu, " ") };
}

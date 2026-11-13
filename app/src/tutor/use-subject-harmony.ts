// A surface that shows a Workbench keeps the tutor's chord map in step with what the Workbench analysed
// (`TutorSubject.harmony`, Wave 4): pass the returned callback as the Workbench's `onModel`, and the chord and
// numeral chips light the bars the chords really sound in, for any code (not only a `chord("…")` pattern).
import type { SubjectRef } from "@oak/api";
import { useCallback, useRef } from "react";
import { patchSubject } from "./context.ts";
import { type ChordAt, chordAtsOfView, type HarmonyViewLike } from "./harmony-chips.ts";

export function useSubjectHarmony(
  thread: SubjectRef | null,
): (model: { harmony: { view: HarmonyViewLike } | null }) => void {
  const last = useRef<string | null>(null);
  const kind = thread?.subjectKind ?? null;
  const id = thread?.subjectId ?? null;
  return useCallback(
    (model) => {
      if (!kind || !id) return;
      const harmony: ChordAt[] = chordAtsOfView(model.harmony?.view ?? null);
      const key = `${kind}:${id}:${JSON.stringify(harmony)}`;
      if (key === last.current) return;
      last.current = key;
      patchSubject({ subjectKind: kind, subjectId: id } as SubjectRef, { harmony });
    },
    [kind, id],
  );
}

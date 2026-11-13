// A surface that shows a Workbench keeps the tutor's chord map in step with what the Workbench analysed
// (`TutorSubject.harmony`, Wave 4): pass the returned callback as the Workbench's `onModel`, and the chord and
// numeral chips light the bars the chords really sound in, for any code (not only a `chord("…")` pattern).
// Wave 5: the same callback keeps the form view's sections (`model.lines.sections`) and the pickup, so section
// names in tutor text select the sections the ribbon draws.
import type { SubjectRef } from "@oak/api";
import { useCallback, useRef } from "react";
import type { FormViewSection } from "../lib/form-view.ts";
import { patchSubject } from "./context.ts";
import { type ChordAt, chordAtsOfView, type HarmonyViewLike } from "./harmony-chips.ts";

export function useSubjectHarmony(
  thread: SubjectRef | null,
): (model: {
  harmony: { view: HarmonyViewLike } | null;
  lines?: { sections: FormViewSection[] } | null;
  pickup?: unknown;
}) => void {
  const last = useRef<string | null>(null);
  const kind = thread?.subjectKind ?? null;
  const id = thread?.subjectId ?? null;
  return useCallback(
    (model) => {
      if (!kind || !id) return;
      const harmony: ChordAt[] = chordAtsOfView(model.harmony?.view ?? null);
      // A model built without the line views says nothing about sections: the code's arrange() is read instead.
      const sections = model.lines === undefined ? undefined : (model.lines?.sections ?? []);
      const pickup = model.pickup !== null && model.pickup !== undefined;
      const key = `${kind}:${id}:${JSON.stringify(harmony)}:${JSON.stringify(sections ?? null)}:${pickup}`;
      if (key === last.current) return;
      last.current = key;
      patchSubject({ subjectKind: kind, subjectId: id } as SubjectRef, {
        harmony,
        pickup,
        ...(sections === undefined ? {} : { sections }),
      });
    },
    [kind, id],
  );
}

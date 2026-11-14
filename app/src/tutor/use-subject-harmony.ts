// A surface that shows a Workbench keeps the tutor's chord map in step with what the Workbench analysed
// (`TutorSubject.harmony`, Wave 4): pass the returned callback as the Workbench's `onModel`, and the chord and
// numeral chips light the bars the chords really sound in, for any code (not only a `chord("…")` pattern).
// Wave 5: the same callback keeps the form view's sections (`model.lines.sections`) and the pickup, so section
// names in tutor text select the sections the ribbon draws. Wave 6: and the key plan (`model.colour.keyPlan`), so a
// key or mode chip lights the bars it is in force and a numeral is read in the key of its bar.
import type { SubjectRef } from "@oak/api";
import { useCallback, useRef } from "react";
import type { FormViewSection } from "../lib/form-view.ts";
import { patchSubject } from "./context.ts";
import { type ChordAt, chordAtsOfView, type HarmonyViewLike, type KeySpanAt } from "./harmony-chips.ts";

/** The part of the Workbench's `colour.keyPlan` (`keyPlanView`) a key plan is read from: 1-based display bars. */
export interface KeyPlanViewLike {
  spans: readonly { fromBar: number; toBar: number; key: KeySpanAt["key"] }[];
}

/** The key plan of a piece that changes key, in display bars; `[]` for a piece in one key. */
export function keySpansOfView(view: KeyPlanViewLike | null | undefined): KeySpanAt[] {
  const spans = view?.spans ?? [];
  return spans.length > 1 ? spans.map((sp) => ({ from: sp.fromBar, to: sp.toBar, key: sp.key })) : [];
}

export function useSubjectHarmony(
  thread: SubjectRef | null,
): (model: {
  harmony: { view: HarmonyViewLike } | null;
  lines?: { sections: FormViewSection[] } | null;
  pickup?: unknown;
  colour?: { keyPlan: KeyPlanViewLike } | null;
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
      // A model built without the colour views says nothing about the key plan: the code's `.scale()` is read.
      const keyPlan = model.colour === undefined ? undefined : keySpansOfView(model.colour?.keyPlan ?? null);
      const key = `${kind}:${id}:${JSON.stringify(harmony)}:${JSON.stringify(sections ?? null)}:${pickup}:${JSON.stringify(keyPlan ?? null)}`;
      if (key === last.current) return;
      last.current = key;
      patchSubject({ subjectKind: kind, subjectId: id } as SubjectRef, {
        harmony,
        pickup,
        ...(sections === undefined ? {} : { sections }),
        ...(keyPlan === undefined ? {} : { keyPlan }),
      });
    },
    [kind, id],
  );
}

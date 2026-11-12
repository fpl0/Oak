import { create } from "zustand";
import { useContent } from "../lib/content.ts";
import { useTermsIntroduced, useUnlocks } from "../lib/queries.ts";
import { GENERAL_SUBJECT, sameThread, subjectKey, type TutorSubject, useTutorContext } from "./context.ts";
import type { TokenContext } from "./music-tokens.ts";

const EMPTY: TokenContext = { terms: [], introduced: null, tools: [], unlocked: null };

/**
 * What the chips of tutor text need: the glossary and tools, what the learner has met, and — Wave 3 — the key of
 * the subject on screen (degrees and numerals sound in it) and the labels the learner sees (a lesson step's own,
 * else the lenses).
 */
export function useTokenContext(): TokenContext {
  const content = useContent();
  const terms = useTermsIntroduced();
  const unlocks = useUnlocks();
  const subject = useShownSubject();
  const lenses = useTutorContext((s) => s.lenses);
  if (!content.data) return EMPTY;
  const labels = subject.labels ?? lenses;
  return {
    terms: content.data.terms,
    tools: content.data.toolbox,
    introduced: terms.data ? new Set(terms.data.items.map((t) => t.termId as string)) : null,
    unlocked: unlocks.data ? new Set(unlocks.data.items.map((u) => u.itemId as string)) : null,
    key: subjectKey(subject),
    ...(labels ? { labels: { degrees: labels.degrees, solfege: labels.solfege } } : {}),
  };
}

export { useThemeName } from "../ui/theme/use-theme-name.ts";

/**
 * Which thread the panel shows: the current surface's subject, General (the learner pinned it), or the subject of
 * an ask that carries its own (a listening note asked from the Coda, a review). A new page's subject resets it.
 */
export interface PanelView {
  general: boolean;
  override: TutorSubject | null;
}
export const usePanelView = create<PanelView>(() => ({ general: false, override: null }));

useTutorContext.subscribe((s, prev) => {
  const a = s.subject?.thread;
  const b = prev.subject?.thread;
  if (a?.subjectKind === b?.subjectKind && a?.subjectId === b?.subjectId) return;
  if (a) usePanelView.setState({ general: false, override: null });
});

export function shownSubject(subject: TutorSubject | null, view: PanelView): TutorSubject {
  if (view.general) return GENERAL_SUBJECT;
  if (view.override && !(subject && sameThread(subject.thread, view.override.thread))) return view.override;
  return subject ?? GENERAL_SUBJECT;
}

export function useShownSubject(): TutorSubject {
  const subject = useTutorContext((s) => s.subject);
  const view = usePanelView();
  return shownSubject(subject, view);
}

import { create } from "zustand";
import { useContent } from "../lib/content.ts";
import { useTermsIntroduced, useUnlocks } from "../lib/queries.ts";
import { GENERAL_SUBJECT, sameThread, type TutorSubject, useTutorContext } from "./context.ts";
import type { TokenContext } from "./music-tokens.ts";

const EMPTY: TokenContext = { terms: [], introduced: null, tools: [], unlocked: null };

export function useTokenContext(): TokenContext {
  const content = useContent();
  const terms = useTermsIntroduced();
  const unlocks = useUnlocks();
  if (!content.data) return EMPTY;
  return {
    terms: content.data.terms,
    tools: content.data.toolbox,
    introduced: terms.data ? new Set(terms.data.items.map((t) => t.termId as string)) : null,
    unlocked: unlocks.data ? new Set(unlocks.data.items.map((u) => u.itemId as string)) : null,
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

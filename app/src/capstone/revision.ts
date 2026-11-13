// "Try the revision" (contracts §10.6–§10.7): a review's revision opens in a COPY of the released code — a new
// Studio sketch — never in the released version. The revision's code arrives as comments above the piece: the
// learner types what they keep, so the copy stays their own work (authorship, §10.7) and the album version, its
// recording and its review are untouched.
import { useNavigate } from "@tanstack/react-router";
import { currentSessionId } from "../session/store.ts";
import { toast } from "../ui/kit/Toast.tsx";
import { useCreateDraft } from "./queries.ts";
import { type Revision, revisionCopyCode, revisionCopyTitle } from "./revision-code.ts";

export type { Revision };

/** Opens the revision in a new sketch (a copy) and goes to it in the Studio. */
export function useTryRevision() {
  const create = useCreateDraft();
  const navigate = useNavigate();
  return {
    pending: create.isPending,
    async open(o: { trackTitle: string; code: string; meter: string | null; rev: Revision }) {
      try {
        const { sketch } = await create.mutateAsync({
          body: {
            title: revisionCopyTitle(o.trackTitle, o.rev),
            originKind: "free",
            originId: null,
            sessionId: currentSessionId(),
            code: revisionCopyCode(o.code, o.rev),
            bpm: null,
            meter: (o.meter as never) ?? null,
            key: null,
            analysis: null,
            note: `Trying a revision from Claude's review: ${o.rev.title}`,
            tutorAssisted: false,
            band: null,
            flags: { lockedTools: [], previewTools: [] },
            ranOk: false,
          },
        });
        toast.success("A copy is open in the Studio", "The released version stays as it is.");
        void navigate({ to: "/studio/$sketchId", params: { sketchId: sketch.id } });
      } catch (e) {
        toast.error("The copy wasn't made", e instanceof Error ? e.message : undefined);
      }
    },
  };
}

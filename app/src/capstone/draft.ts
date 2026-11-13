// The capstone draft, saved continuously (ux §2.3, wave4.md §5.1): every successful Run, every pause in typing and
// leaving the page save a version of the draft sketch; each saved version is bound to the capstone session it was
// written in (`capstones.saveDraft`, "the draft save is the Make", contracts §9.1). One save at a time; the same
// code is never saved twice. A server without the Wave 4 endpoint (a typed 501) keeps the Wave 3 behaviour: the
// sketch version alone.
import { OakApiError, type SketchVersionCreate } from "@oak/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { callApi } from "../lib/api.ts";
import { apiQuery } from "../lib/queries.ts";
import { toast } from "../ui/kit/Toast.tsx";
import { useAddDraftVersion, useCreateDraft, usePatchDraft, usePutDraft } from "./queries.ts";

export type DraftBody = Omit<SketchVersionCreate, "sessionId">;

export interface DraftSaverInput {
  capstoneId: string;
  title: string;
  initialSketch: string | null;
  latest: { version: number; code: string; createdAt: string } | null;
  /** The code the editor opened with (no save until it changes). */
  initialCode: string;
  /** The Oak session the work happens in (Today's runner), if any. */
  sessionId: string | null;
  /** The capstone session the next save belongs to (`C2.S2`). */
  capstoneSessionId: () => string | null;
  /** Tags a new draft sketch gets (the flavour, the song). */
  tags: () => string[];
  /** The version body for some code (analysis, key, band, flags). */
  body: (code: string, ranOk: boolean) => DraftBody;
}

export interface DraftSaver {
  /** Saves `code` unless it is already the latest version; resolves with where it went. */
  save(code: string, ranOk: boolean): Promise<{ sketchId: string; version: number }>;
  saveQuietly(code: string, ranOk: boolean): void;
  /** The editor's code changed (autosave after a pause). */
  changed(code: string): void;
  readonly sketchId: string | null;
  readonly savedCode: string | null;
  saved: { version: number; at: number } | null;
}

const notBuilt = (e: unknown) => e instanceof OakApiError && e.code === "not_implemented";

/**
 * Another tab (or window) saved this draft since this tab last did: the server numbered this save past the one
 * this tab expected. Every version is kept, so nothing is lost, but the learner is told (Wave 4 gate: two tabs
 * editing one capstone used to overwrite each other silently).
 */
export function savedElsewhere(prev: number | null, now: number): boolean {
  return prev !== null && now > prev + 1;
}
export const SAVED_ELSEWHERE = (version: number) =>
  [
    "This draft was also saved in another tab",
    `Both are kept in the version history; this tab's code is version ${version}. Work in one tab to keep one line of versions.`,
  ] as const;

export function useDraftSaver(i: DraftSaverInput): DraftSaver {
  const create = useCreateDraft();
  const addVersion = useAddDraftVersion();
  const patch = usePatchDraft();
  const putDraft = usePutDraft();
  const qc = useQueryClient();
  const ref = useRef({
    sketchId: i.initialSketch,
    version: i.latest?.version ?? null,
    code: i.latest?.code ?? null,
  });
  const inputRef = useRef(i);
  inputRef.current = i;
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const bindOff = useRef(false);
  const [saved, setSaved] = useState<{ version: number; at: number } | null>(
    i.latest ? { version: i.latest.version, at: Date.parse(i.latest.createdAt) } : null,
  );
  const [pending, setPending] = useState<string | null>(null);

  const save = (src: string, ranOk: boolean): Promise<{ sketchId: string; version: number }> => {
    const run = async () => {
      const s = ref.current;
      const inp = inputRef.current;
      if (s.sketchId && s.version !== null && s.code === src)
        return { sketchId: s.sketchId, version: s.version };
      const body = inp.body(src, ranOk);
      const out = s.sketchId
        ? await addVersion.mutateAsync({
            params: { id: s.sketchId },
            body: { sessionId: inp.sessionId, ...body },
          })
        : await create.mutateAsync({
            body: {
              title: inp.title,
              originKind: "capstone",
              originId: inp.capstoneId,
              sessionId: inp.sessionId,
              ...body,
            },
          });
      if (!s.sketchId) await patch.mutateAsync({ params: { id: out.sketch.id }, body: { tags: inp.tags() } });
      putDraft(out.sketch);
      if (s.sketchId && savedElsewhere(s.version, out.sketch.currentVersion))
        toast.info(...SAVED_ELSEWHERE(out.sketch.currentVersion));
      ref.current = { sketchId: out.sketch.id, version: out.sketch.currentVersion, code: src };
      setSaved({ version: out.sketch.currentVersion, at: Date.now() });
      const cs = inp.capstoneSessionId();
      if (cs && !bindOff.current)
        await callApi("capstones.saveDraft", {
          params: { id: inp.capstoneId },
          body: {
            capstoneSessionId: cs as never,
            sessionId: inp.sessionId,
            sketchId: out.sketch.id,
            sketchVersion: out.sketch.currentVersion,
          },
        })
          .then((sessions) => {
            // Inside Today's runner the session's state is left alone until the block ends: the runner reads it
            // when it decides whether the block opens "from the top".
            if (inp.sessionId !== null) return;
            qc.setQueryData(
              apiQuery("capstones.sessions", { params: { id: inp.capstoneId } }).queryKey,
              sessions,
            );
            void qc.invalidateQueries({ queryKey: ["api", "capstones.get"] });
          })
          .catch((e: unknown) => {
            // Wave 3 server: no session binding yet; the sketch version is the draft.
            if (notBuilt(e)) bindOff.current = true;
            else throw e;
          });
      return { sketchId: out.sketch.id, version: out.sketch.currentVersion };
    };
    const next = chain.current.then(run, run);
    chain.current = next.catch(() => {});
    return next;
  };
  const saveQuietly = (src: string, ranOk: boolean) => {
    save(src, ranOk).catch((e: unknown) =>
      toast.error("Couldn't save the draft", e instanceof Error ? e.message : undefined),
    );
  };

  // A pause in typing saves.
  useEffect(() => {
    if (pending === null) return;
    if (
      pending === ref.current.code ||
      (ref.current.code === null && pending === inputRef.current.initialCode)
    )
      return;
    const t = setTimeout(() => saveQuietly(pending, false), 4000);
    return () => clearTimeout(t);
  });
  // Leaving the page (or hiding it) saves what is there.
  const latestCode = useRef<string | null>(null);
  useEffect(() => {
    const flush = () => {
      const c = latestCode.current;
      if (c !== null && c !== ref.current.code && c !== inputRef.current.initialCode) saveQuietly(c, false);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
    // Mount/unmount only: the refs carry the latest code.
  }, []);

  return {
    save,
    saveQuietly,
    changed(code) {
      latestCode.current = code;
      setPending(code);
    },
    get sketchId() {
      return ref.current.sketchId;
    },
    get savedCode() {
      return ref.current.code;
    },
    saved,
  };
}

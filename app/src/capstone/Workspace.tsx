// The capstone workspace (ux §2.3): the Brief panel (300 px) beside the full Workbench. The checklist is live: the
// rubric runs in capstone mode on every edit; "Check my track" records the check on the server (evidence and the
// tutor's review source); every successful Run and every pause in typing saves a version of the draft. Release
// names the track, records the performance and puts it on the album; a released capstone stays open for revision.
import {
  type CapstoneDef,
  type CapstoneState,
  type FlavourId,
  type SketchVersion,
  stripMarkers,
  type UnlockableId,
} from "@oak/api";
import { editorId } from "@oak/strudel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Check, CheckCheck, CircleDot, Disc3, Music4, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  apiQuery,
  useApiMutation,
  useBootstrap,
  useCapstoneCheck,
  useCapstoneSessionComplete,
  useCourseProgress,
  useUnlocks,
} from "../lib/queries.ts";
import { currentSessionId, reportBlockDone } from "../session/store.ts";
import {
  askReview,
  clearSubject,
  openTutor,
  patchSubject,
  registerTutorHost,
  setSubject,
} from "../tutor/context.ts";
import { useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import { Button } from "../ui/kit/Button.tsx";
import { Chip, Kbd } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { useWorkbenchServices } from "../workbench/services.tsx";
import { Workbench } from "../workbench/Workbench.tsx";
import "../workbench/index.ts";
import { bandReached } from "../studio/model.ts";
import { BriefPanel } from "./BriefPanel.tsx";
import { trackTitleOf } from "./CapstoneScreen.tsx";
import { Ceremony, type CeremonyData } from "./Ceremony.tsx";
import { beyondBrief, checklistOf, readiness } from "./checklist.ts";
import { bandSetupFor, type CapstoneContent } from "./content.ts";
import { type CheckOutcome, checkPiece, lintFor } from "./engine.ts";
import {
  latestVersion,
  useAddDraftVersion,
  useCapstoneReview,
  useCreateDraft,
  useDraft,
  useDraftSketchId,
  usePatchDraft,
  usePutDraft,
} from "./queries.ts";
import { ReleaseDialog } from "./ReleaseDialog.tsx";
import { WorkbenchServicesLoader } from "./WorkbenchServicesLoader.tsx";

export function starterOf(def: CapstoneDef): string {
  return stripMarkers(def.brief?.code.starter ?? "").code;
}

/** The workbench slug of a capstone's editor (`oak_capstone-C0_0_`). */
export const wbSlug = (id: string) => `capstone-${id}`;

export function Workspace({
  def,
  state,
  content,
}: {
  def: CapstoneDef;
  state: CapstoneState;
  content: CapstoneContent;
}) {
  const draftRef = useDraftSketchId(def.id, state.sketchId);
  const draft = useDraft(draftRef.id);
  const ready = !draftRef.pending && (draftRef.id === null || draft.data !== undefined);
  // Once open, the workspace stays mounted. Inside a session there is no draft until the first save creates one;
  // the server then links it (`capstones.get` refetches after a check) while its `sketches.get` is still on the
  // way, which made `ready` false for a moment and remounted the editor — losing the "Checked version N" notice
  // and the live state with it. The draft only seeds the first render, so nothing is lost by staying.
  const [opened, setOpened] = useState(false);
  if (ready && !opened) setOpened(true);
  return (
    <div className="flex h-full min-h-0" data-testid="capstone-workspace">
      {ready || opened ? (
        <WorkbenchServicesLoader label="Loading the workbench">
          <Loaded
            def={def}
            state={state}
            content={content}
            sketchId={draftRef.id}
            latest={latestVersion(draft.data)}
            tags={draft.data?.tags ?? []}
          />
        </WorkbenchServicesLoader>
      ) : (
        <div className="flex-1 p-4 text-sm text-text-3">Opening your draft…</div>
      )}
    </div>
  );
}

interface Official {
  code: string;
  version: number;
  outcome: CheckOutcome;
}

function Loaded({
  def,
  state,
  content,
  sketchId: initialSketch,
  latest,
  tags,
}: {
  def: CapstoneDef;
  state: CapstoneState;
  content: CapstoneContent;
  sketchId: string | null;
  latest: SketchVersion | null;
  tags: readonly string[];
}) {
  const { oak } = useWorkbenchServices();
  const qc = useQueryClient();
  const boot = useBootstrap();
  const unlocksQ = useUnlocks();
  const progress = useCourseProgress();
  const brief = def.brief as NonNullable<CapstoneDef["brief"]>;
  const released = state.status === "released" && state.trackId !== null;
  const total = def.sessionDefs.length;
  const nextIndex = Math.min(state.sessionsDone, total - 1);
  const nextSession = def.sessionDefs[nextIndex];
  const allDone = state.sessionsDone >= total;
  const sessionId =
    currentSessionId() ??
    (boot.data?.openSession?.mapItemId?.startsWith(`${def.id}.`) ? boot.data.openSession.id : null);

  // --- unlocked set and flavour ------------------------------------------------------------------
  const unlockIds = (unlocksQ.data?.items ?? []).map((u) => u.itemId as UnlockableId);
  const unlockKey = unlockIds.slice().sort().join(",");
  // One Set per distinct unlock list, so a refetch with the same unlocks does not re-run the live check.
  const [unlockedState, setUnlocked] = useState<{ key: string; set: ReadonlySet<UnlockableId> }>(() => ({
    key: unlockKey,
    set: new Set(unlockIds),
  }));
  useEffect(() => {
    if (unlockedState.key !== unlockKey)
      setUnlocked({
        key: unlockKey,
        set: new Set(unlockKey ? (unlockKey.split(",") as UnlockableId[]) : []),
      });
  }, [unlockKey, unlockedState.key]);
  const unlocked = unlockedState.set;
  const tagFlavour = tags.find((t): t is FlavourId => t.startsWith("flavour.")) ?? null;
  const [flavour, setFlavour] = useState<FlavourId>(
    state.flavour ?? tagFlavour ?? boot.data?.profile.flavour ?? content.shipping[0] ?? "flavour.pop",
  );

  // --- code, saving -------------------------------------------------------------------------------
  const initialCode = latest?.code ?? starterOf(def);
  const [code, setCode] = useState(initialCode);
  const codeRef = useRef(code);
  codeRef.current = code;
  const saved = useRef<{ sketchId: string | null; version: number | null; code: string | null }>({
    sketchId: initialSketch,
    version: latest?.version ?? null,
    code: latest?.code ?? null,
  });
  const [savedInfo, setSavedInfo] = useState<{ version: number; at: number } | null>(
    latest ? { version: latest.version, at: Date.parse(latest.createdAt) } : null,
  );
  const [bandOn, setBandOn] = useState(latest?.band != null);
  const assisted = useRef<string | null>(null);
  const create = useCreateDraft();
  const addVersion = useAddDraftVersion();
  const patch = usePatchDraft();
  const putDraft = usePutDraft();
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  // --- live rubric ---------------------------------------------------------------------------------
  const [live, setLive] = useState<{ outcome: CheckOutcome | null; checking: boolean; error: string | null }>(
    {
      outcome: null,
      checking: true,
      error: null,
    },
  );
  const liveRef = useRef(live);
  liveRef.current = live;
  // A superseded check is left to finish and ignored: aborting it would restart the shared grader worker under
  // the Workbench's own analysis.
  const seq = useRef(0);
  useEffect(() => {
    if (unlocksQ.isPending) return;
    const my = ++seq.current;
    setLive((s) => ({ ...s, checking: true }));
    const t = setTimeout(() => {
      checkPiece(def, code, unlocked).then(
        (outcome) => {
          if (my === seq.current) setLive({ outcome, checking: false, error: null });
        },
        (e: unknown) => {
          if (my === seq.current)
            setLive((s) => ({ ...s, checking: false, error: e instanceof Error ? e.message : String(e) }));
        },
      );
    }, 650);
    return () => clearTimeout(t);
  }, [def, code, unlocked, unlocksQ.isPending]);

  const band = bandOn
    ? bandSetupFor(
        def,
        flavour,
        content.bands,
        def.key ?? live.outcome?.key ?? { tonic: "C", mode: "major" },
        bandReached(progress.data),
      )
    : null;

  const versionBody = (src: string, ranOk: boolean) => {
    const o = liveRef.current.outcome;
    const fresh = o && o.code === src ? o : null;
    const note = assisted.current;
    return {
      code: src,
      bpm: fresh?.analysis?.bpm ?? null,
      meter: def.meter,
      key: fresh?.key ?? def.key ?? null,
      analysis: fresh?.analysis ?? null,
      note,
      tutorAssisted: note !== null,
      band: band ? { bandId: band.band, flavour, mutes: [] as ("drums" | "bass" | "chords")[] } : null,
      flags: { lockedTools: [] as string[], previewTools: [] as string[] },
      ranOk,
    };
  };

  /** Saves the code as a new version unless it is already the latest. Serialized: one save at a time. */
  const save = (src: string, ranOk: boolean): Promise<{ sketchId: string; version: number }> => {
    const run = async () => {
      const s = saved.current;
      if (s.sketchId && s.version !== null && s.code === src)
        return { sketchId: s.sketchId, version: s.version };
      const body = versionBody(src, ranOk);
      const out = s.sketchId
        ? await addVersion.mutateAsync({ params: { id: s.sketchId }, body: { sessionId, ...body } })
        : await create.mutateAsync({
            body: { title: def.title, originKind: "capstone", originId: def.id, sessionId, ...body },
          });
      if (!s.sketchId) await patch.mutateAsync({ params: { id: out.sketch.id }, body: { tags: [flavour] } });
      putDraft(out.sketch);
      saved.current = { sketchId: out.sketch.id, version: out.sketch.currentVersion, code: src };
      assisted.current = null;
      setSavedInfo({ version: out.sketch.currentVersion, at: Date.now() });
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

  // A pause in typing saves; leaving the page saves what is there.
  useEffect(() => {
    if (code === saved.current.code || (saved.current.code === null && code === initialCode)) return;
    const t = setTimeout(() => saveQuietly(code, false), 4000);
    return () => clearTimeout(t);
  });
  useEffect(() => {
    const flush = () => {
      if (codeRef.current !== saved.current.code && codeRef.current !== initialCode)
        saveQuietly(codeRef.current, false);
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

  // --- official check, sessions, release -------------------------------------------------------------
  const check = useCapstoneCheck();
  const complete = useCapstoneSessionComplete();
  const qa = useApiMutation("qa.report");
  const [official, setOfficial] = useState<Official | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "attention" | "info";
    title: string;
    body?: string | undefined;
  } | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [ceremony, setCeremony] = useState<CeremonyData | null>(null);
  const review = useCapstoneReview(def.id, state.reviewRequested);
  const track = useQuery({
    ...apiQuery("album.track", { params: { id: state.trackId ?? "none" } }),
    enabled: state.trackId !== null,
  });

  const outcomeFor = async (src: string): Promise<CheckOutcome> => {
    const o = liveRef.current.outcome;
    return o && o.code === src ? o : checkPiece(def, src, unlocked);
  };

  const checkMyTrack = async (): Promise<Official | null> => {
    if (checkingNow) return null;
    setCheckingNow(true);
    try {
      const src = codeRef.current;
      const { sketchId, version } = await save(src, liveRef.current.outcome?.result.status !== "error");
      const outcome = await outcomeFor(src);
      await check.mutateAsync({
        params: { id: def.id },
        body: { sessionId, sketchId, sketchVersion: version, result: outcome.result },
      });
      const rec = { code: src, version, outcome };
      setOfficial(rec);
      const rows = checklistOf(brief.rubric, outcome.result);
      const r = readiness(rows);
      setNotice(
        outcome.result.status === "error"
          ? {
              tone: "attention",
              title: "The piece doesn't run yet",
              body: outcome.result.messages[0]?.text ?? "Fix the error the editor shows, then check again.",
            }
          : r.ready
            ? {
                tone: "success",
                title: `Checked version ${version}: every requirement is met.`,
                body: released || !lastSession ? undefined : "It's ready to release when you are.",
              }
            : {
                tone: "info",
                title: `Checked version ${version}: ${r.met} of ${r.required} requirements met.`,
                body: "The open ones are marked in the brief, with the bars to look at.",
              },
      );
      return rec;
    } catch (e) {
      toast.error("The check didn't go through", e instanceof Error ? e.message : undefined);
      return null;
    } finally {
      setCheckingNow(false);
    }
  };

  const lastSession = state.sessionsDone >= total - 1;
  const finishSession = async () => {
    if (!nextSession) return;
    try {
      const { sketchId } = await save(codeRef.current, true);
      await complete.mutateAsync({
        params: { id: def.id },
        body: { sessionId, capstoneSessionId: nextSession.id, sketchId, flavour },
      });
      setNotice({
        tone: "success",
        title: `Session ${nextIndex + 1} of ${total} done.`,
        body: def.sessionDefs[nextIndex + 1]
          ? `Next time: ${def.sessionDefs[nextIndex + 1]?.title}. Your draft waits here.`
          : undefined,
      });
      reportBlockDone({ block: "new", source: "capstone", itemId: nextSession.id, completed: true });
    } catch (e) {
      toast.error("Couldn't finish the session", e instanceof Error ? e.message : undefined);
    }
  };

  const openRelease = async () => {
    const src = codeRef.current;
    const rec = official && official.code === src ? official : await checkMyTrack();
    if (!rec) return;
    if (!readiness(checklistOf(brief.rubric, rec.outcome.result)).ready) return;
    setReleaseOpen(true);
  };

  // --- tutor ---------------------------------------------------------------------------------------
  const thread = { subjectKind: "capstone" as const, subjectId: def.id };
  useEffect(() => {
    setSubject({
      thread,
      title: def.title,
      tutorOpen: true,
      capstoneId: def.id,
      code: codeRef.current,
      released,
      ...(def.key ? { key: def.key } : {}),
      ...(saved.current.sketchId ? { sketchId: saved.current.sketchId } : {}),
    });
    return () => clearSubject(thread);
    // The thread is fixed for this workspace.
  }, [def.id]);
  const lastResult = live.outcome?.result ?? state.lastResult ?? null;
  // The brief's key, else the piece's own (its `.scale()`, read by the subject) — the tutor's Key chip.
  useEffect(() => {
    patchSubject({ subjectKind: "capstone", subjectId: def.id }, { code, lastResult, released });
  }, [def.id, code, lastResult, released]);
  // Cards stay Preview-only until the first release (contracts §10.7); afterwards Apply lands in this editor.
  useEffect(
    () =>
      registerTutorHost({
        thread,
        sketchId: saved.current.sketchId,
        ...(released
          ? {
              applyCode: (next: string, card: { cardId: string; title: string }) => {
                const h = oak.editors.get(editorId(wbSlug(def.id)));
                if (!h || h.disposed) return;
                assisted.current = `Revision suggested by Claude (${card.title})`;
                h.setCode(next, { undoable: true });
                setCode(next);
              },
            }
          : {}),
      }),
    [released, def.id, oak],
  );

  // --- keys ------------------------------------------------------------------------------------------
  useHotkeys([
    {
      id: "capstone-check",
      keys: "Mod+Shift+Enter",
      scope: "global",
      group: "Capstone",
      description: "Check my track",
      allowInInput: true,
      run: () => void checkMyTrack(),
    },
    {
      id: "capstone-save",
      keys: "Mod+S",
      scope: "global",
      group: "Capstone",
      description: "Save a version",
      allowInInput: true,
      run: () => {
        save(codeRef.current, false).then(
          ({ version }) => toast.success(`Saved version ${version}`),
          (e: unknown) => toast.error("Couldn't save the draft", e instanceof Error ? e.message : undefined),
        );
      },
    },
  ]);

  // --- derived ---------------------------------------------------------------------------------------
  const outcome = live.outcome;
  const stale = outcome !== null && outcome.code !== code;
  const rows = checklistOf(
    brief.rubric,
    outcome?.result ?? null,
    outcome?.anchors ?? {},
    nextSession?.focusRules ?? [],
  );
  const ready = readiness(rows);
  const beyond =
    outcome && !stale
      ? beyondBrief(brief.rubric, outcome.result, {
          bars: outcome.bars,
          tracks: Object.values(outcome.n?.byTrack ?? {}).filter((e) => e.length > 0).length,
          bpm: outcome.analysis?.bpm ?? null,
        })
      : [];
  const evalError =
    outcome && !stale && outcome.result.status === "error"
      ? (outcome.result.messages[0]?.text ?? "The piece doesn't run.")
      : null;
  const canRelease = (lastSession || allDone) && ready.ready && !stale && !live.checking;

  return (
    <>
      <BriefPanel
        def={def}
        state={state}
        rows={rows}
        ready={ready}
        checking={live.checking || checkingNow}
        stale={stale}
        beyond={beyond}
        flavour={flavour}
        shipping={content.shipping}
        onFlavour={(f) => {
          setFlavour(f);
          if (saved.current.sketchId)
            patch.mutate({ params: { id: saved.current.sketchId }, body: { tags: [f] } });
        }}
        flavourLocked={state.sessionsDone > 0 || released}
        review={review.review}
        reviewRequested={state.reviewRequested}
        canRequestReview={state.sketchId !== null || official !== null}
        onRequestReview={() => {
          const r = askReviewFor(def, codeRef.current);
          if (r.ok) {
            setNotice({
              tone: "info",
              title: "Review requested",
              body: "Claude's comments appear in the tutor panel. They never affect pass or fail.",
            });
            void qc.invalidateQueries({ queryKey: ["api", "capstones.get"] });
          }
        }}
        onReport={async (note) => {
          const o = liveRef.current.outcome;
          await qa.mutateAsync({
            body: {
              kind: "capstone-rubric",
              lessonId: null,
              stepId: def.sessionDefs[nextIndex]?.id ?? null,
              exerciseId: `${def.id}/${brief.id}`,
              exerciseVersion: brief.version,
              familyId: null,
              trialSeed: null,
              params: null,
              response: { code: codeRef.current },
              gradeResult: o?.result ?? null,
              hintRung: 0,
              note,
              attemptId: null,
            },
          });
          toast.success("Reported. Thank you: it goes to the grading queue on this machine.");
        }}
      />
      <section aria-label="Workbench" className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
          <StatusChip state={state} released={released} total={total} nextIndex={nextIndex} />
          <span className="text-sm text-text-3" aria-live="polite" data-testid="saved-state">
            {savedInfo ? (
              <>
                <Save aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
                Version {savedInfo.version} saved
              </>
            ) : (
              "Not saved yet"
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {content.bands.length > 0 &&
              bandSetupFor(def, flavour, content.bands, def.key ?? { tonic: "C", mode: "major" }) && (
                <Button
                  size="md"
                  variant="ghost"
                  aria-pressed={bandOn}
                  icon={<Music4 aria-hidden className="size-4" />}
                  onClick={() => setBandOn((b) => !b)}
                  className={clsx(bandOn && "bg-surface-2 text-text")}
                >
                  Band {bandOn ? "on" : "off"}
                </Button>
              )}
            <Button
              variant="secondary"
              loading={checkingNow}
              icon={<CheckCheck aria-hidden className="size-4" />}
              onClick={() => void checkMyTrack()}
              data-testid="check-track"
            >
              Check my track{" "}
              <span className="hidden xl:inline">
                <Kbd>⌘⇧↵</Kbd>
              </span>
            </Button>
            {!lastSession && !allDone && nextSession && (
              <Button variant="primary" loading={complete.isPending} onClick={() => void finishSession()}>
                Finish session {nextIndex + 1} of {total}
              </Button>
            )}
            {(lastSession || allDone) && (
              <Button
                variant={canRelease ? "primary" : "secondary"}
                icon={<Disc3 aria-hidden className="size-4" />}
                disabled={!canRelease}
                title={canRelease ? undefined : "Every requirement in the brief is met first"}
                onClick={() => void openRelease()}
                data-testid="release"
              >
                {released ? "Release a new version" : "Release to album"}
              </Button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            {released && (
              <Callout
                tone="success"
                title="On the album"
                actions={
                  <Link
                    to="/album/$trackId"
                    params={{ trackId: state.trackId as string }}
                    className="text-sm text-link underline"
                  >
                    Open the track
                  </Link>
                }
              >
                You are revising it. When you release again, this becomes its next version.
              </Callout>
            )}
            {notice && (
              <Callout tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
                {notice.body}
              </Callout>
            )}
            {evalError && (
              <Callout tone="attention" title="The piece doesn't run yet">
                {evalError}
              </Callout>
            )}
            {live.error && !evalError && (
              <Callout tone="attention" title="The live check stopped">
                {live.error} The next edit tries again.
              </Callout>
            )}
            <Workbench
              tutorBars
              id={wbSlug(def.id)}
              code={initialCode}
              lessonCtx={{
                key: def.key ?? outcome?.key ?? null,
                meter: def.meter,
                defaultBpm: def.bpm ? Math.round((def.bpm[0] + def.bpm[1]) / 2) : 100,
                loopBars: Math.max(1, Math.min(64, outcome?.bars ?? 4)),
              }}
              lint={lintFor(def, unlocked)}
              views={["roll", "staff"]}
              band={band}
              staff={{ kind: def.id === "C0" ? "percussion" : "auto" }}
              onChange={setCode}
              onEvaluated={(o) => {
                if (o.ok) saveQuietly(o.code, true);
              }}
            />
          </div>
        </div>
      </section>
      {releaseOpen && official && (
        <ReleaseDialog
          def={def}
          state={state}
          official={official}
          flavour={flavour}
          sessionId={sessionId}
          sketchId={saved.current.sketchId as string}
          review={review.review}
          includeReviewDefault={boot.data?.settings.linerNotesInAlbum ?? true}
          canDos={def.canDo
            .map((c) => content.candos.find((x) => x.id === c)?.statement)
            .filter((x): x is string => !!x)}
          skillName={(id) => content.skillNames.get(id) ?? null}
          band={band ? `${content.bands.find((b) => b.id === band.band)?.title ?? "the Band"}` : null}
          defaultTitle={track.data?.title ?? trackTitleOf(def)}
          editor={() => oak.editors.get(editorId(wbSlug(def.id))) ?? null}
          onClose={() => setReleaseOpen(false)}
          onReleased={(data) => {
            setReleaseOpen(false);
            setCeremony(data);
            void qc.invalidateQueries({ queryKey: ["api"] });
          }}
        />
      )}
      {ceremony && (
        <Ceremony
          data={ceremony}
          inSession={currentSessionId() !== null}
          onContinue={() => {
            const last = def.sessionDefs.at(-1)?.id;
            setCeremony(null);
            if (last) reportBlockDone({ block: "new", source: "capstone", itemId: last, completed: true });
          }}
          onClose={() => setCeremony(null)}
        />
      )}
    </>
  );
}

function askReviewFor(def: CapstoneDef, code: string) {
  const r = askReview({ capstoneId: def.id, title: def.title, code });
  if (!r.ok) openTutor();
  return r;
}

function StatusChip({
  state,
  released,
  total,
  nextIndex,
}: {
  state: CapstoneState;
  released: boolean;
  total: number;
  nextIndex: number;
}) {
  if (released)
    return (
      <Chip tone="accent">
        <Check aria-hidden className="size-3.5" /> Released · revising
      </Chip>
    );
  if (state.sessionsDone >= total)
    return (
      <Chip tone="amber">
        <CircleDot aria-hidden className="size-3.5" /> Sessions done · ready to release
      </Chip>
    );
  return (
    <Chip tone="amber">
      <CircleDot aria-hidden className="size-3.5" /> Session {nextIndex + 1} of {total}
    </Chip>
  );
}

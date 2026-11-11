// `/capstone/$id` (ux §2.3, contracts §2.4): the capstone workspace. Locked → why and what opens it; open → the
// start of its first session (flavour choice, what unlocks now); in progress or released → the workspace.
import { type CapstoneDef, type CapstoneState, type FlavourId, isCapstoneId, type ToolEntry } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { tidyReason } from "../album/model.ts";
import { useContent } from "../lib/content.ts";
import { usePageTitle } from "../lib/nav.ts";
import { useBootstrap, useCapstone } from "../lib/queries.ts";
import { currentSessionId } from "../session/store.ts";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, Skeleton } from "../ui/kit/basics.tsx";
import { SegmentedControl } from "../ui/kit/Controls.tsx";
import { ErrorState } from "../ui/kit/QueryState.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { FLAVOUR_TITLE, useCapstoneContent } from "./content.ts";
import { useCreateDraft, usePatchDraft, useStartCapstoneSession } from "./queries.ts";
import { starterOf, Workspace } from "./Workspace.tsx";

/** "C0 Intro" → "Intro": the track's default title. */
export function trackTitleOf(def: Pick<CapstoneDef, "id" | "title">): string {
  return def.title.startsWith(`${def.id} `) ? def.title.slice(def.id.length + 1) : def.title;
}

export function CapstoneScreen({ id }: { id: string }) {
  const content = useCapstoneContent();
  const state = useCapstone(id);
  const def = content.data?.capstones.find((c) => c.id === id);
  usePageTitle(def?.title ?? id);

  if (!isCapstoneId(id))
    return (
      <Page>
        <EmptyState title="No such capstone">
          “{id}” is not a capstone.{" "}
          <Link to="/oak" search={{ view: "course" }} className="text-link underline">
            The course map
          </Link>{" "}
          lists them all.
        </EmptyState>
      </Page>
    );
  if (content.isError || state.isError)
    return (
      <Page>
        <ErrorState
          error={content.error ?? state.error}
          onRetry={() => {
            void content.refetch();
            void state.refetch();
          }}
        />
      </Page>
    );
  if (!content.data || !state.data) return <WorkspaceSkeleton />;
  if (!def)
    return (
      <Page>
        <EmptyState title="This capstone is not in the course yet">
          Its brief has not been written.
        </EmptyState>
      </Page>
    );
  const s = state.data;
  if (s.status === "locked") return <Locked def={def} state={s} />;
  if (def.kind === "transcribe" || !def.brief) return <TranscribeElsewhere def={def} />;
  if (s.status === "open") return <Start def={def} state={s} />;
  return <Workspace key={def.id} def={def} state={s} content={content.data} />;
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-full min-h-0" role="status" aria-busy="true" aria-label="Loading the capstone">
      <div className="w-[300px] shrink-0 border-r border-border bg-surface p-4">
        <Skeleton className="mb-3 h-5 w-16" />
        <Skeleton className="mb-6 h-7 w-44" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-5/6" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
      <div className="flex-1 p-4">
        <Skeleton className="mb-3 h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

function SessionPlan({ def, state }: { def: CapstoneDef; state: Pick<CapstoneState, "sessions"> }) {
  const total = def.sessionDefs.length;
  return (
    <ol className="flex flex-col gap-2">
      {def.sessionDefs.map((sd, i) => (
        <li key={sd.id} className="flex gap-3">
          <span className="w-8 shrink-0 font-mono text-sm text-text-3 tabular-nums">
            {i + 1}/{total}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{sd.title}</span>
            <span className="block text-sm text-text-2">{sd.goal}</span>
            {state.sessions.includes(sd.id) && <span className="sr-only">done</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Locked({ def, state }: { def: CapstoneDef; state: CapstoneState }) {
  return (
    <Page width="narrow">
      <p className="font-mono text-sm text-text-3">{def.id}</p>
      <h1 className="text-h1">{def.title}</h1>
      <p className="mt-2 text-text-2">{def.objective}</p>
      <Card className="mt-6 flex items-start gap-3 p-5">
        <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-text-3" />
        <div>
          <p className="font-medium">Not open yet</p>
          <p className="mt-1 text-text-2">
            {tidyReason(state.lockedReason) ?? "It opens when the checkpoint before it is passed."} A capstone
            never holds back a lesson; it waits here until you are ready.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/oak" search={{ view: "course" }} className={buttonClass("secondary", "sm")}>
              See the course map
            </Link>
            <Link to="/album" className={buttonClass("ghost", "sm")}>
              The album
            </Link>
          </div>
        </div>
      </Card>
      <h2 className="mt-8 mb-3 text-h3">Sessions</h2>
      <SessionPlan def={def} state={state} />
    </Page>
  );
}

function TranscribeElsewhere({ def }: { def: CapstoneDef }) {
  return (
    <Page width="narrow">
      <p className="font-mono text-sm text-text-3">{def.id}</p>
      <h1 className="text-h1">{def.title}</h1>
      <p className="mt-2 text-text-2">{def.objective}</p>
      <Card className="mt-6 p-5">
        <p className="font-medium">This capstone is a transcription</p>
        <p className="mt-1 text-text-2">
          It is worked phrase by phrase in Transcribe, with a check per phrase.
        </p>
        <Link to="/transcribe" className={buttonClass("primary", "md", "mt-3")}>
          Open Transcribe
        </Link>
      </Card>
    </Page>
  );
}

/** Tools that unlock when this session starts (START rows of contracts §3.2, e.g. `ebass` and `.lpf()` at C1.S1). */
export function startUnlocks(toolbox: readonly ToolEntry[], sessionId: string): ToolEntry[] {
  return toolbox.filter((t) => {
    const at = Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at];
    return t.unlock.when === "start" && at.includes(sessionId as never);
  });
}

function Start({ def, state }: { def: CapstoneDef; state: CapstoneState }) {
  const shared = useContent();
  const boot = useBootstrap();
  const capContent = useCapstoneContent();
  const start = useStartCapstoneSession();
  const create = useCreateDraft();
  const patch = usePatchDraft();
  const shipping = capContent.data?.shipping ?? ["flavour.pop"];
  const preferred = boot.data?.profile.flavour;
  const [flavour, setFlavour] = useState<FlavourId>(
    preferred && shipping.includes(preferred) ? preferred : (shipping[0] ?? "flavour.pop"),
  );
  const first = def.sessionDefs[0];
  const unlocks = first ? startUnlocks(shared.data?.toolbox ?? [], first.id) : [];
  const onStart = async () => {
    if (!first || !boot.data) return;
    try {
      // The draft first, so the flavour chosen here stays with it (the server stores it at completion) and the
      // workspace opens on it; then the session, which flips the capstone to "in progress" and grants its START
      // unlocks. Inside Today's session the runner has already started this map item.
      const draft = await create.mutateAsync({
        body: {
          title: def.title,
          originKind: "capstone",
          originId: def.id,
          sessionId: currentSessionId(),
          code: starterOf(def),
          bpm: null,
          meter: def.meter,
          key: def.key ?? null,
          analysis: null,
          note: null,
          tutorAssisted: false,
          band: null,
          flags: { lockedTools: [], previewTools: [] },
          ranOk: false,
        },
      });
      await patch.mutateAsync({ params: { id: draft.sketch.id }, body: { tags: [flavour] } });
      if (!currentSessionId())
        await start.mutateAsync({
          body: {
            kind: "capstone",
            mapItemId: first.id as never,
            targetMinutes: boot.data.profile.targetMinutes,
          },
        });
    } catch (e) {
      toast.error("The session didn't start", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <Page width="narrow">
      <p className="font-mono text-sm text-text-3">{def.id} · capstone</p>
      <h1 className="text-h1">{def.title}</h1>
      <p className="mt-2 max-w-[60ch] text-lg text-text-2">{def.brief?.prompt ?? def.objective}</p>
      <Card className="mt-6 flex flex-col gap-5 p-5">
        <div>
          <h2 className="mb-2 text-h3">The plan</h2>
          <SessionPlan def={def} state={state} />
        </div>
        <div>
          <h2 className="mb-1 text-h3">Flavour</h2>
          <p className="mb-2 text-sm text-text-2">
            The sound world of the brief and of the Band you can play along with. It never changes what is
            checked.
          </p>
          <SegmentedControl<FlavourId>
            label="Flavour"
            value={flavour}
            options={shipping.map((f) => ({ value: f, label: FLAVOUR_TITLE[f] }))}
            onChange={setFlavour}
          />
        </div>
        {unlocks.length > 0 && (
          <div className="flex items-start gap-3 rounded-card bg-lane-in p-3">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-sm">
              Starting this session {unlocks.every((t) => t.kind === "feature") ? "opens" : "unlocks"}{" "}
              {unlocks.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && (i === unlocks.length - 1 ? " and " : ", ")}
                  {t.kind === "feature" ? (
                    t.id === "tb.feature.album" ? (
                      "your album"
                    ) : (
                      t.code
                    )
                  ) : (
                    <code className="rounded bg-surface px-1 font-mono">{t.catalog.signature}</code>
                  )}
                </span>
              ))}
              .
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            loading={start.isPending || create.isPending || patch.isPending}
            onClick={() => void onStart()}
            autoFocus
          >
            Start session 1 of {def.sessionDefs.length}
          </Button>
          <span className="text-sm text-text-3">
            About {def.sessionDefs.length > 1 ? "15 minutes a session" : "15 minutes"}.
          </span>
        </div>
      </Card>
      <p className="mt-4 flex items-center gap-2 text-sm text-text-3">
        {def.id === "C0" && <Chip tone="accent">Side A · track 1</Chip>}
        {def.id === "C0"
          ? "This is the track that opens your album."
          : "When you release it, it joins your album with a cover grown from the music."}
      </p>
    </Page>
  );
}

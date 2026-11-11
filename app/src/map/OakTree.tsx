// The Tree tab of /oak: toolbar (what's next, legend, zoom), the canvas, and the node panel docked over the
// canvas' right edge. Keys: arrows between leaves, Enter opens, Esc closes, + / − zoom, 0 fits the whole map,
// W fits the width, N goes to what's next.
import type { SkillState } from "@oak/api";
import { clsx } from "clsx";
import { Maximize2, Minus, MoveHorizontal, Plus, Route as RouteIcon } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import { Button, IconButton } from "../ui/kit/Button.tsx";
import { EmptyState } from "../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { LeafSwatch } from "./Leaf.tsx";
import { NodePanel } from "./NodePanel.tsx";
import { type MapCommand, OakMap, PANEL_WIDTH } from "./OakMap.tsx";
import { LEAF_STATUSES, leafView, STATUS_HELP, STATUS_LABEL } from "./state.ts";
import { type OakModel, useOak } from "./use-oak.ts";

const SAMPLE_STATE = {
  locked: "new",
  available: "available",
  introduced: "learning",
  practising: "practiced",
  mastered: "mastered",
} as const;

export function Legend({ className }: { className?: string }) {
  const sample = (level: (typeof SAMPLE_STATE)[keyof typeof SAMPLE_STATE], freshness = 1, drying = false) =>
    leafView({
      skillId: "R01" as SkillState["skillId"],
      P: 0.5,
      R: null,
      D: 0,
      M: 0,
      level,
      debt: false,
      debtReason: null,
      provisional: false,
      paused: false,
      freshness,
      drying,
      updatedAt: "",
    });
  return (
    <ul
      aria-label="Legend"
      className={clsx("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2", className)}
    >
      {LEAF_STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-1.5" title={STATUS_HELP[s]}>
          <LeafSwatch view={sample(SAMPLE_STATE[s])} />
          {STATUS_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5" title="Paler leaves have reviews coming due.">
        <LeafSwatch view={sample("practiced", 0.35)} />
        Paler: review soon
      </li>
      <li className="flex items-center gap-1.5" title="Its cards are in today's warm-up.">
        <LeafSwatch view={sample("practiced", 0.3, true)} />
        In today's warm-up
      </li>
    </ul>
  );
}

let commandSeq = 0;

function TreeBody({
  model,
  families,
  cards,
  leaf,
}: { model: OakModel; leaf: string | null } & Pick<Parameters<typeof NodePanel>[0], "families" | "cards">) {
  const { graph, layout, states, next } = model;
  const [selected, setSelected] = useState<string | null>(leaf && model.layout.byId.has(leaf) ? leaf : null);
  const [showNext, setShowNext] = useState(true);
  const [command, setCommand] = useState<MapCommand | null>(null);
  const send = (kind: MapCommand["kind"], id?: string) =>
    setCommand(id === undefined ? { kind, seq: ++commandSeq } : { kind, id, seq: ++commandSeq });
  const firstNext = next.targets[0] ?? null;
  const initialId = selected ?? firstNext ?? layout.nodes[0]?.id ?? null;
  const node = selected ? graph.nodes.find((n) => n.id === selected) : undefined;
  const close = () => {
    const id = selected;
    setSelected(null);
    if (id)
      requestAnimationFrame(() =>
        document
          .querySelector<SVGGElement>(`[data-node="${CSS.escape(id)}"]`)
          ?.focus({ preventScroll: true }),
      );
  };
  const goNext = () => {
    if (!firstNext) return;
    setShowNext(true);
    send("focus", firstNext);
    requestAnimationFrame(() =>
      document
        .querySelector<SVGGElement>(`[data-node="${CSS.escape(firstNext)}"]`)
        ?.focus({ preventScroll: true }),
    );
  };

  useHotkeys([
    {
      id: "oak.zoom-in",
      keys: "=|+|Shift+=",
      scope: "global",
      group: "The Oak",
      description: "Zoom in",
      run: () => send("zoom-in"),
    },
    {
      id: "oak.zoom-out",
      keys: "-",
      scope: "global",
      group: "The Oak",
      description: "Zoom out",
      run: () => send("zoom-out"),
    },
    {
      id: "oak.fit",
      keys: "0",
      scope: "global",
      group: "The Oak",
      description: "Show the whole map",
      run: () => send("fit"),
    },
    {
      id: "oak.fit-width",
      keys: "W",
      scope: "global",
      group: "The Oak",
      description: "Fit the width (reading size)",
      run: () => send("fit-width"),
    },
    {
      id: "oak.next",
      keys: "N",
      scope: "global",
      group: "The Oak",
      description: "Go to what's next",
      when: () => firstNext !== null,
      run: goNext,
    },
    {
      id: "oak.close",
      keys: "Escape",
      scope: "global",
      group: "The Oak",
      description: "Close the leaf panel",
      when: () => selected !== null,
      run: close,
    },
    // Listed for the shortcut sheet; the leaves handle these keys themselves.
    {
      id: "oak.arrows",
      keys: "ArrowUp|ArrowDown|ArrowLeft|ArrowRight",
      scope: "global",
      group: "The Oak",
      description: "Move between leaves",
      when: () => false,
      run: () => {},
    },
    {
      id: "oak.open",
      keys: "Enter",
      scope: "global",
      group: "The Oak",
      description: "Open the leaf panel",
      when: () => false,
      run: () => {},
    },
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          {next.sessionId ? (
            <>
              <Button
                variant={showNext ? "primary" : "secondary"}
                size="sm"
                aria-pressed={showNext}
                icon={<RouteIcon aria-hidden className="size-4" />}
                onClick={() => setShowNext((s) => !s)}
                data-testid="whats-next-toggle"
              >
                What's next
              </Button>
              <button
                type="button"
                onClick={goNext}
                className="min-w-0 truncate text-left text-sm text-text-2 underline-offset-2 hover:text-text hover:underline"
                data-testid="whats-next"
              >
                {next.title}
                {next.targets.length > 0 && (
                  <span className="text-text-3">
                    {" "}
                    · {next.kind === "lesson" ? "grows" : "checks"} {next.targets.length}{" "}
                    {next.targets.length === 1 ? "leaf" : "leaves"}
                  </span>
                )}
              </button>
            </>
          ) : (
            <p className="text-sm text-text-2">
              Every open lesson is done. New leaves appear as the course opens.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1" role="toolbar" aria-label="Map view">
          <IconButton
            label="Zoom out"
            shortcut="−"
            icon={<Minus aria-hidden className="size-4" />}
            onClick={() => send("zoom-out")}
          />
          <IconButton
            label="Zoom in"
            shortcut="+"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={() => send("zoom-in")}
          />
          <IconButton
            label="Fit the width"
            shortcut="W"
            icon={<MoveHorizontal aria-hidden className="size-4" />}
            onClick={() => send("fit-width")}
          />
          <IconButton
            label="Show the whole map"
            shortcut="0"
            icon={<Maximize2 aria-hidden className="size-4" />}
            onClick={() => send("fit")}
          />
        </div>
      </div>
      <Legend />
      <div className="relative h-[calc(100dvh-262px)] min-h-[380px]">
        <OakMap
          layout={layout}
          states={states}
          next={next}
          showNext={showNext}
          selectedId={selected}
          panelOpen={node !== undefined}
          onSelect={setSelected}
          onClose={close}
          command={command}
          unitProgress={model.units}
          initialId={initialId}
        />
        {node && (
          <div
            className="absolute top-px right-px bottom-px z-20 overflow-hidden rounded-r-card"
            style={{ width: PANEL_WIDTH }}
          >
            <NodePanel
              node={node}
              state={states.get(node.id)}
              states={states}
              graph={graph}
              families={families}
              cards={cards}
              lessonStatus={model.lessonStatus}
              lessonTitle={model.lessonTitle}
              reviveSec={model.reviveSec}
              isNext={next.targets.includes(node.id)}
              onSelect={(id) => {
                setSelected(id);
                send("focus", id);
              }}
              onClose={close}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function OakTree({ leaf = null }: { leaf?: string | null }) {
  const { content, map, families, model } = useOak();
  if (content.isError) return <ErrorState error={content.error} onRetry={() => void content.refetch()} />;
  if (!model || map.isPending) return <LoadingState rows={4} label="Loading the map" />;
  if (model.layout.nodes.length === 0)
    return (
      <EmptyState title="No skills yet">
        The content build has no skill graph. Run <code>bun run content:build</code> and reload.
      </EmptyState>
    );
  return (
    <>
      {map.isError && (
        <p className="mb-2 text-sm text-text-2" role="status">
          Your progress could not be loaded, so every leaf shows as not open yet.
        </p>
      )}
      <TreeBody
        model={model}
        families={content.data?.families ?? []}
        cards={families.data?.cards ?? []}
        leaf={leaf}
      />
    </>
  );
}

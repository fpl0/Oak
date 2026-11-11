// The node panel (ux §5.2 "Inspector"): what the skill is in one sentence, where it was introduced, the
// evidence so far, what it builds on and leads to, its drill families, and the one next action
// ("Practise this", or "Revive" while it is drying).
import type { FamilyDef, SkillState, SrsCard } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { REGION_LABEL } from "../lib/content-model.ts";
import { buttonClass, IconButton } from "../ui/kit/Button.tsx";
import { Chip } from "../ui/kit/basics.tsx";
import { blurbOf } from "./blurbs.ts";
import type { MapGraph, MapNode } from "./graph.ts";
import { familiesOf, type PractiseTarget, practiseTarget } from "./guide.ts";
import { LeafSwatch } from "./Leaf.tsx";
import { freshnessLabel, leafView, pctText, STATUS_HELP, STATUS_LABEL } from "./state.ts";

const KIND_LABEL: Record<string, string> = {
  fact: "Fact",
  concept: "Concept",
  perceptual: "Hearing",
  production: "Doing",
  creative: "Making",
};

export interface NodePanelProps {
  node: MapNode;
  state: SkillState | undefined;
  states: ReadonlyMap<string, SkillState>;
  graph: MapGraph;
  families: readonly FamilyDef[];
  cards: readonly Pick<SrsCard, "cardId" | "status">[];
  lessonStatus: ReadonlyMap<string, string>;
  lessonTitle: (id: string) => string;
  reviveSec: number;
  isNext: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function PractiseAction({ target }: { target: PractiseTarget }) {
  if (target.kind === "family")
    return (
      <Link
        to="/practice/$familyId"
        params={{ familyId: target.familyId }}
        className={buttonClass("primary", "md", "w-full")}
        data-testid="practise-this"
      >
        Practise this: {target.title} <ArrowRight aria-hidden className="size-4" />
      </Link>
    );
  if (target.kind === "lesson")
    return (
      <Link
        to="/learn/$lessonId"
        params={{ lessonId: target.lessonId }}
        className={buttonClass("primary", "md", "w-full")}
        data-testid="practise-this"
      >
        {target.completed ? "Revisit" : "Open"} {target.lessonId} · {target.title}{" "}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    );
  return (
    <p className="rounded-control border border-dashed border-border px-3 py-2 text-sm text-text-2">
      {target.lessonId
        ? `Opens with ${target.lessonId} · ${target.title}. Nothing to do here until then.`
        : "No lesson teaches this yet."}
    </p>
  );
}

export function NodePanel(p: NodePanelProps) {
  const { node, state, graph } = p;
  const v = leafView(state);
  const heading = useRef<HTMLHeadingElement>(null);
  const prereqs = graph.edges.filter(([, b]) => b === node.id).map(([a]) => a);
  const leadsTo = graph.edges.filter(([a]) => a === node.id).map(([, b]) => b);
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));
  const fams = familiesOf(node.id, p.families);
  const cardStatus = new Map(p.cards.map((c) => [c.cardId, c.status]));
  const target = practiseTarget(node, p);
  const introStatus = node.introducedBy ? (p.lessonStatus.get(node.introducedBy) ?? "locked") : "locked";
  const tracked = v.status === "introduced" || v.status === "practising" || v.status === "mastered";

  // Move focus to the heading when the panel opens on a new leaf (screen readers hear the skill's name).
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [node.id]);

  const chip = (id: string) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => p.onSelect(id)}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2 text-sm hover:bg-surface-2"
      >
        <LeafSwatch view={leafView(p.states.get(id))} />
        <span className="font-mono text-[0.75rem] text-text-3">{id}</span>
        <span className="max-w-[16ch] truncate">{names.get(id) ?? id}</span>
      </button>
    </li>
  );

  return (
    <aside
      aria-labelledby="oak-panel-title"
      className="flex h-full flex-col border-l border-border bg-surface shadow-overlay"
      data-testid="oak-panel"
    >
      <div className="flex items-start gap-2 border-b border-border px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-3">
            <span className="font-mono">{node.id}</span>
            <span>{REGION_LABEL[node.region]}</span>
            <span>{KIND_LABEL[node.kind] ?? node.kind}</span>
          </p>
          <h2
            id="oak-panel-title"
            ref={heading}
            tabIndex={-1}
            className="mt-0.5 text-h3 leading-snug outline-none"
          >
            {node.name}
          </h2>
        </div>
        <IconButton
          label="Close panel"
          shortcut="Esc"
          onClick={p.onClose}
          icon={<X aria-hidden className="size-4" />}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <p>{blurbOf(node.id, node.name)}</p>

        <section aria-label="Status" className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-medium">
            <LeafSwatch view={v} />
            {STATUS_LABEL[v.status]}
            {p.isNext && <Chip tone="amber">Next</Chip>}
            {v.debt && <Chip tone="issue">Needs a revisit</Chip>}
            {v.provisional && <Chip>Provisional</Chip>}
          </p>
          <p className="text-sm text-text-2">{STATUS_HELP[v.status]}</p>
        </section>

        <section aria-labelledby="oak-intro" className="flex flex-col gap-1">
          <h3 id="oak-intro" className="font-sans text-sm font-semibold text-text-2">
            Introduced in
          </h3>
          {node.introducedBy ? (
            introStatus === "locked" ? (
              <p className="text-sm">
                <span className="font-mono text-text-3">{node.introducedBy}</span>{" "}
                {p.lessonTitle(node.introducedBy)}
                <span className="text-text-3"> · not open yet</span>
              </p>
            ) : (
              <p className="text-sm">
                <Link
                  to="/learn/$lessonId"
                  params={{ lessonId: node.introducedBy }}
                  className="text-link underline-offset-2 hover:underline"
                >
                  <span className="font-mono">{node.introducedBy}</span> {p.lessonTitle(node.introducedBy)}
                </Link>
                <span className="text-text-3"> · {introStatus.replace("_", " ")}</span>
              </p>
            )
          ) : (
            <p className="text-sm text-text-2">No lesson yet.</p>
          )}
        </section>

        <section aria-labelledby="oak-evidence" className="flex flex-col gap-1">
          <h3 id="oak-evidence" className="font-sans text-sm font-semibold text-text-2">
            Evidence so far
          </h3>
          {state && tracked ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm" data-testid="oak-evidence">
              <dt className="text-text-2">Strength</dt>
              <dd className="text-right tabular-nums">{pctText(state.M)}</dd>
              <dt className="text-text-2">Accuracy</dt>
              <dd className="text-right tabular-nums">{pctText(state.P)}</dd>
              <dt className="text-text-2">Solid days (60 d)</dt>
              <dd className="text-right tabular-nums">{state.D}</dd>
              <dt className="text-text-2">Recall</dt>
              <dd className="text-right tabular-nums">
                {state.R === null ? "no cards yet" : pctText(state.R)}
              </dd>
              <dt className="text-text-2">Freshness</dt>
              <dd className="text-right">{freshnessLabel(v.freshness)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-text-2">
              None yet. It starts counting the first time you use this skill in a lesson.
            </p>
          )}
          {v.paused && (
            <p className="text-sm text-text-2">
              Paused while Oak has no microphone: its reviews wait, and the leaf keeps its last colour.
            </p>
          )}
        </section>

        {fams.length > 0 && (
          <section aria-labelledby="oak-fams" className="flex flex-col gap-1">
            <h3 id="oak-fams" className="font-sans text-sm font-semibold text-text-2">
              Drills that train it
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {fams.map((f) => {
                const st = cardStatus.get(f.id);
                return (
                  <li key={f.id} className="flex items-baseline justify-between gap-2">
                    <span>{f.title}</span>
                    <span className="shrink-0 text-text-3">
                      {st === "active" || st === "graduated"
                        ? "in your reviews"
                        : st === "deferred"
                          ? "queued for later"
                          : (p.lessonStatus.get(f.unlock.lesson) ?? "locked") === "locked"
                            ? `opens with ${f.unlock.lesson}`
                            : "not in your reviews yet"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {prereqs.length > 0 && (
          <section aria-labelledby="oak-builds" className="flex flex-col gap-1.5">
            <h3 id="oak-builds" className="font-sans text-sm font-semibold text-text-2">
              Builds on
            </h3>
            <ul className="flex flex-wrap gap-1.5">{prereqs.map(chip)}</ul>
          </section>
        )}
        {leadsTo.length > 0 && (
          <section aria-labelledby="oak-leads" className="flex flex-col gap-1.5">
            <h3 id="oak-leads" className="font-sans text-sm font-semibold text-text-2">
              Leads to
            </h3>
            <ul className="flex flex-wrap gap-1.5">{leadsTo.map(chip)}</ul>
          </section>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4">
        {v.drying && (
          <Link
            to="/practice/review"
            className={buttonClass("secondary", "md", "w-full")}
            data-testid="revive"
          >
            Revive in today's warm-up (≈{Math.max(1, Math.round(p.reviveSec / 60))} min)
          </Link>
        )}
        <PractiseAction target={target} />
      </div>
    </aside>
  );
}

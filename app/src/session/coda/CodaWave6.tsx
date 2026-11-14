// The Coda's Wave 6 parts. On an ordinary day of U12–U17: the line that says what the learner can now do, the card
// that opens the first part of the core finale (after U15.L01), and the card for advanced-track gates met today
// (after U13.CP: "The Jazz and Rhythm tracks are open"), each said once. On the day the core is completed: the
// finale section (content/specs/END.md), four parts on one page — the record, what the learner can now do, the Oak,
// what is open now — in place of the day's teaser. Nothing here plays by itself, counts up or stands between the
// learner and "Done for today".
import type { CoreCompletion, TrackGateState } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { ArrowRight, GitBranch } from "lucide-react";
import { SideARecord } from "../../album/SideARecord.tsx";
import { useContent } from "../../lib/content.ts";
import { lessonTitles } from "../../lib/content-model.ts";
import { useAlbum, useCanDo, useTranscriptions } from "../../lib/queries.ts";
import { OakGlance, useOak } from "../../map/index.ts";
import { countLeaves } from "../../map/state.ts";
import { Card, Chip, Skeleton } from "../../ui/kit/basics.tsx";
import { CFT_OPENED } from "../cft-day.ts";
import type { CanNowLine } from "../coda-model.ts";
import {
  canDoClosing,
  FINALE_COPY,
  finaleCanDo,
  type OpenRow,
  oakLines,
  openList,
  roadLine,
} from "../finale-model.ts";
import { sourceRank } from "../progress-model.ts";
import { itemTitle } from "../titles.ts";
import { gatesCard } from "../tracks-model.ts";

/** "You can now build the V of V and say where it resolves." — under the Coda's title, on the day it became true. */
export function CanNow({ lines }: { lines: readonly CanNowLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-0.5" data-testid="coda-can-now">
      {lines.map((l) => (
        <li key={l.candoId} className="font-display text-h3 leading-snug" data-cando={l.candoId}>
          {l.text}
        </li>
      ))}
    </ul>
  );
}

/** Advanced-track gates met in this session (`SessionSummary.gatesOpened`): said once, honest about what exists. */
export function GatesOpenedCard({ gates }: { gates: readonly TrackGateState[] | undefined }) {
  const card = gatesCard(gates);
  if (!card) return null;
  return (
    <section
      aria-label="Tracks opened"
      className="rounded-card border border-accent/50 bg-lane-in px-5 py-4 animate-fade-in"
      data-testid="coda-tracks"
      data-tracks={card.tracks.join(",")}
    >
      <p className="flex items-center gap-1.5 text-sm text-text-2">
        <GitBranch aria-hidden className="size-4" /> On the Oak
      </p>
      <p className="font-display text-h2">{card.title}</p>
      <p className="mt-1 max-w-[62ch] text-text-2">{card.body}</p>
      <Link
        to="/oak"
        search={{ view: "course" }}
        className="mt-2 inline-block text-sm text-link underline-offset-2 hover:underline"
      >
        See the branches on the Oak
      </Link>
    </section>
  );
}

/** The card of U15.L01's Coda: the first part of the core finale has opened (content/specs/U15.md, word for word). */
export function CftOpenedCard() {
  return (
    <section
      aria-label="The core finale"
      className="rounded-card border border-accent/50 bg-lane-in px-5 py-4 animate-fade-in"
      data-testid="coda-cft-opened"
    >
      <p className="font-display text-h2">{CFT_OPENED.title}</p>
      <p className="mt-1 max-w-[66ch] text-text-2">{CFT_OPENED.body}</p>
    </section>
  );
}

function Part({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <Card className="p-4" data-testid={testId}>
      <h3 className="mb-2 text-h3">{title}</h3>
      {children}
    </Card>
  );
}

/**
 * The record: Side A, finished. The album area's own component (END.md: the Coda imports it and does not rebuild a
 * player): twelve covers in running order, the single last, "Play Side A" and "Open the album". It never starts by
 * itself and keeps playing while the learner reads the rest.
 */
function RecordPart() {
  return (
    <Card className="p-4" data-testid="finale-record">
      <SideARecord coda />
    </Card>
  );
}

/** What you can now do: at most seven statements, each with the graded work that made it true. */
function CanDoPart({ completion, since }: { completion: CoreCompletion; since: string | null }) {
  const content = useContent();
  const ledger = useCanDo();
  const album = useAlbum();
  const transcriptions = useTranscriptions();
  const titles = lessonTitles(content.data?.syllabus ?? null);
  const defs = content.data?.candos ?? [];
  const order = (content.data?.syllabus?.defaultOrder ?? []) as readonly string[];
  const entries = ledger.data?.items ?? [];
  const lines = finaleCanDo(
    completion.canDo,
    entries,
    (id) => defs.find((d) => d.id === id)?.area ?? null,
    {
      trackTitle: (id) => album.data?.tracks.find((t) => t.id === id)?.title ?? null,
      songTitle: (id) => transcriptions.data?.items.find((t) => t.id === id)?.title ?? null,
      itemTitle: (id) => itemTitle(id, titles),
    },
    since,
  );
  const coreIds = defs.filter((d) => sourceRank(d.source, order) >= 0).map((d) => d.id as string);
  const closing = ledger.data && coreIds.length > 0 ? canDoClosing(coreIds, entries) : null;
  return (
    <Part title={FINALE_COPY.canDoHeading} testId="finale-cando">
      {lines.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((l) => (
            <li key={l.candoId} className="flex flex-wrap items-baseline gap-x-3 py-2" data-cando={l.candoId}>
              <span className="min-w-0 flex-1 basis-64">{l.text}</span>
              <span className="flex items-center gap-2 text-sm text-text-3">
                {l.evidence}
                {l.newToday && <Chip tone="accent">{FINALE_COPY.newToday}</Chip>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-text-2">
        {closing && <span data-testid="finale-cando-counts">{closing.line} </span>}
        <Link
          to="/progress"
          hash="ledger"
          className="text-link underline-offset-2 hover:underline"
          data-testid="finale-cando-link"
        >
          {FINALE_COPY.canDoLink}
        </Link>
      </p>
    </Part>
  );
}

/** Your Oak: the tree as it is today, pale leaves included, and the lines its leaf counts give. */
function OakPart() {
  const { model, map } = useOak();
  // The core's leaves: every node whose unit belongs to the core (the tracks' rows are the bare crown).
  const core =
    model?.graph.nodes
      .filter((n) => model.graph.units.find((u) => u.id === n.unit)?.track === "core")
      .map((n) => n.id) ?? [];
  const counts = model && map.data ? countLeaves(core, model.states) : null;
  return (
    <Part title={FINALE_COPY.oakHeading} testId="finale-oak">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <OakGlance width={320} caption={false} />
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
          {counts ? (
            oakLines({
              mastered: counts.byStatus.mastered,
              practising: counts.byStatus.practising,
              introduced: counts.byStatus.introduced,
              drying: counts.drying,
            }).map((line) => (
              <p key={line} className="text-text-2">
                {line}
              </p>
            ))
          ) : map.isError ? (
            <p className="text-text-2">{FINALE_COPY.oakUnavailable}</p>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
          <Link
            to="/oak"
            search={{ view: "tree" }}
            className="mt-1 text-sm text-link underline-offset-2 hover:underline"
            data-testid="finale-oak-link"
          >
            {FINALE_COPY.oakLink}
          </Link>
        </div>
      </div>
    </Part>
  );
}

function OpenLink({ row }: { row: OpenRow }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-text">{row.title}</span>
        <span className="block text-sm text-text-2">{row.note}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-text-3" />
    </>
  );
  const cls = "flex items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-2";
  // On the day of the ending these are links, not "start now" buttons: the day is done.
  if (row.to?.to === "/studio")
    return (
      <Link to="/studio" className={cls}>
        {body}
      </Link>
    );
  if (row.to?.to === "/learn/$lessonId")
    return (
      <Link to="/learn/$lessonId" params={row.to.params} className={cls}>
        {body}
      </Link>
    );
  if (row.to?.to === "/capstone/$id")
    return (
      <Link to="/capstone/$id" params={row.to.params} className={cls}>
        {body}
      </Link>
    );
  return (
    <Link to="/" className={cls}>
      {body}
    </Link>
  );
}

/** What is open now: the line for tomorrow, what can be started, then what cannot be started yet. */
function OpenPart({ open }: { open: CoreCompletion["open"] }) {
  const list = openList(open);
  return (
    <Part title={FINALE_COPY.openHeading} testId="finale-open">
      {list.tomorrow && (
        <p className="mb-1 font-medium" data-testid="finale-tomorrow">
          {list.tomorrow}
        </p>
      )}
      {list.startable.length > 0 && (
        <ul className="-mx-3 flex flex-col">
          {list.startable.map((r) => (
            <li key={`${r.kind}:${r.id ?? ""}`} data-open={r.kind}>
              <OpenLink row={r} />
            </li>
          ))}
        </ul>
      )}
      {list.waiting.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2" data-testid="finale-waiting">
          {list.waiting.map((r) => (
            <li key={`${r.kind}:${r.id ?? ""}`} className="text-sm" data-track={r.id ?? undefined}>
              <span className="text-text-2">{r.title}</span>
              <span className="text-text-3"> · {r.note}</span>
            </li>
          ))}
        </ul>
      )}
    </Part>
  );
}

/**
 * The finale section: the heading (the milestone's own sentence), the road in one line of the learner's numbers,
 * then the four parts in order. `since` is the start of the session that ended the core ("new today"); null when
 * the ending is reopened from Progress.
 */
export function Finale({ completion, since }: { completion: CoreCompletion; since: string | null }) {
  const road = roadLine(completion.stats);
  return (
    <section aria-labelledby="finale-h" className="flex flex-col gap-4" data-testid="coda-finale">
      <header className="rounded-card border border-accent/50 bg-lane-in px-5 py-4">
        <h2 id="finale-h" className="font-display text-h1" data-testid="finale-heading">
          {completion.milestone?.title ?? FINALE_COPY.heading}
        </h2>
        <p className="mt-1 max-w-[66ch] text-text-2">
          {completion.milestone?.description ?? FINALE_COPY.under}
        </p>
        {road && (
          <p className="mt-2 text-sm text-text-2" data-testid="finale-road">
            {road}
          </p>
        )}
      </header>
      <RecordPart />
      <CanDoPart completion={completion} since={since} />
      <OakPart />
      <OpenPart open={completion.open} />
    </section>
  );
}

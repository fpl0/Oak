// Practice hub (ux §2.3): today's review, the mixed set, and the family grid grouped by type with level, recall
// and a link to practise each family.
import type { FamilyDef, FamilyState, SrsCard } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Lock } from "lucide-react";
import { useContent } from "../../lib/content.ts";
import { pct } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useDue, useFamilies } from "../../lib/queries.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, PageHeader, Skeleton } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/practice/")({ component: PracticeHub });

const DOMAIN_LABEL: Record<string, string> = {
  degree: "Degrees",
  interval: "Intervals",
  chord: "Chord quality",
  harmony: "Progressions",
  rhythm: "Rhythm",
  melody: "Melody",
  pitch: "Pitch",
  voice: "Singing",
  theory: "Theory facts",
};

function recallTone(card: SrsCard | undefined): string {
  if (!card) return "bg-border";
  if (card.retrievability >= 0.9) return "bg-accent";
  if (card.retrievability >= 0.75) return "bg-accent-2";
  return "bg-issue";
}

function FamilyCard({
  def,
  state,
  card,
  lockedBy,
}: {
  def: FamilyDef;
  state: FamilyState | undefined;
  card: SrsCard | undefined;
  lockedBy: string | null;
}) {
  const locked = !state;
  const stats = state ? Object.values(state.categoryStats) : [];
  const n = stats.reduce((a, s) => a + s.n, 0);
  const hits = stats.reduce((a, s) => a + s.hits, 0);
  return (
    <Card className={clsx("flex flex-col gap-2 p-4", locked && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-sans text-base font-semibold">{def.title}</h3>
        {!locked && (
          <span
            className={clsx("mt-1.5 size-2.5 shrink-0 rounded-full", recallTone(card))}
            title={card ? `Recall ${pct(card.retrievability)}` : "Not scheduled yet"}
            aria-label={card ? `Recall ${pct(card.retrievability)}` : "Not scheduled yet"}
            role="img"
          />
        )}
      </div>
      {locked ? (
        <p className="flex items-center gap-1.5 text-sm text-text-2">
          <Lock aria-hidden className="size-3.5" /> {lockedBy ? `Unlocks in ${lockedBy}` : "Locked"}
        </p>
      ) : (
        <>
          <p className="text-sm text-text-2">
            Level {state.level} of {def.levels.length}
            {n > 0 && ` · ${pct(hits / n)} over ${n} trials`}
          </p>
          <Link
            to="/practice/$familyId"
            params={{ familyId: def.id }}
            className={buttonClass("secondary", "sm", "self-start")}
          >
            Practice
          </Link>
        </>
      )}
    </Card>
  );
}

function PracticeHub() {
  usePageTitle("Practice");
  const due = useDue();
  const families = useFamilies();
  const content = useContent();
  const states = new Map(families.data?.families.map((f) => [f.familyId, f]) ?? []);
  const cards = new Map(families.data?.cards.map((c) => [c.cardId, c]) ?? []);
  const groups = new Map<string, FamilyDef[]>();
  for (const f of content.data?.families ?? []) groups.set(f.domain, [...(groups.get(f.domain) ?? []), f]);

  return (
    <Page>
      <PageHeader
        title="Practice"
        sub={due.data ? due.data.label : due.isPending ? " " : undefined}
        actions={
          <Link to="/practice/review" className={buttonClass("primary", "lg")}>
            Start today's review
          </Link>
        }
      />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">Mixed set · 10 min (recommended)</p>
          <p className="text-sm text-text-2">Mixed practice feels harder — that's why it sticks.</p>
        </div>
        {due.isPending ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <Link to="/practice/review" className={buttonClass("secondary")}>
            Mixed set
          </Link>
        )}
      </Card>
      <p className="mb-4 text-sm text-text-3">
        Extra practice doesn't change your schedule unless items are nearly due.
      </p>
      {content.isPending || families.isPending ? (
        <LoadingState rows={4} label="Loading families" />
      ) : families.isError && !content.data?.families.length ? (
        <ErrorState error={families.error} onRetry={() => void families.refetch()} />
      ) : groups.size === 0 ? (
        <EmptyState title="No drill families yet">Families open as lessons introduce them.</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {families.isError && (
            <p className="text-sm text-text-3" role="status">
              Your levels could not be loaded; every family shows as locked for now.
            </p>
          )}
          {[...groups].map(([domain, defs]) => (
            <section key={domain} aria-labelledby={`dom-${domain}`}>
              <h2 id={`dom-${domain}`} className="mb-3 text-h3">
                {DOMAIN_LABEL[domain] ?? domain} <Chip className="ml-1 align-middle">{defs.length}</Chip>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {defs.map((d) => (
                  <FamilyCard
                    key={d.id}
                    def={d}
                    state={states.get(d.id)}
                    card={cards.get(d.id)}
                    lockedBy={d.unlock.lesson.split(".")[0] ?? null}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

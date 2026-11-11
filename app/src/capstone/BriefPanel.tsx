// The Brief panel (ux §2.3, 300 px in place of the Studio sidebar): the brief, the session plan, the flavour, the
// living Requirements checklist, going past the brief, Claude's review, and a quiet "Report a grading problem".
import type { CapstoneDef, CapstoneReview, CapstoneState, FlavourId } from "@oak/api";
import { clsx } from "clsx";
import { Check, Circle, MessageSquareText, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { SegmentedControl } from "../ui/kit/Controls.tsx";
import { anchorText } from "./anchors.ts";
import { Checklist } from "./Checklist.tsx";
import type { ChecklistRow, Readiness } from "./checklist.ts";
import { FLAVOUR_TITLE } from "./content.ts";

export interface BriefPanelProps {
  def: CapstoneDef;
  state: CapstoneState;
  rows: readonly ChecklistRow[];
  ready: Readiness;
  checking: boolean;
  stale: boolean;
  beyond: readonly string[];
  flavour: FlavourId;
  shipping: readonly FlavourId[];
  onFlavour(f: FlavourId): void;
  flavourLocked: boolean;
  review: CapstoneReview | null;
  reviewRequested: boolean;
  canRequestReview: boolean;
  onRequestReview(): void;
  onReport(note: string | null): Promise<void>;
}

export function BriefPanel(p: BriefPanelProps) {
  const { def, state } = p;
  const total = def.sessionDefs.length;
  return (
    <aside
      aria-label="Brief"
      className="flex w-[300px] shrink-0 flex-col gap-5 overflow-auto border-r border-border bg-surface px-4 py-4"
    >
      <header>
        <p className="font-mono text-sm text-text-3">{def.id} · capstone</p>
        <h1 className="font-display text-h2 leading-tight">{def.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-2">{def.brief?.prompt ?? def.objective}</p>
      </header>

      <section aria-labelledby="cap-sessions">
        <h2 id="cap-sessions" className="mb-2 font-sans text-sm font-semibold text-text-2">
          Sessions
        </h2>
        <ol className="flex flex-col gap-1.5">
          {def.sessionDefs.map((sd, i) => {
            const done = state.sessions.includes(sd.id);
            const current = !done && i === Math.min(state.sessionsDone, total - 1);
            return (
              <li
                key={sd.id}
                aria-current={current ? "step" : undefined}
                className={clsx("flex gap-2 rounded-control px-2 py-1 text-sm", current && "bg-lane-in")}
              >
                {done ? (
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                ) : (
                  <Circle
                    aria-hidden
                    className={clsx("mt-0.5 size-4 shrink-0", current ? "text-accent" : "text-text-3")}
                  />
                )}
                <span className="min-w-0">
                  <span className="font-mono text-text-3 tabular-nums">
                    {i + 1}/{total}
                  </span>{" "}
                  <span className={clsx(current ? "font-medium" : "text-text-2")}>{sd.title}</span>
                  <span className="sr-only">{done ? " (done)" : current ? " (now)" : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="cap-flavour">
        <h2 id="cap-flavour" className="mb-2 font-sans text-sm font-semibold text-text-2">
          Flavour
        </h2>
        {p.flavourLocked || p.shipping.length < 2 ? (
          <p className="text-sm">{FLAVOUR_TITLE[p.flavour]}</p>
        ) : (
          <SegmentedControl<FlavourId>
            label="Flavour"
            size="sm"
            value={p.flavour}
            options={p.shipping.map((f) => ({ value: f, label: FLAVOUR_TITLE[f] }))}
            onChange={p.onFlavour}
          />
        )}
      </section>

      <Checklist rows={p.rows} ready={p.ready} checking={p.checking} stale={p.stale} />

      {p.beyond.length > 0 && (
        <div role="status" className="flex gap-2 rounded-card border border-accent/30 bg-lane-in p-3 text-sm">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <p className="font-medium">Past the brief</p>
            <ul className="mt-0.5 text-text-2">
              {p.beyond.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="mt-1 text-text-2">Going further is welcome; nothing extra is required.</p>
          </div>
        </div>
      )}

      <ReviewSection {...p} />
      <Report onReport={p.onReport} />
    </aside>
  );
}

function ReviewSection(p: BriefPanelProps) {
  const r = p.review;
  return (
    <section aria-labelledby="cap-review" className="flex flex-col gap-2 border-t border-border pt-4">
      <h2 id="cap-review" className="font-sans text-sm font-semibold text-text-2">
        Claude's review
      </h2>
      {r ? (
        <div className="flex flex-col gap-2 text-sm" data-testid="review-summary">
          <p className="text-text-3">Claude's comments never affect pass or fail.</p>
          <ul className="flex flex-col gap-1.5">
            {r.strengths.map((s) => (
              <li key={s.text} className="flex gap-2">
                <span className="shrink-0 font-mono text-[0.75rem] text-text-3">
                  {anchorText({ from: s.bars[0], to: s.bars[1] })}
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
          {r.revisions.map((v) => (
            <div key={v.title} className="rounded-control border border-border p-2">
              <p className="font-medium">
                {v.title}{" "}
                <span className="font-mono text-[0.75rem] text-text-3">
                  {anchorText({ from: v.bars[0], to: v.bars[1] })}
                </span>
              </p>
              <p className="text-text-2">{v.why}</p>
            </div>
          ))}
          <p className="italic text-text-2">{r.listeningQuestion}</p>
          <p className="text-text-3">
            The suggested code is in the tutor panel
            {p.state.status === "released" ? "." : ", as a preview until the first release."}
          </p>
        </div>
      ) : p.reviewRequested ? (
        <p className="text-sm text-text-2">Requested. It appears in the tutor panel when it is ready.</p>
      ) : (
        <p className="text-sm text-text-2">
          A short structured review: what works, one revision to try, one question to listen for. It never
          affects pass or fail.
        </p>
      )}
      <Button
        size="sm"
        icon={<MessageSquareText aria-hidden className="size-4" />}
        disabled={!p.canRequestReview}
        onClick={p.onRequestReview}
        data-testid="request-review"
      >
        {r ? "Ask for a new review" : "Request review"}
      </Button>
      {!p.canRequestReview && (
        <p className="text-sm text-text-3">Check your track once first: the review reads that check.</p>
      )}
    </section>
  );
}

function Report({ onReport }: { onReport(note: string | null): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm text-text-3 underline-offset-2 hover:text-text hover:underline"
      >
        Report a grading problem
      </button>
    );
  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onReport(note.trim() || null);
          setOpen(false);
          setNote("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="cap-report" className="font-medium">
        What looks wrong?
      </label>
      <textarea
        id="cap-report"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        className="rounded-control border border-border bg-surface p-2"
        placeholder="For example: the snare is on 2 and 4 but the rule says it isn't."
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Send report
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

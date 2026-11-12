// The calm session header: where you are in today's setlist, a soft time ring that fills toward the target and
// never counts down or turns red (ux §1.6), Pause, and Wrap up. At the target a non-modal line offers "Wrap up
// with a quick sketch?"; Keep going is always allowed (contracts §9.3, §9.4).
import type { SessionPlan } from "@oak/api";
import { clsx } from "clsx";
import { Check, Pause } from "lucide-react";
import { IS_MAC } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Kbd } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { ProgressRing } from "../../ui/kit/Meters.tsx";
import { sessionRunner } from "../live.ts";
import { blockBudget, useSession } from "../store.ts";
import type { SessionBlock } from "../types.ts";

/** Pause and resume (contracts §9.3 "pause and resume at a step"). Alt, not a bare letter: drills and the
 * Workbench own the letter keys, and this works from every block. Registered by the session host. */
export const PAUSE_KEYS = "Alt+P";
export const PAUSE_KEY_LABEL = IS_MAC ? "⌥P" : "Alt+P";

const LABEL: Record<SessionBlock, string> = { warmup: "Warm-up", new: "New", make: "Make", coda: "Coda" };

/** The blocks this plan walks through, in order (capstone, gym and light days have no separate Make). */
export function blocksOf(plan: SessionPlan): SessionBlock[] {
  const b = blockBudget(plan.kind, plan.targetMinutes);
  const out: SessionBlock[] = [];
  if (plan.warmup.items.length > 0) out.push("warmup");
  if (
    plan.kind !== "review" &&
    plan.kind !== "keepalive" &&
    plan.kind !== "studio" &&
    (plan.main || plan.mapItemId)
  )
    out.push("new");
  if (b.make > 0 && plan.kind !== "light") out.push("make");
  out.push("coda");
  return out;
}

export function newLabel(plan: SessionPlan): string {
  switch (plan.kind) {
    case "checkpoint":
      return "Checkpoint";
    case "capstone":
      return "Capstone";
    case "gym":
      return "Transcribe";
    case "light":
      return "Light session";
    default:
      return "New";
  }
}

/** `lessonHasWrap`: the mounted lesson player shows its own "Wrap up" in the New block (one button, not two). */
export function SessionHeader({ title, lessonHasWrap = false }: { title: string; lessonHasWrap?: boolean }) {
  const plan = useSession((s) => s.plan);
  const block = useSession((s) => s.block);
  const activeMs = useSession((s) => s.activeMs);
  const wrap = useSession((s) => s.wrap);
  const warmupIndex = useSession((s) => s.warmupIndex);
  const wrappedEarly = useSession((s) => s.wrappedEarly);
  if (!plan || !block) return null;
  const blocks = blocksOf(plan);
  const current = blocks.indexOf(block);
  const target = plan.kind === "checkpoint" ? 20 : plan.kind === "keepalive" ? 2 : plan.targetMinutes;
  const minutes = Math.floor(activeMs / 60_000);
  const keepalive = plan.kind === "keepalive";
  const canWrap =
    (block === "warmup" || block === "new") && (plan.kind === "lesson" || plan.kind === "checkpoint");
  const label = (b: SessionBlock) =>
    b === "new"
      ? newLabel(plan)
      : b === "make" && (wrappedEarly || plan.main?.splitPart === "A")
        ? "Quick sketch"
        : b === "make" && keepalive
          ? "Riff"
          : LABEL[b];
  const detail =
    block === "warmup"
      ? `Set ${Math.min(warmupIndex + 1, plan.warmup.items.length)} of ${plan.warmup.items.length}`
      : block === "new"
        ? title
        : null;

  return (
    <div className="flex flex-col gap-3" data-testid="session-header">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <ProgressRing
            value={Math.min(minutes, target)}
            max={target}
            size={44}
            stroke={3}
            label={`${minutes} of about ${target} minutes`}
          >
            <span aria-hidden className="text-[0.75rem]">
              {minutes}′
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="font-display text-h3 font-semibold" data-testid="session-block">
              {label(block)}
              {detail && <span className="font-sans text-base font-normal text-text-2"> · {detail}</span>}
            </p>
            <ol className="mt-1 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Today's setlist">
              {blocks.map((b, i) => (
                <li
                  key={b}
                  aria-current={i === current ? "step" : undefined}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                    i === current && "bg-lane-in font-medium text-accent",
                    i < current && "text-text-2",
                    i > current && "text-text-3",
                  )}
                >
                  {i < current && <Check aria-hidden className="size-3.5" />}
                  {label(b)}
                  {i < current && <span className="sr-only">, done</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canWrap && !(lessonHasWrap && block === "new") && (
            <Button variant="ghost" onClick={() => sessionRunner.wrapUp()} data-testid="wrap-up">
              Wrap up
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => sessionRunner.pause()}
            icon={<Pause aria-hidden className="size-4" />}
            data-testid="pause"
            aria-keyshortcuts="Alt+P"
          >
            Pause <Kbd>{PAUSE_KEY_LABEL}</Kbd>
          </Button>
        </div>
      </div>
      {wrap === "offered" && canWrap && (
        <Callout
          tone="info"
          title={`That's ${target} minutes. Wrap up with a quick sketch?`}
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => sessionRunner.wrapUp()}>
                Wrap up
              </Button>
              <Button size="sm" variant="ghost" onClick={() => sessionRunner.keepGoing()}>
                Keep going
              </Button>
            </>
          }
        >
          The lesson keeps your place and picks up there next time.
        </Callout>
      )}
      {keepalive && activeMs >= 120_000 && block !== "coda" && (
        <Callout
          tone="success"
          title="That counts for today"
          actions={
            <Button size="sm" variant="secondary" onClick={() => sessionRunner.toCoda()}>
              Stop here
            </Button>
          }
        >
          Finish the set if you like, or stop here.
        </Callout>
      )}
    </div>
  );
}

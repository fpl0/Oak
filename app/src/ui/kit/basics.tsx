// Small presentational pieces of the UI kit: Card, Chip, Kbd, EmptyState, Skeleton, Progress, StepRail.
import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className,
  interactive,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-card border border-border bg-surface shadow-card",
        interactive && "transition-colors hover:border-text-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  action,
  sub,
}: {
  title: ReactNode;
  action?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4">
      <div className="min-w-0">
        <h3 className="text-h3">{title}</h3>
        {sub && <p className="mt-0.5 text-sm text-text-2">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export type ChipTone = "neutral" | "accent" | "amber" | "issue" | "danger";
const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-text-2 border-border",
  accent: "bg-lane-in text-accent border-accent/40",
  amber: "bg-accent-2/12 text-text border-accent-2/50",
  issue: "bg-issue/10 text-issue border-issue/40",
  danger: "bg-danger/10 text-danger border-danger/40",
};

export function Chip({
  tone = "neutral",
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-sm leading-none",
        CHIP_TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * A key cap. `inverse` sits on the tooltip's dark fill; `onAccent` sits inside a primary button (the "⏎" of Start
 * and Done for today) at the button's own text colour, which keeps 12 px text AA on the accent in both themes.
 */
export function Kbd({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "inverse" | "onAccent";
}) {
  return (
    <kbd
      className={clsx(
        "inline-flex min-w-5 items-center justify-center rounded border px-1 font-mono text-[0.75rem] leading-5",
        tone === "default" && "border-border bg-surface-2 text-text-2",
        tone === "inverse" && "border-bg/30 text-bg/80",
        tone === "onAccent" && "border-on-accent/40 text-on-accent",
      )}
    >
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-text-3 [&_svg]:size-8">{icon}</div>}
      <h2 className="text-h3">{title}</h2>
      {children && <div className="max-w-[46ch] text-text-2">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <div aria-hidden={label ? undefined : true} className={clsx("skeleton rounded-control", className)} />
  );
}

export function Progress({
  value,
  max = 1,
  label,
  className,
  tone = "accent",
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
  tone?: "accent" | "amber";
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={clsx(
          "h-full rounded-full transition-[width] duration-300",
          tone === "accent" ? "bg-accent" : "bg-accent-2",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export interface RailStep {
  id: string;
  label: string;
  /** `skipped`: set up later, or passed over in Quiet mode (drawn like `optional`, read "skipped"). */
  state: "done" | "current" | "todo" | "optional" | "skipped";
  /** The current step's own part ("2 of 3: a quiet moment"), shown after its name in the position text. */
  sub?: string;
}

const RAIL_WORD: Record<RailStep["state"], string> = {
  done: "done",
  current: "current",
  todo: "to do",
  optional: "optional",
  skipped: "skipped",
};

/** "Step 8 of 13 · Microphone · 2 of 3: a quiet moment" for the current step; null when none is current. */
export function railPositionText(steps: readonly RailStep[]): string | null {
  const i = steps.findIndex((s) => s.state === "current");
  const cur = steps[i];
  if (cur === undefined) return null;
  return `Step ${i + 1} of ${steps.length} · ${cur.label}${cur.sub ? ` · ${cur.sub}` : ""}`;
}

/**
 * The lesson step rail (ux §7.9: a `list` with `aria-current="step"`). `position` adds the visible "Step N of M ·
 * name" (onboarding, docs/design/retry.md §6.1); `onVisit` makes done and skipped dots buttons that open that step.
 */
export function StepRail({
  steps,
  label = "Steps",
  position = false,
  onVisit,
}: {
  steps: RailStep[];
  label?: string;
  position?: boolean;
  onVisit?: ((id: string) => void) | null;
}) {
  const text = position ? railPositionText(steps) : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {text && (
        <p className="truncate text-sm text-text-2" data-testid="rail-position">
          {text}
        </p>
      )}
      <ol aria-label={label} className="flex shrink-0 items-center gap-1.5">
        {steps.map((s, i) => {
          const name = `${i + 1}. ${s.label} (${RAIL_WORD[s.state]})`;
          const dot = (
            <span
              aria-hidden
              className={clsx(
                "block h-2 rounded-full transition-all reduced:transition-none",
                s.state === "current" ? "w-6 bg-accent" : "w-2",
                s.state === "done" && "bg-accent/60",
                s.state === "todo" && "bg-border",
                (s.state === "optional" || s.state === "skipped") && "border border-dashed border-text-3",
              )}
            />
          );
          const visitable = onVisit && (s.state === "done" || s.state === "skipped");
          return (
            <li
              key={s.id}
              aria-current={s.state === "current" ? "step" : undefined}
              title={`${i + 1}. ${s.label}`}
              className="flex items-center"
            >
              {visitable ? (
                <button
                  type="button"
                  onClick={() => onVisit(s.id)}
                  aria-label={`Go back to ${name}`}
                  className="-m-1.5 flex items-center rounded-full p-1.5 hover:bg-surface-2"
                  data-rail-step={s.id}
                >
                  {dot}
                </button>
              ) : (
                <>
                  <span className="sr-only">{name}</span>
                  {dot}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1">{title}</h1>
        {sub && <p className="mt-1 text-text-2">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A page column on the shared widths (tokens.css `--oak-page-*`): `wide` for most pages, `focus` for a guided
 * flow that keeps one width across its screens (onboarding, voice setup), `narrow` for forms and reading.
 */
export function Page({
  children,
  width = "wide",
  className,
}: {
  children: ReactNode;
  width?: "wide" | "focus" | "narrow" | "full";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "mx-auto w-full px-6 py-6",
        width === "wide" && "max-w-page",
        width === "focus" && "max-w-page-focus",
        width === "narrow" && "max-w-page-narrow",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A clearly marked placeholder for a screen whose interactive part arrives in Wave 2. */
export function WavePlaceholder({ feature, children }: { feature: string; children?: ReactNode }) {
  return (
    <section
      aria-label={`${feature} (coming in Wave 2)`}
      data-placeholder="wave-2"
      className="rounded-card border border-dashed border-text-3 bg-lane-in p-4"
    >
      <p className="text-sm font-medium text-text-2">
        <span className="mr-2 rounded bg-accent-2/20 px-1.5 py-0.5 text-text">Wave 2</span>
        {feature} is built in the next wave. The data below is live.
      </p>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}

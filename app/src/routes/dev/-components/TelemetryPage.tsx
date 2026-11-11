// /dev/telemetry (OAK_DEV=1, contracts §9.7): real step and lesson durations against the authored and scaled
// estimates (flag over 1.15×), the rolling multiplier against its 1.25–1.55 band, warm-up minutes per day
// against the plan, the review-load forecast, and the median session length against its target. Local only.
import type { TelemetryReport } from "@oak/api";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useContent } from "../../../lib/content.ts";
import { lessonTitles } from "../../../lib/content-model.ts";
import { usePageTitle } from "../../../lib/nav.ts";
import { useDevTelemetry } from "../../../lib/queries.ts";
import { Card, Chip, EmptyState, Page, PageHeader } from "../../../ui/kit/basics.tsx";
import { QueryView } from "../../../ui/kit/QueryState.tsx";
import {
  fmtMin,
  forecastBars,
  type LessonRow,
  lessonRows,
  MULTIPLIER_BAND,
  multiplierVerdict,
  OVER_BUDGET,
  sessionLengths,
  warmupByDay,
} from "../-lib/telemetry.ts";
import { Bars } from "./Bars.tsx";
import { DevGate } from "./DevGate.tsx";

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "warn" | undefined;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-sm text-text-2">{label}</p>
      <p className={clsx("text-h2 tabular-nums", tone === "warn" && "text-accent-2")}>{value}</p>
      <p className="text-sm text-text-2">{note}</p>
    </Card>
  );
}

function LessonTable({ rows, titles }: { rows: LessonRow[]; titles: Map<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm" data-testid="lesson-timings">
        <caption className="sr-only">Lesson time against the authored and scaled estimates</caption>
        <thead className="bg-surface-2 text-left text-text-2">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Lesson
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Authored
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Budget (scaled)
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Actual
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Actual ÷ budget
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((r) => {
            const expanded = open === r.lessonId;
            return [
              <tr key={r.lessonId} data-lesson={r.lessonId} data-over={r.over || undefined}>
                <td className="px-3 py-1.5">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : r.lessonId)}
                    className="inline-flex items-center gap-1.5 text-left hover:underline"
                  >
                    {expanded ? (
                      <ChevronDown aria-hidden className="size-4" />
                    ) : (
                      <ChevronRight aria-hidden className="size-4" />
                    )}
                    <span className="font-mono text-text-3">{r.lessonId}</span> {titles.get(r.lessonId) ?? ""}
                    <span className="text-text-3">· {r.steps.length} steps</span>
                  </button>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMin(r.authoredMin)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMin(r.scaledMin)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtMin(r.actualMin)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.ratio === null ? "–" : `${r.ratio.toFixed(2)}×`}
                  {r.over && (
                    <Chip tone="amber" className="ml-2">
                      over {OVER_BUDGET}×
                    </Chip>
                  )}
                </td>
              </tr>,
              expanded && (
                <tr key={`${r.lessonId}-steps`}>
                  <td colSpan={5} className="bg-surface-2 px-3 py-2">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Steps of {r.lessonId}</caption>
                      <thead className="text-left text-text-2">
                        <tr>
                          <th scope="col" className="py-1 font-medium">
                            Step
                          </th>
                          <th scope="col" className="py-1 font-medium">
                            Kind
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Authored
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Budget
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Actual
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Runs
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Attempts
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Hint rung
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Tutor
                          </th>
                          <th scope="col" className="py-1 text-right font-medium">
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.steps.map((s) => (
                          <tr key={s.stepId} data-step={s.stepId}>
                            <td className="py-0.5 font-mono">{s.stepId}</td>
                            <td className="py-0.5">{s.stepKind}</td>
                            <td className="py-0.5 text-right tabular-nums">{fmtMin(s.authoredMin)}</td>
                            <td className="py-0.5 text-right tabular-nums">{fmtMin(s.scaledMin)}</td>
                            <td
                              className={clsx(
                                "py-0.5 text-right tabular-nums",
                                s.scaledMin > 0 &&
                                  s.actualMin > s.scaledMin * OVER_BUDGET &&
                                  "font-semibold text-accent-2",
                              )}
                            >
                              {fmtMin(s.actualMin)}
                            </td>
                            <td className="py-0.5 text-right tabular-nums">{s.runs}</td>
                            <td className="py-0.5 text-right tabular-nums">{s.attempts}</td>
                            <td className="py-0.5 text-right tabular-nums">{s.maxHintRung}</td>
                            <td className="py-0.5 text-right tabular-nums">{s.tutorMessages}</td>
                            <td className="py-0.5 text-right">
                              {s.skipped ? "skipped" : s.passed ? "passed" : "not passed"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function Report({ report }: { report: TelemetryReport }) {
  const content = useContent();
  const titles = lessonTitles(content.data?.syllabus ?? null);
  const lessons = lessonRows(report.steps);
  const warm = warmupByDay(report.sessions).slice(-14);
  const lengths = sessionLengths(report.sessions);
  const forecast = forecastBars(report);
  const verdict = multiplierVerdict(report.rollingMultiplier);
  const over = lessons.filter((l) => l.over).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Rolling multiplier (last 10 lessons)"
          value={report.rollingMultiplier === null ? "–" : `${report.rollingMultiplier.toFixed(2)}×`}
          tone={verdict === "low" || verdict === "high" ? "warn" : undefined}
          note={
            verdict === "none"
              ? "Needs finished lessons with step timings."
              : verdict === "ok"
                ? `Inside ${MULTIPLIER_BAND[0]}–${MULTIPLIER_BAND[1]}: BEGINNER_FACTOR fits.`
                : `Outside ${MULTIPLIER_BAND[0]}–${MULTIPLIER_BAND[1]}: revisit BEGINNER_FACTOR (1.4).`
          }
        />
        <Stat
          label="Median session"
          value={fmtMin(lengths.all.medianMin)}
          tone={lengths.all.ratio !== null && lengths.all.ratio > OVER_BUDGET ? "warn" : undefined}
          note={
            lengths.all.sessions === 0
              ? "No sessions finished yet."
              : `Target ${lengths.all.target} min over ${lengths.all.sessions} sessions${lengths.byTarget.length > 1 ? `; ${lengths.byTarget.map((t) => `${t.target}: ${fmtMin(t.medianMin)}`).join(", ")}` : ""}.`
          }
        />
        <Stat
          label="Reviews due today"
          value={fmtMin(forecast[0]?.min ?? null)}
          note={
            forecast.length > 1
              ? `${fmtMin(forecast.slice(1).reduce((a, b) => a + b.min, 0))} more over the next ${forecast.length - 1} days.`
              : "No forecast yet."
          }
        />
        <Stat
          label="Tutor prompt cache"
          value={`${Math.round(report.tutor.cacheHitRatio * 100)}%`}
          note={
            report.tutor.costUsd > 0
              ? `$${report.tutor.costUsd.toFixed(2)} this month.`
              : "No API cost this month."
          }
        />
      </div>

      <section aria-labelledby="t-lessons" className="flex flex-col gap-2">
        <h2 id="t-lessons" className="text-h3">
          Lessons: actual time against the budget
        </h2>
        <p className="text-sm text-text-2">
          Budget = authored minutes scaled for a beginner. Active time only (idle over 60 s removed).{" "}
          {over > 0
            ? `${over} ${over === 1 ? "lesson runs" : "lessons run"} over ${OVER_BUDGET}×.`
            : "None over budget."}
        </p>
        {lessons.length === 0 ? (
          <EmptyState title="No step timings yet">Finish a lesson step and its time shows here.</EmptyState>
        ) : (
          <LessonTable rows={lessons} titles={titles} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="t-warm" className="flex flex-col gap-2">
          <h2 id="t-warm" className="text-h3">
            Warm-up minutes per day
          </h2>
          <p className="text-sm text-text-2">Bars are minutes spent; the tick is the planned warm-up.</p>
          {warm.length === 0 ? (
            <p className="text-sm text-text-2">No sessions yet.</p>
          ) : (
            <Bars
              title="Warm-up minutes per day"
              unit="min"
              bars={warm.map((d) => ({
                key: d.day,
                label: d.day.slice(5),
                value: d.actualMin,
                ref: d.plannedMin,
                over: d.overflowMin > 0,
              }))}
            />
          )}
        </section>
        <section aria-labelledby="t-forecast" className="flex flex-col gap-2">
          <h2 id="t-forecast" className="text-h3">
            Review load, next days
          </h2>
          <p className="text-sm text-text-2">Minutes of reviews falling due each day, today first.</p>
          {forecast.length === 0 ? (
            <p className="text-sm text-text-2">The scheduler has no forecast yet.</p>
          ) : (
            <Bars
              title="Review load forecast"
              unit="min"
              bars={forecast.map((f) => ({
                key: String(f.day),
                label: f.day === 0 ? "today" : `+${f.day}`,
                value: f.min,
              }))}
            />
          )}
        </section>
      </div>

      <section aria-labelledby="t-sessions" className="flex flex-col gap-2">
        <h2 id="t-sessions" className="text-h3">
          Sessions
        </h2>
        {report.sessions.length === 0 ? (
          <p className="text-sm text-text-2">No sessions finished yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm" data-testid="session-timings">
              <caption className="sr-only">Finished sessions, newest first</caption>
              <thead className="bg-surface-2 text-left text-text-2">
                <tr>
                  {[
                    "Day",
                    "Kind",
                    "Target",
                    "Active",
                    "Warm-up",
                    "New",
                    "Make",
                    "Coda",
                    "Overflow",
                    "Wrapped early",
                  ].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {report.sessions.map((s) => {
                  const active = s.totalActiveMs / 60_000;
                  return (
                    <tr key={s.sessionId}>
                      <td className="px-3 py-1.5 tabular-nums">{s.day}</td>
                      <td className="px-3 py-1.5">{s.kind}</td>
                      <td className="px-3 py-1.5 tabular-nums">{s.targetMinutes} min</td>
                      <td
                        className={clsx(
                          "px-3 py-1.5 tabular-nums",
                          active > Number(s.targetMinutes) * OVER_BUDGET && "font-semibold text-accent-2",
                        )}
                      >
                        {fmtMin(active)}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtMin(s.warmupMs / 60_000)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtMin(s.newMs / 60_000)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtMin(s.makeMs / 60_000)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtMin(s.codaMs / 60_000)}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {s.overflowSec > 0 ? fmtMin(s.overflowSec / 60) : "–"}
                      </td>
                      <td className="px-3 py-1.5">{s.wrappedEarly ? "yes" : "no"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function TelemetryPage() {
  usePageTitle("Timing");
  return (
    <DevGate>
      <TelemetryBody />
    </DevGate>
  );
}

function TelemetryBody() {
  const report = useDevTelemetry();
  return (
    <Page width="full" className="max-w-[1400px]">
      <PageHeader title="Timing" sub="Developer view. Local only: nothing here leaves this computer." />
      <QueryView query={report}>{(r) => <Report report={r} />}</QueryView>
    </Page>
  );
}

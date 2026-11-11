// /dev/telemetry (OAK_DEV=1): the timing report of contracts §9 (step and session telemetry, the rolling
// multiplier, the due-load forecast, tutor cache and cost). A shell over `GET /api/dev/telemetry`.
import type { TelemetryReport } from "@oak/api";
import { useEffect, useState } from "react";
import { callApi } from "../../../lib/api.ts";

export function TelemetryPage() {
  const [report, setReport] = useState<TelemetryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    callApi("dev.telemetry").then(setReport, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  return (
    <div className="oak-dev-page">
      <h1>Telemetry</h1>
      {error ? (
        <p className="oak-muted">Not available: {error} (is the server running with OAK_DEV=1?)</p>
      ) : null}
      {!report && !error ? <p className="oak-muted">Loading…</p> : null}
      {report ? (
        <>
          <p>
            Rolling multiplier:{" "}
            <strong>
              {report.rollingMultiplier === null ? "not enough data" : report.rollingMultiplier.toFixed(2)}
            </strong>
            {report.rollingMultiplier !== null &&
            (report.rollingMultiplier < 1.25 || report.rollingMultiplier > 1.55)
              ? " (outside 1.25–1.55: revisit the 1.4 factor)"
              : ""}
          </p>
          <p>
            Tutor cache hit ratio {(report.tutor.cacheHitRatio * 100).toFixed(0)}% · cost $
            {report.tutor.costUsd.toFixed(2)} · due forecast{" "}
            {report.forecastSec.map((s) => Math.round(s / 60)).join(", ")} min
          </p>
          <h2>Steps ({report.steps.length})</h2>
          <table className="oak-notes-table">
            <thead>
              <tr>
                <th>Lesson</th>
                <th>Step</th>
                <th>Kind</th>
                <th>Authored</th>
                <th>Active</th>
                <th>Attempts</th>
                <th>Hint</th>
                <th>Passed</th>
              </tr>
            </thead>
            <tbody>
              {report.steps.map((s, i) => (
                <tr key={`${s.lessonId}-${s.stepId}-${i}`}>
                  <td>{s.lessonId}</td>
                  <td>{s.stepId}</td>
                  <td>{s.stepKind}</td>
                  <td>{s.authoredMinutes}</td>
                  <td>{(s.activeMs / 60000).toFixed(1)} min</td>
                  <td>{s.attempts}</td>
                  <td>{s.maxHintRung}</td>
                  <td>{s.passed ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Sessions ({report.sessions.length})</h2>
          <table className="oak-notes-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Kind</th>
                <th>Target</th>
                <th>Active</th>
                <th>Warm-up</th>
                <th>New</th>
                <th>Make</th>
                <th>Split</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>{s.day}</td>
                  <td>{s.kind}</td>
                  <td>{s.targetMinutes}</td>
                  <td>{(s.totalActiveMs / 60000).toFixed(1)} min</td>
                  <td>{(s.warmupMs / 60000).toFixed(1)}</td>
                  <td>{(s.newMs / 60000).toFixed(1)}</td>
                  <td>{(s.makeMs / 60000).toFixed(1)}</td>
                  <td>{s.split ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}

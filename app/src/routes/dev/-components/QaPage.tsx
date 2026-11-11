// /dev/qa (OAK_DEV=1): the "Report a grading problem" queue (contracts §11.8). A shell over
// `GET /api/dev/qa` and `PATCH /api/dev/qa/:id` (triage status).
import type { QaReport } from "@oak/api";
import { useEffect, useState } from "react";
import { callApi } from "../../../lib/api.ts";

const STATUSES = ["open", "triaged", "fixed", "wontfix"] as const;

export function QaPage() {
  const [reports, setReports] = useState<QaReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof STATUSES)[number] | "all">("open");
  useEffect(() => {
    callApi("dev.qa").then(
      (r) => setReports(r.items),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  const setStatus = async (id: number, status: (typeof STATUSES)[number]) => {
    try {
      const next = await callApi("dev.qaUpdate", { params: { id: String(id) }, body: { status } } as never);
      setReports((all) => all?.map((r) => (r.id === id ? next : r)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const shown = (reports ?? []).filter((r) => filter === "all" || r.status === filter);
  return (
    <div className="oak-dev-page">
      <h1>Grading problems</h1>
      {error ? (
        <p className="oak-muted">Not available: {error} (is the server running with OAK_DEV=1?)</p>
      ) : null}
      <label>
        Show{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">all</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {reports && shown.length === 0 ? <p className="oak-muted">Nothing in this queue.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((r) => (
          <li key={r.id} style={{ border: "1px solid var(--oak-border)", borderRadius: 6, padding: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>#{r.id}</strong>
              <span>{r.kind}</span>
              <span>{r.exerciseId ?? r.familyId ?? r.lessonId ?? "—"}</span>
              <span className="oak-muted">{r.at}</span>
              <span className="oak-muted">rung {r.hintRung}</span>
              <select
                value={r.status}
                onChange={(e) => void setStatus(r.id, e.target.value as (typeof STATUSES)[number])}
                aria-label={`Status of #${r.id}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {r.note ? <p>{r.note}</p> : null}
            {typeof r.response === "string" ? (
              <pre style={{ whiteSpace: "pre-wrap" }}>{r.response}</pre>
            ) : null}
            {r.gradeResult ? (
              <details>
                <summary>
                  Grade: {r.gradeResult.status} · {Math.round(r.gradeResult.score * 100)}% ·{" "}
                  {r.gradeResult.diagnostics.length} findings
                </summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(r.gradeResult.diagnostics, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

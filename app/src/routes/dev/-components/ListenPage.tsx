// /dev/listen (architecture §3.8): every code example with a play button, the selected one shown in a
// read-only workbench (code, roll and staff side by side), verdict buttons with a note, filters by unit and
// by "needs a listen" (unmarked or changed since its verdict), auto-advance, and an export of the verdicts.
import type { LessonDef, LintContext, UnlockableId } from "@oak/content-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { toolbox } from "../../../../../content/toolbox.ts";
import { ServicesGate } from "../../../workbench/ServicesGate.tsx";
import { Workbench } from "../../../workbench/Workbench.tsx";
import { appWorkbenchServices } from "../-lib/app-services.ts";
import {
  exportMarks,
  filterExamples,
  fromGenerated,
  fromLessons,
  type ListenExample,
  type ListenMark,
  type ListenStore,
  localListenStore,
  statusOf,
  VERDICT_LABEL,
  VERDICTS,
  type Verdict,
} from "../-lib/listen.ts";

const generated = import.meta.glob<unknown>("../../../../../content/.generated/examples.json", {
  import: "default",
});
const lessonFiles = import.meta.glob<LessonDef>("../../../../../content/core/**/lesson.ts", {
  import: "default",
});

async function loadExamples(): Promise<{ examples: ListenExample[]; source: "generated" | "lessons" }> {
  const gen = Object.values(generated)[0];
  if (gen) {
    const examples = fromGenerated(await gen());
    if (examples.length > 0) return { examples, source: "generated" };
  }
  const lessons: LessonDef[] = [];
  for (const load of Object.values(lessonFiles)) {
    try {
      lessons.push(await load());
    } catch (e) {
      console.warn("oak: a lesson failed to load", e);
    }
  }
  return { examples: fromLessons(lessons), source: "lessons" };
}

const ALL_UNLOCKED: ReadonlySet<UnlockableId> = new Set(toolbox.map((t) => t.id as UnlockableId));

function storeFor(): ListenStore {
  try {
    return localListenStore(window.localStorage);
  } catch {
    const mem = new Map<string, string>();
    return localListenStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
  }
}

export function ListenPage() {
  return (
    <div className="oak-dev-page" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1>Listen QA</h1>
      <ServicesGate load={appWorkbenchServices}>
        <ListenBody />
      </ServicesGate>
    </div>
  );
}

function ListenBody() {
  const store = useMemo(storeFor, []);
  const [examples, setExamples] = useState<ListenExample[] | null>(null);
  const [source, setSource] = useState<"generated" | "lessons">("lessons");
  const [marks, setMarks] = useState<Record<string, ListenMark>>({});
  const [unit, setUnit] = useState<string | null>(null);
  const [needsListen, setNeedsListen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [note, setNote] = useState("");
  const [cps, setCps] = useState(0.5);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadExamples().then((r) => {
      setExamples(r.examples);
      setSource(r.source);
    });
    void store.load().then(setMarks);
  }, [store]);

  const list = useMemo(
    () => filterExamples(examples ?? [], marks, { unit, needsListen }),
    [examples, marks, unit, needsListen],
  );
  const units = useMemo(() => [...new Set((examples ?? []).map((e) => e.unit))].sort(), [examples]);
  const current = list.find((e) => e.ref === selected) ?? null;

  const play = (ref: string) => {
    setSelected(ref);
    setAutoPlay(true);
    setNote(marks[ref]?.note ?? "");
  };

  // Auto-advance after the example's bars.
  useEffect(() => {
    if (advance.current) clearTimeout(advance.current);
    if (!autoAdvance || !current || !autoPlay) return;
    advance.current = setTimeout(
      () => {
        const i = list.findIndex((e) => e.ref === current.ref);
        const next = list[i + 1];
        if (next) play(next.ref);
      },
      (current.bars / Math.max(0.05, cps)) * 1000 + 400,
    );
    return () => {
      if (advance.current) clearTimeout(advance.current);
    };
    // Restarts only when the example or the tempo changes.
  }, [autoAdvance, current?.ref, autoPlay, cps]);

  const mark = async (verdict: Verdict) => {
    if (!current) return;
    const m: ListenMark = {
      ref: current.ref,
      hash: current.hash,
      verdict,
      note,
      at: new Date().toISOString(),
    };
    await store.save(m);
    setMarks((all) => ({ ...all, [m.ref]: m }));
  };

  const download = () => {
    const blob = new Blob([exportMarks(marks)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "listen-log.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!examples) return <p className="oak-muted">Loading examples…</p>;

  const lint = (e: ListenExample): LintContext => ({
    profile: "content",
    unlocked: ALL_UNLOCKED,
    allowPreview: true,
    meter: e.meter,
    key: e.key,
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 2fr)", gap: 16 }}>
      <aside>
        <p className="oak-muted">
          {examples.length} examples from{" "}
          {source === "generated" ? "content/.generated/examples.json" : "the lesson files"} · verdicts in{" "}
          {store.kind === "local" ? "this browser (export to keep them)" : "the server"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={unit ?? ""} onChange={(e) => setUnit(e.target.value || null)} aria-label="Unit">
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <label>
            <input type="checkbox" checked={needsListen} onChange={(e) => setNeedsListen(e.target.checked)} />{" "}
            needs a listen
          </label>
          <label>
            <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />{" "}
            auto-advance
          </label>
          <button type="button" onClick={download}>
            Export verdicts
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0 }} data-testid="listen-list">
          {list.map((e) => {
            const st = statusOf(e, marks[e.ref]);
            return (
              <li
                key={e.ref}
                style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}
                data-status={st}
              >
                <button type="button" onClick={() => play(e.ref)} aria-label={`Play ${e.ref}`}>
                  ▶
                </button>
                <button
                  type="button"
                  className="oak-link-button"
                  onClick={() => setSelected(e.ref)}
                  aria-current={e.ref === selected}
                >
                  {e.ref}
                </button>
                <span className="oak-badge">
                  {st === "flagged" ? VERDICT_LABEL[marks[e.ref]?.verdict ?? "ok"] : st}
                </span>
              </li>
            );
          })}
        </ul>
        {list.length === 0 ? <p className="oak-muted">Nothing here: no examples match the filter.</p> : null}
      </aside>
      <section>
        {current ? (
          <>
            <Workbench
              key={current.ref}
              id="dev-listen"
              code={current.code}
              lessonCtx={{ key: current.key, meter: current.meter, defaultBpm: 90, loopBars: current.bars }}
              lint={lint(current)}
              views={["roll", "staff"]}
              readOnly
              variant="compact"
              autoPlay={autoPlay}
              onModel={(m) => setCps(m.cps)}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {VERDICTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void mark(v)}
                  aria-pressed={
                    marks[current.ref]?.verdict === v && marks[current.ref]?.hash === current.hash
                  }
                >
                  {VERDICT_LABEL[v]}
                </button>
              ))}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
                aria-label="Note"
                style={{ flex: 1, minWidth: 160 }}
              />
            </div>
          </>
        ) : (
          <p className="oak-muted">Pick an example.</p>
        )}
      </section>
    </div>
  );
}

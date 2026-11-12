// The /dev/workbench playground (also the e2e page): example patterns including a full 4-track loop, the
// view switches, read-only and Band-layer modes, and a feedback demo (the grader's `compare` against a
// target, with the hint ladder, A/B and ghost notes). Needs a <WorkbenchServicesProvider> above it.

import type { LensId, LensPrefs } from "@oak/api";
import type { GradeResult, HintRung, LintContext, UnlockableId } from "@oak/content-kit";
import type { BandSetup } from "@oak/strudel";
import { useEffect, useMemo, useReducer, useState } from "react";
import { bandCodeAt, bands } from "../../../../content/bands/index.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { PLAYGROUND_EXAMPLES } from "../examples.ts";
import { ladderReducer } from "../feedback.ts";
import { type LensSource, WorkbenchLensProvider } from "../lens-source.tsx";
import type { WorkbenchModel } from "../model.ts";
import type { RollColorMode, RollLabelMode } from "../PianoRoll.tsx";
import { useWorkbenchServices } from "../services.tsx";
import type { MusicView } from "../views.ts";
import { Workbench } from "../Workbench.tsx";

const ALL_UNLOCKED: ReadonlySet<UnlockableId> = new Set(toolbox.map((t) => t.id as UnlockableId));

/**
 * The first Band in the pop flavour at its latest stage (contracts §5.10), in the example's key. Band code
 * carries no tempo line (it shares the session's).
 */
function bandFor(keyText: string): BandSetup | null {
  const def = bands[0];
  const code = def ? bandCodeAt(def, "flavour.pop", () => true) : "";
  if (!def || !code) return null;
  return {
    band: def.id,
    flavour: "flavour.pop",
    code: code.replaceAll("{{key}}", keyText),
    followsLearnerKey: true,
    tracks: ["drums", "bass", "chords"],
  };
}

export function Playground() {
  const { grader } = useWorkbenchServices();
  const params =
    typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const [exampleId, setExampleId] = useState(params.get("example") ?? "full-loop");
  const example =
    PLAYGROUND_EXAMPLES.find((e) => e.id === exampleId) ??
    (PLAYGROUND_EXAMPLES[0] as (typeof PLAYGROUND_EXAMPLES)[number]);
  const [views, setViews] = useState<MusicView[]>(["roll", "staff", "keyboard"]);
  const [early, setEarly] = useState(false);
  const [color, setColor] = useState<RollColorMode>("degree");
  const [labels, setLabels] = useState<RollLabelMode>("degree");
  const [readOnly, setReadOnly] = useState(false);
  const [withBand, setWithBand] = useState(false);
  const [narrow, setNarrow] = useState(params.get("narrow") === "1");
  const [feedbackOn, setFeedbackOn] = useState(params.get("feedback") === "1");
  const [ladder, dispatch] = useReducer(ladderReducer, {
    rung: Number(params.get("rung") ?? 0) as HintRung,
    pending: false,
  });
  const [learner, setLearner] = useState<WorkbenchModel | null>(null);
  // Wave 3: the lenses as the app has them (all unlocked here), instead of the fixed colour and label choice.
  const [lensMode, setLensMode] = useState(params.get("lenses") === "1");
  const [prefs, setPrefs] = useState<LensPrefs>({ degrees: true, solfege: false, noteNames: false });
  const lensSource: LensSource = {
    shown: prefs,
    available: { degrees: true, solfege: true, noteNames: true },
    toggle: (id: LensId) => setPrefs((p) => ({ ...p, [id]: !p[id] })),
    rollSetting: "auto",
  };

  const lint: LintContext = useMemo(
    () => ({
      profile: "studio",
      unlocked: ALL_UNLOCKED,
      allowPreview: true,
      meter: example.meter,
      key: example.key,
    }),
    [example],
  );
  const lessonCtx = useMemo(
    () => ({ key: example.key, meter: example.meter, defaultBpm: 90, loopBars: example.bars }),
    [example],
  );
  const band = useMemo(
    () => (withBand ? bandFor(example.key ? `${example.key.tonic}4:${example.key.mode}` : "C4:major") : null),
    [withBand, example],
  );

  // The feedback demo: the grader's own `compare` (compare_haps, melody mode) of the learner's code
  // against the example's target, re-run whenever the learner's analysed code changes.
  const [result, setResult] = useState<GradeResult | null>(null);
  const learnerCode = learner?.code ?? null;
  useEffect(() => {
    setResult(null);
    if (!example.target || !feedbackOn || learnerCode === null) return;
    let live = true;
    void grader
      .compare({
        learnerCode,
        target: { kind: "code", code: example.target },
        fromBar: 1,
        bars: example.bars,
        mode: "melody",
        key: example.key,
        meter: example.meter,
        lint,
      })
      .then((r) => {
        if (live) setResult(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [grader, example, feedbackOn, learnerCode, lint]);

  const toggleView = (v: MusicView) =>
    setViews((vs) => (vs.includes(v) ? vs.filter((x) => x !== v) : [...vs, v]));

  return (
    <div className="oak-playground" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form
        className="oak-playground-controls"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}
        onSubmit={(e) => e.preventDefault()}
      >
        <label>
          Example{" "}
          <select
            value={example.id}
            onChange={(e) => setExampleId(e.target.value)}
            data-testid="example-select"
          >
            {PLAYGROUND_EXAMPLES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        {(["roll", "staff", "keyboard"] as const).map((v) => (
          <label key={v}>
            <input type="checkbox" checked={views.includes(v)} onChange={() => toggleView(v)} /> {v}
          </label>
        ))}
        <label title="U00–U04: at most two of roll, staff and keyboard">
          <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} /> early unit
        </label>
        <label>
          Colour{" "}
          <select value={color} onChange={(e) => setColor(e.target.value as RollColorMode)}>
            <option value="degree">degree</option>
            <option value="chordTone">chord tone</option>
            <option value="part">part</option>
            <option value="mono">mono</option>
          </select>
        </label>
        <label>
          Labels{" "}
          <select value={labels} onChange={(e) => setLabels(e.target.value as RollLabelMode)}>
            <option value="degree">degree</option>
            <option value="degree+solfege">degree + solfège</option>
            <option value="note">note</option>
            <option value="none">none</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={lensMode}
            onChange={(e) => setLensMode(e.target.checked)}
            data-testid="lens-mode"
          />{" "}
          lenses
        </label>
        <label>
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />{" "}
          read-only
        </label>
        <label>
          <input
            type="checkbox"
            checked={withBand}
            onChange={(e) => setWithBand(e.target.checked)}
            data-testid="band-toggle"
          />{" "}
          Band layer
        </label>
        <label>
          <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} /> narrow (700
          px)
        </label>
        <label>
          <input
            type="checkbox"
            checked={feedbackOn}
            onChange={(e) => setFeedbackOn(e.target.checked)}
            data-testid="feedback-toggle"
          />{" "}
          compare with target
        </label>
        {feedbackOn ? (
          <span>
            rung {ladder.rung}{" "}
            <button type="button" onClick={() => dispatch({ type: "reset" })}>
              reset
            </button>
          </span>
        ) : null}
      </form>
      <div style={narrow ? { width: 700, maxWidth: "100%" } : undefined}>
        <WorkbenchLensProvider value={lensSource}>
          <Workbench
            key={example.id}
            id={`dev-${example.id.replace(/[^a-z0-9]/g, "")}`}
            code={example.code}
            lessonCtx={lessonCtx}
            lint={lint}
            views={views}
            {...(early ? { unit: "U03" } : {})}
            {...(readOnly ? { readOnly: true as const } : {})}
            band={band}
            {...(lensMode
              ? { staff: { kind: "auto" as const } }
              : {
                  roll: { color, labels },
                  staff: {
                    kind: "auto" as const,
                    labels:
                      example.key && !example.code.includes("chords:")
                        ? ("degree" as const)
                        : ("none" as const),
                  },
                })}
            target={example.target ? { code: example.target, audible: "fromHint2" } : null}
            onModel={setLearner}
            {...(feedbackOn
              ? {
                  feedback: {
                    result,
                    rung: ladder.rung,
                    hintPending: ladder.pending,
                    ladder: [
                      { text: "Listen to the last beat of the bar." },
                      { text: "Compare the note on beat 4 with the target." },
                      { text: "It should be a degree lower: look for the dashed note." },
                      "auto",
                    ],
                    onRequestHint: () => {
                      dispatch({ type: "request" });
                      setTimeout(
                        () => dispatch({ type: "granted", rung: Math.min(4, ladder.rung + 1) as HintRung }),
                        50,
                      );
                    },
                  },
                }
              : {})}
          />
        </WorkbenchLensProvider>
      </div>
    </div>
  );
}

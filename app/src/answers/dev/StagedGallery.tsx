// The staged chord dictation in the gallery: live (a stand-in host that checks each stage against the loop's
// answer, counts replays and plays the loop or its bass) and in four fixed moments of the flow.
import type { DictationStage } from "@oak/api";
import { useRef, useState } from "react";
import { Button, Card, Chip } from "../../ui/kit/index.ts";
import { StagedDictation } from "../dictation/StagedDictation.tsx";
import {
  emptyStaged,
  type StagedFeedback,
  type StagedSpec,
  type StagedValue,
  stageEntries,
  stageWidget,
} from "../dictation/stages.ts";
import { appAudio } from "../env.tsx";
import { rnMidis } from "../harmony.ts";
import type { AnswerFeedback } from "../types.ts";
import { C_MAJOR, STAGED_ANSWER } from "./fixtures.ts";

export const STAGED_SPEC: StagedSpec = {
  stages: ["bass", "quality", "rn"],
  stageAnswers: {
    bass: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6", "7"], sequenceLen: 4, syllables: false },
    quality: { ui: "quality-pad", set: ["maj", "min", "dim"] },
    rn: { ui: "rn-palette", slots: 4, allow: ["triads"] },
  },
};
const PROMPT = "Four chords, one per bar. Bass first, then the qualities, then the numerals.";
const REPLAYS = 6;

/** The stand-in host's check of one stage: per-chord marks against the loop's answer. */
export function checkStage(stage: DictationStage, value: StagedValue): AnswerFeedback {
  const w = stageWidget(STAGED_SPEC, stage);
  const want = STAGED_ANSWER[stage as keyof typeof STAGED_ANSWER] ?? [];
  const got = w ? stageEntries(w, value[stage]) : [];
  const marks = want.map((e, i) => ({ part: i, ok: got[i] === e }));
  const ok = marks.filter((m) => m.ok).length / Math.max(1, want.length);
  return ok >= 0.8 ? { state: "correct", marks } : { state: "wrong", marks };
}

function withMessage(fb: AnswerFeedback, message: string): AnswerFeedback {
  return fb.state === "wrong" ? { ...fb, message } : fb;
}

function play(rns: readonly string[], bassOnly: boolean, timers: number[]) {
  const beat = 60 / 90;
  rns.forEach((rn, i) => {
    const m = rnMidis(rn, C_MAJOR);
    if (!m) return;
    const notes = bassOnly ? [(m[0] as number) - 12] : m;
    timers.push(window.setTimeout(() => appAudio.playNote(notes, { dur: beat * 3.6 }), i * 4 * beat * 1000));
  });
}

function LiveStaged() {
  const [value, setValue] = useState<StagedValue>(() => emptyStaged(STAGED_SPEC));
  const [feedback, setFeedback] = useState<StagedFeedback>({});
  const [left, setLeft] = useState(REPLAYS);
  const timers = useRef<number[]>([]);
  const listen = (bassOnly: boolean) => {
    if (left <= 0) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    play(STAGED_ANSWER.rn, bassOnly, timers.current);
    setLeft((n) => n - 1);
  };
  return (
    <div className="flex flex-col gap-3" data-live="staged">
      <StagedDictation
        spec={STAGED_SPEC}
        value={value}
        onChange={(v) => {
          setValue(v);
          // Editing a wrong stage clears its marks, as a host does.
          const next = { ...feedback };
          for (const s of STAGED_SPEC.stages)
            if (next[s]?.state === "wrong" && v[s] !== value[s]) delete next[s];
          setFeedback(next);
        }}
        onCheckStage={(stage) => {
          setFeedback((f) => ({ ...f, [stage]: { state: "pending" } }));
          window.setTimeout(() => setFeedback((f) => ({ ...f, [stage]: checkStage(stage, value) })), 250);
        }}
        onReveal={(stage) =>
          setFeedback((f) => {
            const before = f[stage];
            return {
              ...f,
              [stage]: {
                state: "revealed",
                correct: STAGED_ANSWER[stage as keyof typeof STAGED_ANSWER] ?? [],
                marks: before?.state === "wrong" ? (before.marks ?? []) : [],
              },
            };
          })
        }
        feedback={feedback}
        listen={{ replay: () => listen(false), bassOnly: () => listen(true), replaysLeft: left }}
        label={`${PROMPT} Your answer`}
        idBase="live-staged"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setValue(emptyStaged(STAGED_SPEC));
            setFeedback({});
            setLeft(REPLAYS);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

const MOMENTS: { id: string; title: string; value: StagedValue; feedback: StagedFeedback }[] = [
  { id: "start", title: "Start: the bass is open", value: emptyStaged(STAGED_SPEC), feedback: {} },
  {
    id: "bass-right",
    title: "Bass right, qualities open",
    value: { ...emptyStaged(STAGED_SPEC), bass: STAGED_ANSWER.bass, quality: ["maj", "maj", "", ""] },
    feedback: { bass: checkStage("bass", { bass: STAGED_ANSWER.bass }) },
  },
  {
    id: "shown-wrong",
    title: "Qualities shown, numerals not quite",
    value: { bass: STAGED_ANSWER.bass, quality: ["maj", "maj", "maj", "maj"], rn: ["I", "V", "VI", "IV"] },
    feedback: {
      bass: checkStage("bass", { bass: STAGED_ANSWER.bass }),
      quality: {
        state: "revealed",
        correct: STAGED_ANSWER.quality,
        marks: [
          { part: 0, ok: true },
          { part: 1, ok: true },
          { part: 2, ok: false },
          { part: 3, ok: true },
        ],
      },
      rn: withMessage(checkStage("rn", { rn: ["I", "V", "VI", "IV"] }), "Chord 3 is minor: vi, lower case."),
    },
  },
  {
    id: "done",
    title: "Every stage right",
    value: STAGED_ANSWER,
    feedback: {
      bass: checkStage("bass", STAGED_ANSWER),
      quality: checkStage("quality", STAGED_ANSWER),
      rn: checkStage("rn", STAGED_ANSWER),
    },
  },
];

export function StagedSection() {
  return (
    <section
      id="staged"
      aria-labelledby="staged-h"
      className="flex scroll-mt-4 flex-col gap-3"
      data-staged-gallery
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 id="staged-h" className="text-h3">
          Staged chord dictation
        </h2>
        <Chip>
          <code className="font-mono">dictation.stage-answers</code>
        </Chip>
      </header>
      <Card className="flex flex-col gap-3 p-4">
        <p className="font-medium">{PROMPT}</p>
        <LiveStaged />
      </Card>
      <div className="grid gap-3 xl:grid-cols-2">
        {MOMENTS.map((m) => (
          <Card key={m.id} className="flex min-w-0 flex-col gap-2 p-3" data-moment={m.id}>
            <span className="text-sm font-medium text-text-3">{m.title}</span>
            <StagedDictation
              spec={STAGED_SPEC}
              value={m.value}
              onChange={() => {}}
              onCheckStage={() => {}}
              feedback={m.feedback}
              label={`${PROMPT} (${m.title})`}
              idBase={`staged-${m.id}`}
            />
          </Card>
        ))}
      </div>
    </section>
  );
}

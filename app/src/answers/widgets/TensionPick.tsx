// The tension pick (Wave 7; J2.L03, `fam.jzz.tensions`): what a held melody note is over a chord. A `choice` whose
// options are content-kit `TENSION_OPTIONS` ids is drawn in groups (a chord tone; the natural tensions 9, 11, 13;
// the altered ones ♭9 ♯9 ♯11 ♭13; a clash), with the chord and the note it is about above them
// (`AnswerEnv.tension`) and "Hear them" (the host's, else the chord and the note on the piano). After a check
// (right) or a reveal, one sentence says what the note is over the chord, as a common choice and never a law;
// a wrong pick gets no such line, so the answer is not named before the reveal.
import type { Choice } from "@oak/api";
import { TENSION_OPTIONS } from "@oak/content-kit";
import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv } from "../env.tsx";
import { voiceChord } from "../harmony.ts";
import { jazzReading, noteMidi, styledSymbol, tensionOf } from "../jazz.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, digitOf, focusFirst, KeyHint, markOf, revealedOf, SubmitHint } from "../ui.tsx";
import { InlineMd, plainMd } from "./InlineMd.tsx";
import { PickCard, pickKeys } from "./W7Parts.tsx";

const IDS = new Set(TENSION_OPTIONS.map((o) => o.id));
/** Whether every option of a choice is a tension id (`TENSION_OPTIONS`). */
export function isTensionChoice(options: readonly { id: string }[]): boolean {
  return options.length >= 2 && options.every((o) => IDS.has(o.id));
}

const GROUPS: readonly { id: string; label: string; ids: readonly string[] }[] = [
  { id: "tone", label: "In the chord", ids: ["chord-tone"] },
  { id: "natural", label: "Tensions", ids: ["9", "11", "13"] },
  { id: "altered", label: "Altered tensions", ids: ["b9", "#9", "#11", "b13"] },
  { id: "clash", label: "Clash", ids: ["avoid"] },
];

export function TensionPickAnswer(p: AnswerWidgetProps<"choice">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const audio = env.audio ?? appAudio;
  const root = useRef<HTMLDivElement>(null);
  const t = env.tension;
  const correct = revealedOf<string[]>(feedback) ?? [];
  const chord = t ? jazzReading(t.chord) : null;
  const style = env.harmony?.chordStyle ?? "lead-sheet";
  const known = feedback.state === "correct" || feedback.state === "revealed";
  const fact = t && known ? tensionOf(t.note, t.chord)?.fact : null;
  const noteText = t
    ? t.note
        .replace(/-?\d+$/, "")
        .replace(/(?<=^[A-Ga-g])b/, "♭")
        .replace("#", "♯")
    : "";

  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);

  const pick = (id: string) => {
    if (!disabled) onChange([id]);
  };
  const hear = () => {
    if (!t) return;
    if (t.play) {
      t.play();
      return;
    }
    const m = noteMidi(t.note);
    if (chord?.state !== "ok" || m === null) return;
    audio.playNote([...voiceChord(chord.chord), m + (m < 72 ? 12 : 0)], {
      sound: env.harmony?.sound ?? "piano",
      dur: 1.6,
    });
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey) {
      hear();
      return true;
    }
    if (digitOf(e) !== null && e.shiftKey) return false;
    return pickKeys(e, root.current, ids, pick);
  };
  const groups = GROUPS.map((g) => ({
    ...g,
    options: g.ids.flatMap((id) => spec.options.filter((o) => o.id === id)),
  })).filter((g) => g.options.length > 0);
  // Options outside the known groups keep their authored place at the end.
  const rest = spec.options.filter((o) => !GROUPS.some((g) => g.ids.includes(o.id)));
  // Digits and arrows follow the order on screen (the groups, then anything else), not the authored order.
  const ids = [...groups.flatMap((g) => g.options), ...rest].map((o) => o.id);
  const indexOf = (o: Choice) => ids.indexOf(o.id) + 1;
  const tabStop = value[0] ?? ids[0];

  const card = (o: Choice) => {
    const mark = markOf(feedback, o.id);
    return (
      <PickCard
        key={o.id}
        id={o.id}
        checked={value.includes(o.id)}
        disabled={disabled}
        isAnswer={correct.includes(o.id)}
        mark={mark ? (mark.ok ? "ok" : "bad") : null}
        note={mark?.note}
        tabStop={o.id === tabStop}
        label={`${indexOf(o)}. ${plainMd(o.label)}`}
        onPick={() => pick(o.id)}
        className="min-h-10 items-center gap-2 px-2.5 py-1.5 text-sm"
      >
        <span aria-hidden className="font-mono text-[0.75rem] text-text-3">
          {indexOf(o)}
        </span>
        <span className="font-medium text-text">
          <InlineMd text={o.label} />
        </span>
      </PickCard>
    );
  };

  return (
    <AnswerFrame
      kind="choice"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={[`1–${ids.length}`]}>pick</KeyHint>
          {t ? <KeyHint keys={["P"]}>hear them</KeyHint> : null}
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className="flex flex-col gap-3" data-tension-pick>
        {t ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-base text-text" data-testid="tension-about">
              Over{" "}
              <span className="rounded-control bg-surface-2 px-1.5 py-0.5 font-semibold">
                {chord?.state === "ok" ? styledSymbol(chord.chord, style) : t.chord}
              </span>{" "}
              the melody holds{" "}
              <span className="rounded-control bg-surface-2 px-1.5 py-0.5 font-semibold">{noteText}</span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              data-enter="native"
              icon={<Play aria-hidden className="size-4" />}
              onClick={hear}
            >
              Hear them
            </Button>
          </div>
        ) : null}
        <div role="radiogroup" aria-label={p.label} className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-start gap-1.5">
              <span className="w-32 shrink-0 pt-2.5 text-[0.8125rem] text-text-3">{g.label}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">{g.options.map(card)}</span>
            </div>
          ))}
          {rest.length > 0 ? <div className="flex flex-wrap gap-1.5">{rest.map(card)}</div> : null}
        </div>
        <p className="min-h-6 text-sm text-text-2" data-testid="tension-fact" aria-live="polite">
          {fact ?? ""}
        </p>
      </div>
    </AnswerFrame>
  );
}

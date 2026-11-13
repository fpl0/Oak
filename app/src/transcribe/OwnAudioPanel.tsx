// The learner's own recording beside the Workbench (contracts §6.12 L7; ux §9 "BeatGrid", "Your songs"): the
// bar grid (tempo by tapping, the first downbeat, the meter), named sections, the learner's notes, and the
// self-assessed checklist. Own-audio work is graded by the learner (`grading.mode: 'self'`): nothing here is a
// pass or a fail.
import type { TranscriptionDetail } from "@oak/api";
import { OakApiError, OWN_AUDIO_CHECKLIST } from "@oak/api";
import type { KeySpec, MeterId } from "@oak/content-kit";
import { clsx } from "clsx";
import { Bookmark, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranscriptionPatch, useTranscriptionSettings } from "../lib/queries.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Kbd } from "../ui/kit/basics.tsx";
import { SegmentedControl } from "../ui/kit/Controls.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { type BarGrid, bpmFromTaps, downbeatFromTaps, formatTime, type Loop } from "./grid.ts";
import { CHECK_LEVELS, checklistProgress, selfScoreOf } from "./import.ts";
import type { Section } from "./SourceView.tsx";

const METER_CHOICES: MeterId[] = ["4/4", "3/4", "6/8", "2/4"];
/** Tonics as Oak spells keys (sharps up the circle, flats down it). */
const TONICS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"] as const;
const MODES = ["major", "minor"] as const;
const show = (t: string) => t.replace("#", "♯").replace(/(?<=[A-G])b/, "♭");

export function TempoCard({
  project,
  grid,
  taps,
  onClearTaps,
  onApply,
  getTime,
}: {
  project: TranscriptionDetail;
  grid: BarGrid | null;
  taps: readonly number[];
  onClearTaps(): void;
  onApply(p: { bpm?: number; downbeatS?: number; meter?: MeterId; key?: KeySpec | null }): void;
  /** The playhead now (for "bar 1 starts here"). */
  getTime(): number;
}) {
  const bpm = bpmFromTaps(taps);
  const down = downbeatFromTaps(taps);
  const bpmId = useId();
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="tempo-card">
      <h2 className="text-h3">Bars</h2>
      <p className="text-sm text-text-2">
        Play the recording and tap <Kbd>T</Kbd> on each beat, starting on a bar's first beat. Eight taps set
        the tempo and where bar 1 starts, so your bars line up with the recording.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm" htmlFor={bpmId}>
          <span className="text-text-2">Tempo</span>
          <input
            id={bpmId}
            type="number"
            min={30}
            max={300}
            step={0.5}
            value={project.bpm ?? ""}
            placeholder="BPM"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && n >= 30 && n <= 300) onApply({ bpm: n });
            }}
            className="h-8 w-20 rounded-control border border-border bg-surface px-2 tabular-nums text-text"
            data-testid="bpm-input"
          />
          <span className="text-text-2">BPM</span>
        </label>
        <span className="flex items-center gap-1.5 text-sm">
          <span className="text-text-2">Key</span>
          <select
            aria-label="Key: tonic"
            value={project.key?.tonic ?? ""}
            onChange={(e) =>
              onApply({
                key: e.target.value ? { tonic: e.target.value, mode: project.key?.mode ?? "major" } : null,
              })
            }
            className="h-8 rounded-control border border-border bg-surface px-1.5 text-text"
            data-testid="key-tonic"
          >
            <option value="">not set</option>
            {TONICS.map((t) => (
              <option key={t} value={t}>
                {show(t)}
              </option>
            ))}
          </select>
          <select
            aria-label="Key: mode"
            value={project.key?.mode === "minor" ? "minor" : "major"}
            disabled={!project.key}
            onChange={(e) =>
              project.key &&
              onApply({ key: { ...project.key, mode: e.target.value as (typeof MODES)[number] } })
            }
            className="h-8 rounded-control border border-border bg-surface px-1.5 text-text disabled:opacity-50"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </span>
        <SegmentedControl
          label="Meter"
          size="sm"
          value={(project.meter ?? "4/4") as MeterId}
          options={METER_CHOICES.map((m) => ({ value: m, label: m }))}
          onChange={(m) => onApply({ meter: m })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span className="text-text-2">Bar 1 at</span>
        <span className="min-w-12 tabular-nums" data-testid="downbeat">
          {project.downbeatS !== null ? formatTime(project.downbeatS) : "not set"}
        </span>
        {project.downbeatS !== null ? (
          <span className="inline-flex">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Move bar 1 earlier by 10 milliseconds"
              onClick={() => onApply({ downbeatS: Math.max(0, (project.downbeatS ?? 0) - 0.01) })}
            >
              −10 ms
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Move bar 1 later by 10 milliseconds"
              onClick={() => onApply({ downbeatS: (project.downbeatS ?? 0) + 0.01 })}
            >
              +10 ms
            </Button>
          </span>
        ) : null}
        <Button size="sm" onClick={() => onApply({ downbeatS: Math.max(0, getTime()) })}>
          Bar 1 starts here
        </Button>
      </div>
      {taps.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite" data-testid="taps">
          <span className="text-text-2">
            {taps.length} {taps.length === 1 ? "tap" : "taps"}
            {bpm !== null ? ` · about ${Math.round(bpm)} BPM` : ""}
            {down !== null ? ` · bar 1 at ${formatTime(down)}` : ""}
          </span>
          {bpm !== null && down !== null ? (
            <Button size="sm" onClick={() => onApply({ bpm, downbeatS: down })} data-testid="use-taps">
              Use this
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onClearTaps}>
            Clear taps
          </Button>
        </div>
      ) : null}
      {grid ? (
        <p className="text-sm text-text-3">
          A bar is {grid.barSec.toFixed(2)} s. The waveform shows the bar lines; A/B plays your code with the
          recording from the start of the bar the playhead is in.
        </p>
      ) : null}
    </Card>
  );
}

export function SectionsCard({
  sections,
  loop,
  onAdd,
  onRemove,
  onLoop,
}: {
  sections: readonly Section[];
  loop: Loop | null;
  onAdd(label: string): void;
  onRemove(id: string): void;
  onLoop(s: Section): void;
}) {
  const [name, setName] = useState("");
  const inputId = useId();
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="sections">
      <h2 className="text-h3">Sections</h2>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loop || !name.trim()) return;
          onAdd(name.trim());
          setName("");
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Section name
        </label>
        <input
          id={inputId}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder={loop ? "Name this loop: Verse, Chorus…" : "Set a loop first"}
          disabled={!loop}
          className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-text disabled:opacity-60"
        />
        <Button
          size="sm"
          type="submit"
          icon={<Bookmark aria-hidden className="size-4" />}
          disabled={!loop || !name.trim()}
        >
          Add
        </Button>
      </form>
      {sections.length === 0 ? (
        <p className="text-sm text-text-3">Named sections appear on the waveform; click one to loop it.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => onLoop(s)}
                className="flex-1 rounded-control px-1 py-0.5 text-left hover:bg-surface-2"
              >
                <span className="font-medium">{s.label}</span>{" "}
                <span className="tabular-nums text-text-3">
                  {formatTime(s.startS)}–{formatTime(s.endS)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove the section ${s.label}`}
                onClick={() => onRemove(s.id)}
                className="inline-flex size-7 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NotesCard({ project }: { project: TranscriptionDetail }) {
  const put = useTranscriptionSettings();
  const [text, setText] = useState(project.settings?.notes ?? "");
  const [state, setState] = useState<"saved" | "saving" | "unsaved" | "unavailable">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const save = (value: string) => {
    setState("saving");
    put.mutate(
      { params: { id: project.id }, body: { notes: value } },
      {
        onSuccess: () => setState("saved"),
        onError: (e) =>
          setState(e instanceof OakApiError && e.code === "not_implemented" ? "unavailable" : "unsaved"),
      },
    );
  };
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <label htmlFor={id} className="text-h3">
        Notes
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={4000}
        rows={3}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setState("unsaved");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(v), 800);
        }}
        placeholder="What you hear: the form, where the chords change, a lyric that marks the chorus…"
        className="w-full resize-y rounded-control border border-border bg-surface p-2 text-sm text-text"
        data-testid="notes"
      />
      <p className="text-sm text-text-3" aria-live="polite" data-testid="notes-state">
        {state === "saving"
          ? "Saving…"
          : state === "unsaved"
            ? "Not saved yet"
            : state === "unavailable"
              ? "Notes can't be kept on this server yet."
              : "Your own notes. Claude sees them only if you paste them into the tutor."}
      </p>
    </Card>
  );
}

export function ChecklistCard({ project }: { project: TranscriptionDetail }) {
  const patch = useTranscriptionPatch();
  const [list, setList] = useState<Record<string, number>>(project.checklist);
  const prog = checklistProgress(list);
  const set = (id: string, v: number) => {
    const next = { ...list, [id]: v };
    setList(next);
    patch.mutate(
      { params: { id: project.id }, body: { checklist: next, selfScore: selfScoreOf(next) } },
      { onError: (e) => toast.error("Couldn't save the checklist", e.message) },
    );
  };
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="checklist">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h3">How close is it?</h2>
        <span className="text-sm text-text-3">
          {prog.answered} of {prog.total}
        </span>
      </div>
      <p className="text-sm text-text-2">
        Your own audio has no answer key: compare with A/B and judge each part yourself.
      </p>
      <ul className="flex flex-col gap-2.5">
        {OWN_AUDIO_CHECKLIST.map((row) => {
          const v = list[row.id];
          return (
            <li key={row.id} className="flex flex-col gap-1">
              <span className={clsx("text-sm", v === undefined ? "text-text-2" : "text-text")}>
                {row.label}
              </span>
              <fieldset className="m-0 flex gap-1 border-0 p-0">
                <legend className="sr-only">{row.label}</legend>
                {CHECK_LEVELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={v === c.value}
                    onClick={() => set(row.id, c.value)}
                    className="h-7 rounded-control border border-border px-2.5 text-sm text-text-2 hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-lane-in aria-pressed:font-medium aria-pressed:text-text"
                    data-testid={`check-${row.id}-${c.value}`}
                  >
                    {c.label}
                  </button>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={project.status === "done" ? "ghost" : "secondary"}
          onClick={() =>
            patch.mutate({
              params: { id: project.id },
              body: { status: project.status === "done" ? "in_progress" : "done" },
            })
          }
          data-testid="mark-done"
        >
          {project.status === "done" ? "Mark as in progress" : "Mark as done"}
        </Button>
      </div>
    </Card>
  );
}

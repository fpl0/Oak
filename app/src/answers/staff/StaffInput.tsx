// Staff input (contracts §5.4 `staff-input`, ux §4.5 StaffInput, wave3.md §3.1): write notes on a treble, bass or
// grand staff with a key signature. The answer is engraved by @oak/notation and drawn by abcjs; a pointer layer
// above it shows a ghost note that snaps to lines, spaces and the beat grid. Click to place, click a note to
// select it, drag it to move it; or entirely by keyboard (model.ts `staffKey`: letters place, arrows move, digits
// set the length, `#`/`+`/`-`/`=` alter, Backspace deletes, Enter checks). Every placement sounds. Per-note marks
// come from the host's feedback; a reveal draws the answer as dashed heads. The typed note list stays as the
// accessible alternative (and the fallback when the staff cannot draw).
//
// Wave 4, `palette.chords`: notes that start together are one chord (`[C4,E4,G4]:2`, across both hands of a grand
// staff). The cursor stays on a chord while it is built: letters stack above its top note (`Shift`: under its
// bass), `→` steps past it, and every change plays the whole chord. Marks are per chord (the `part` is the chord's
// index), and under the staff each chord is spelled out with its lowest note; the chord's name and inversion
// appear as `AnswerEnv.harmony.nameChords` says (live, after a check, or never).
import "./staff.css";
import { R, type Rat } from "@oak/content-kit";
import { noteAt, type StaffGeometry, stepY } from "@oak/notation";
import { renderStaff } from "@oak/notation/render";
import { METERS } from "@oak/theory";
import { clsx } from "clsx";
import { Play, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { registerShortcutSection } from "../../ui/keys/sheet.ts";
import { Button, Skeleton } from "../../ui/kit/index.ts";
import { appAudio, useAnswerEnv, useSubmitVerb } from "../env.tsx";
import { buildChord, describeBuilt } from "../harmony.ts";
import type { AnswerWidgetProps, PartMark } from "../types.ts";
import { AnswerFrame, isMod, KeyHint, markOf, revealedOf } from "../ui.tsx";
import { KeySignatureAnswer } from "./KeySignature.tsx";
import { localAnchors, measure, measureAnchors } from "./measure.ts";
import {
  bandFor,
  chordAt,
  clefFor,
  DIGIT_DURATION,
  describeChord,
  describeNote,
  durationName,
  type Engraved,
  engrave,
  initialCursor,
  ledgerSteps,
  localGeometry,
  noteAtOnset,
  type OnsetAnchor,
  type PointerHit,
  paletteDurations,
  parseDuration,
  pitchAt,
  pointerHit,
  refusalText,
  type StaffChord,
  type StaffCursor,
  type StaffKeyInput,
  type StaffNote,
  staffChords,
  staffContext,
  staffEditOutcome,
  staffKey,
  staffNotes,
  stepOf,
  totalCycles,
  xOfOnset,
} from "./model.ts";

/** Target line spacing in CSS pixels at full width (abcjs draws 8 units between lines at scale 1). */
const SPACING = 11;
const ABCJS_UNIT = 8;

/** The staff's own keys (ux §4.5), listed in the shortcut sheet while a staff is on screen. */
const STAFF_SHEET = {
  id: "staff-input",
  title: "Staff input",
  order: 45,
  rows: [
    ["A B C D E F G", "Place that note (the nearest one) and step on"],
    ["ArrowLeft / ArrowRight", "Move along the grid (Shift: a bar)"],
    ["ArrowUp / ArrowDown", "Move the ghost note, or the note under the cursor (Shift: a half step)"],
    ["Mod+ArrowUp / Mod+ArrowDown", "Move the note an octave"],
    ["# + - =", "Sharp, flat or natural on the note"],
    ["2 3 4 5 6", "Length: sixteenth, eighth, quarter, half, whole"],
    ["0", "A rest"],
    ["Backspace", "Delete the note"],
    ["Enter", "Check"],
  ],
} as const;

/** The chord rows of the shortcut sheet, while a chord staff is on screen. */
const CHORD_SHEET = {
  id: "staff-chords",
  title: "Staff input: chords",
  order: 46,
  rows: [
    ["A B C D E F G", "Add that note above the chord at the cursor (on an empty beat: start a chord)"],
    ["Shift+A … Shift+G", "Add that note under the chord's lowest note"],
    ["ArrowRight / ArrowLeft", "Next chord / the chord before"],
    ["ArrowUp / ArrowDown", "Move the chord's selected note (Shift: a half step, Mod: an octave)"],
    ["Backspace", "Remove the selected note from the chord"],
  ],
} as const;

export function StaffInputAnswer(p: AnswerWidgetProps<"staff-input">) {
  if (p.spec.mode === "key-signature") return <KeySignatureAnswer {...p} />;
  return <StaffNotesAnswer {...p} />;
}

const DURATION_GLYPH: Record<number, string> = { 1: "𝅝", 2: "𝅗𝅥", 4: "♩", 8: "♪", 16: "𝅘𝅥𝅯" };
const DURATION_DIGIT: Record<string, string> = Object.fromEntries(
  Object.entries(DIGIT_DURATION).map(([digit, token]) => [token, digit]),
);

interface Measured {
  geom: StaffGeometry;
  anchors: OnsetAnchor[];
  width: number;
  height: number;
}

function StaffNotesAnswer(p: AnswerWidgetProps<"staff-input">) {
  // Its keys are in the shortcut sheet while a staff is on screen.
  useEffect(() => registerShortcutSection(STAFF_SHEET), []);
  const { spec, value, onChange, disabled, feedback } = p;
  const chordMode = spec.palette.chords === true;
  useEffect(() => (chordMode ? registerShortcutSection(CHORD_SHEET) : undefined), [chordMode]);
  const env = useAnswerEnv();
  const verb = useSubmitVerb();
  const audio = env.audio ?? appAudio;
  const sound = env.staff?.sound ?? "piano";
  const meter = env.staff?.meter ?? METERS["4/4"];
  const ctx = useMemo(() => staffContext(spec, meter), [spec, meter]);
  const engraved = useMemo(() => engrave(value, ctx), [value, ctx]);
  // The last list that engraved: a half-typed list keeps the staff as it was.
  const good = useRef<Engraved | null>(null);
  if (engraved.ok) good.current = engraved;
  const shown = engraved.ok ? engraved : good.current;
  const notes = useMemo(() => (shown ? staffNotes(shown.score) : []), [shown]);
  const chords = useMemo(() => (chordMode ? staffChords(notes) : []), [chordMode, notes]);
  const durations = paletteDurations(spec);

  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [rendered, setRendered] = useState(0);
  const [cursor, setCursor] = useState<StaffCursor>(() => initialCursor(spec));
  const [hover, setHover] = useState<PointerHit | null>(null);
  const [overNote, setOverNote] = useState(false);
  const [focused, setFocused] = useState(false);
  const [say, setSay] = useState("");
  /** Why the last edit was refused or shortened, shown under the staff until the next edit. */
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const drag = useRef<{ note: StaffNote | null; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const helpId = useId();

  const revealed = revealedOf<string>(feedback);
  const revealEngraved = useMemo(() => (revealed ? engrave(revealed, ctx) : null), [revealed, ctx]);
  const revealNotes = revealEngraved?.ok ? staffNotes(revealEngraved.score) : [];
  const nameChords = env.harmony?.nameChords ?? "after";
  const naming =
    nameChords === "live" ||
    (nameChords === "after" && feedback.state !== "idle" && feedback.state !== "pending");

  // The host's width decides the scale; abcjs's responsive mode keeps the drawing inside it.
  const maxWidth = 170 + spec.bars * 210;
  const staffwidth = Math.round((ABCJS_UNIT * maxWidth) / SPACING - 30);
  const minHeight = spec.clef === "grand" ? 210 : 132;
  const abcText = shown?.abc.abc ?? null;

  useEffect(() => {
    if (p.autoFocus) surface.current?.focus({ preventScroll: true });
  }, [p.autoFocus]);

  const remeasure = useRef<() => void>(() => {});
  remeasure.current = () => {
    const w = wrap.current;
    const h = host.current;
    if (!w || !h || !shown) return;
    try {
      const origin = w.getBoundingClientRect();
      const geom = localGeometry(measure(h, shown.abc, shown.score), { x: origin.left, y: origin.top });
      const anchors = localAnchors(measureAnchors(h, shown.score), { x: origin.left });
      setMeasured({ geom, anchors, width: origin.width, height: origin.height });
    } catch (e) {
      setMeasured(null);
      setRenderError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  // Engrave: abcjs draws the answer; the SVG is decoration (the notes list and the live line speak for it).
  useEffect(() => {
    const h = host.current;
    if (!h || !abcText) return;
    let cancelled = false;
    renderStaff(h, abcText, {
      params: { staffwidth, stretchlast: true, paddingtop: 18, paddingbottom: 18 } as never,
    })
      .then(() => {
        if (cancelled) return;
        const svg = h.querySelector("svg");
        svg?.setAttribute("aria-hidden", "true");
        svg?.setAttribute("focusable", "false");
        for (const el of h.querySelectorAll("[tabindex]")) el.removeAttribute("tabindex");
        setStatus("ready");
        setRenderError(null);
        setRendered((n) => n + 1);
        remeasure.current();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setRenderError(e instanceof Error ? e.message : String(e));
        setTyping(true);
      });
    return () => {
      cancelled = true;
    };
  }, [abcText, staffwidth]);

  useEffect(() => {
    const w = wrap.current;
    if (!w || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => remeasure.current());
    ro.observe(w);
    return () => ro.disconnect();
  }, []);

  // Selection and marks as classes on the engraved notes (re-applied after every render).
  const under = noteAtOnset(notes, cursor.onset);
  const underChord: StaffChord | null = chordMode ? chordAt(notes, cursor.onset) : null;
  // Marks are per note, or per chord with `palette.chords` (every item of a chord wears its chord's mark).
  const chordOfItem = new Map<number, number>();
  for (const c of chords) for (const i of c.items) chordOfItem.set(i, c.index);
  const marks = notes.map((n) => markOf(feedback, chordMode ? (chordOfItem.get(n.index) ?? -1) : n.index));
  const markKey = marks.map((m) => (m ? (m.ok ? "1" : "0") : "-")).join("");
  useEffect(() => {
    const h = host.current;
    if (!h || rendered === 0) return;
    for (const el of h.querySelectorAll(".oak-si-sel, .oak-si-ok, .oak-si-bad"))
      el.classList.remove("oak-si-sel", "oak-si-ok", "oak-si-bad");
    notes.forEach((n, i) => {
      if (n.n === null) return;
      const m = markKey[i];
      const cls =
        m === "1"
          ? "oak-si-ok"
          : m === "0"
            ? "oak-si-bad"
            : focused &&
                !disabled &&
                (chordMode ? underChord?.items.includes(n.index) === true : under?.index === n.index)
              ? "oak-si-sel"
              : null;
      if (cls) for (const el of h.querySelectorAll(`.oak-e${n.n}`)) el.classList.add(cls);
    });
  }, [rendered, notes, markKey, under?.index, underChord, chordMode, focused, disabled]);

  const play = (midis: readonly number[]) => {
    for (const m of midis) audio.playNote(m, { sound, dur: 0.5 });
  };

  const apply = (r: ReturnType<typeof staffKey>) => {
    if (!r) return false;
    if (r.edit) {
      if (disabled) return true;
      const out = staffEditOutcome(value, r.edit, ctx);
      if (out === null) {
        setSay("That edit does not fit this answer.");
        return true;
      }
      // A refused edit leaves the answer as it was and says why; a shortened one says so too.
      const why = refusalText(out);
      setNotice(why);
      if (out.refused) {
        setSay(why ?? "That edit does not fit this answer.");
        return true;
      }
      onChange(out.list);
      if (why) {
        setCursor(r.cursor);
        setSay(why);
        return true;
      }
    }
    setCursor(r.cursor);
    if (r.play && (r.edit || !disabled)) play(r.play);
    if (r.say) setSay(r.say);
    return true;
  };

  const runKey = (input: StaffKeyInput) => apply(staffKey(cursor, input, { spec, ctx, notes }));

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-staff-surface]")) return false;
    if (e.key === "Enter" || e.key === " " || e.key === "Tab" || e.key === "Escape") return false;
    setHover(null);
    return runKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, mod: isMod(e) });
  };

  // --- pointer ---------------------------------------------------------------------------------------
  const local = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  const hitAt = (pt: { x: number; y: number }) =>
    measured ? pointerHit(measured.geom, measured.anchors, pt, spec, meter) : null;
  const onPointerMove = (e: React.PointerEvent) => {
    if (!measured || disabled) return;
    const pt = local(e);
    setHover(hitAt(pt));
    setOverNote(noteAt(measured.geom, pt, 3) !== null);
    const d = drag.current;
    if (d?.note && !chordMode && !d.moved && Math.hypot(pt.x - d.x, pt.y - d.y) > 4) {
      d.moved = true;
      setDragging(true);
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!measured || disabled || e.button !== 0) return;
    surface.current?.focus({ preventScroll: true });
    const pt = local(e);
    const n = noteAt(measured.geom, pt, 3);
    const note = n === null ? null : (notes.find((x) => x.n === n) ?? null);
    drag.current = { note, x: pt.x, y: pt.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || !measured || disabled) return;
    const hit = hitAt(local(e));
    const total = totalCycles(ctx);
    if (d.note && chordMode) {
      // A click on a chord's note selects that note (arrows move it, Backspace removes it).
      const c = chordAt(notes, d.note.onset);
      const picked = c?.pitches.find((x) => hit && x.dia === hit.pitch.dia) ?? c?.pitches.at(-1);
      if (c && picked) {
        setCursor({ ...cursor, onset: c.onset, dia: picked.dia, last: null });
        play(c.pitches.map((x) => x.midi));
        setSay(`Selected ${picked.display} in ${describeChord(c)}`);
      }
      return;
    }
    if (d.note) {
      const first = d.note.pitches[0];
      const id = d.note.eventIds[0];
      if (d.moved && hit && id) {
        if (R.lt(total, R.add(hit.onset, d.note.dur))) {
          setSay("No room for that note there.");
          return;
        }
        apply({
          cursor: { ...cursor, onset: hit.onset, dia: hit.pitch.dia, last: null },
          edit: { op: "move", eventId: id, onset: hit.onset, pitch: hit.pitch.name },
          play: [hit.pitch.midi],
          say: `Moved to ${hit.pitch.display}, ${describePlaceShort(hit.onset, meter)}`,
        });
        return;
      }
      if (first) {
        setCursor({ ...cursor, onset: d.note.onset, dia: first.dia, last: null });
        play(d.note.pitches.map((x) => x.midi));
        setSay(`Selected ${describeNote(d.note)}`);
      }
      return;
    }
    if (!hit) return;
    const at = chordMode ? chordAt(notes, hit.onset) : null;
    if (at) {
      // Clicking above or below a chord adds that exact note to it.
      if (at.pitches.some((x) => x.midi === hit.pitch.midi)) return;
      apply({
        cursor: { ...cursor, onset: at.onset, dia: hit.pitch.dia, last: at.onset },
        edit: { op: "insert", onset: at.onset, dur: at.dur, pitch: hit.pitch.name, keep: true },
        play: [...at.pitches.map((x) => x.midi), hit.pitch.midi],
        say: `${hit.pitch.display} added to ${describeChord(at)}`,
      });
      return;
    }
    const dur = parseDuration(cursor.dur) ?? durations[0];
    if (!dur) return;
    apply(
      staffKey(
        { ...cursor, onset: hit.onset, dia: hit.pitch.dia },
        { key: hit.pitch.letter.toLowerCase() === "b" ? "B" : hit.pitch.letter },
        { spec, ctx, notes },
      ),
    );
  };

  // --- drawing ---------------------------------------------------------------------------------------
  const ghost = (() => {
    if (!measured || disabled) return null;
    if (hover && (!overNote || dragging)) {
      const clef = hover.band.clef === "bass" ? "bass" : "treble";
      return { x: hover.x, step: hover.step, band: hover.band, clef, caret: false };
    }
    if (!focused || hover) return null;
    const p0 = pitchAt(cursor.dia, ctx.key);
    const clef = clefFor(spec, p0.midi);
    const band = bandFor(measured.geom, clef, cursor.onset);
    const bar = band?.bars.find((b) => b.cycle === R.floor(cursor.onset));
    if (!band || !bar) return null;
    const x = xOfOnset(bar, measured.anchors, cursor.onset);
    return { x, step: stepOf(cursor.dia, clef), band, clef, caret: true, onNote: under !== null };
  })();

  const marksDrawn: { x: number; y: number; ok: boolean; note?: string | undefined }[] = [];
  const drawnChords = new Set<number>();
  if (measured)
    notes.forEach((n, i) => {
      const m = marks[i];
      if (chordMode) {
        const ci = chordOfItem.get(n.index) ?? -1;
        if (drawnChords.has(ci)) return;
        drawnChords.add(ci);
      }
      const g = measured.geom.notes.find((x) => x.n === n.n);
      if (!m || !g) return;
      const band = measured.geom.staves.find((s) => s.staff === n.staff) ?? measured.geom.staves[0];
      const top = Math.min(g.box.y, (band?.topLineY ?? g.box.y) - (band?.lineSpacing ?? 10));
      marksDrawn.push({ x: g.box.x + g.box.width / 2, y: top - 9, ok: m.ok, note: m.note });
    });

  const reveals: { x: number; y: number; step: number; band: StaffGeometry["staves"][number] }[] = [];
  if (measured)
    for (const n of revealNotes)
      for (const pch of n.pitches) {
        const clef = clefFor(spec, pch.midi);
        const band = bandFor(measured.geom, clef, n.onset);
        const bar = band?.bars.find((b) => b.cycle === R.floor(n.onset));
        if (!band || !bar) continue;
        const step = stepOf(pch.dia, clef);
        reveals.push({
          x: xOfOnset(bar, measured.anchors, n.onset) + band.lineSpacing * 1.6,
          y: stepY(band, step),
          step,
          band,
        });
      }

  const playAll = () => {
    if (notes.length === 0) return;
    const quarter = 60 / 96;
    notes.forEach((n) => {
      const at = R.toNum(n.onset) * meter.unitsPerBar * quarter;
      window.setTimeout(() => play(n.pitches.map((x) => x.midi)), at * 1000);
    });
  };

  const hasRhythm = durations.length > 1;
  const markList: (PartMark | null)[] = chordMode ? chords.map((c) => markOf(feedback, c.index)) : marks;
  const wrongCount = markList.filter((m) => m && !m.ok).length;
  const revealChords = chordMode ? staffChords(revealNotes) : [];

  return (
    <AnswerFrame
      kind="staff-input"
      // Its letters, arrows and Enter are the staff's own: a host's page keys (Enter = Continue, H = hint)
      // stay out of it, and the typed alternative's disclosure opens with Enter.
      keyscope="staff-input"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          {chordMode ? (
            <>
              <KeyHint keys={["A–G"]}>add a note</KeyHint>
              <KeyHint keys={["⇧ A–G"]}>add below</KeyHint>
              <KeyHint keys={["←", "→"]}>chord</KeyHint>
            </>
          ) : (
            <>
              <KeyHint keys={["A–G"]}>place a note</KeyHint>
              <KeyHint keys={["←", "→"]}>move</KeyHint>
            </>
          )}
          <KeyHint keys={["↑", "↓"]}>step</KeyHint>
          {spec.palette.accidentals ? <KeyHint keys={["#", "-"]}>sharp / flat</KeyHint> : null}
          {hasRhythm ? <KeyHint keys={["2–6"]}>length</KeyHint> : null}
          {spec.palette.rests ? <KeyHint keys={["0"]}>rest</KeyHint> : null}
          <KeyHint keys={["⌫"]}>{chordMode ? "remove" : "delete"}</KeyHint>
          <KeyHint keys={["Enter"]}>{verb}</KeyHint>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          {hasRhythm ? (
            // biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons; a fieldset would add a legend we do not show
            <div role="group" aria-label="Note length" className="flex flex-wrap gap-1">
              {durations.map((d) => {
                const on = cursor.dur === d.token;
                const digit = DURATION_DIGIT[String(d.base)];
                return (
                  <button
                    key={d.token}
                    type="button"
                    data-enter="native"
                    aria-pressed={on}
                    disabled={disabled}
                    title={digit ? `${durationName(d)} (${digit})` : durationName(d)}
                    onClick={() => {
                      if (under && digit && d.dots === 0) runKey({ key: digit });
                      else setCursor({ ...cursor, dur: d.token });
                      surface.current?.focus({ preventScroll: true });
                    }}
                    className={clsx(
                      "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-control border px-2 text-sm",
                      on ? "border-text bg-surface-2 text-text" : "border-border bg-surface text-text-2",
                    )}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {DURATION_GLYPH[d.base] ?? ""}
                      {d.dots ? "." : ""}
                    </span>
                    <span>{durationName(d)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {spec.palette.accidentals ? (
            // biome-ignore lint/a11y/useSemanticElements: a row of buttons, see above
            <div role="group" aria-label="Sharps and flats" className="flex gap-1">
              {(
                [
                  ["#", "♯", "Sharp"],
                  ["-", "♭", "Flat"],
                  ["=", "♮", "Natural"],
                ] as const
              ).map(([k, glyph, name]) => (
                <button
                  key={k}
                  type="button"
                  data-enter="native"
                  aria-label={`${name} on the selected note`}
                  title={`${name} (${k})`}
                  disabled={disabled || !under}
                  onClick={() => {
                    runKey({ key: k });
                    surface.current?.focus({ preventScroll: true });
                  }}
                  className="inline-flex size-8 items-center justify-center rounded-control border border-border bg-surface text-base text-text disabled:opacity-50"
                >
                  {glyph}
                </button>
              ))}
            </div>
          ) : null}
          {spec.palette.rests ? (
            <Button
              size="sm"
              data-enter="native"
              disabled={disabled}
              onClick={() => {
                runKey({ key: "0" });
                surface.current?.focus({ preventScroll: true });
              }}
            >
              Rest
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Trash2 aria-hidden className="size-4" />}
            disabled={disabled || !under}
            onClick={() => {
              runKey({ key: "Delete" });
              surface.current?.focus({ preventScroll: true });
            }}
          >
            {chordMode ? "Remove note" : "Delete note"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-enter="native"
            icon={<Play aria-hidden className="size-4" />}
            disabled={notes.length === 0}
            onClick={playAll}
          >
            Play
          </Button>
        </div>

        <div
          ref={wrap}
          className="relative w-full rounded-card border border-border bg-surface"
          style={{ maxWidth, minHeight }}
          data-status={status}
        >
          <div ref={host} className="oak-si-host px-2" />
          {status === "loading" ? (
            <div className="absolute inset-0 p-3">
              <Skeleton className="h-full w-full" label="Drawing the staff" />
            </div>
          ) : null}
          {measured ? (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={measured.width}
              height={measured.height}
            >
              {reveals.map((r, i) => (
                <g key={`r${i}`}>
                  {ledgerSteps(r.step).map((s) => (
                    <line
                      key={s}
                      className="oak-si-reveal"
                      x1={r.x - r.band.lineSpacing}
                      x2={r.x + r.band.lineSpacing}
                      y1={stepY(r.band, s)}
                      y2={stepY(r.band, s)}
                    />
                  ))}
                  <ellipse
                    className="oak-si-reveal"
                    cx={r.x}
                    cy={r.y}
                    rx={r.band.lineSpacing * 0.62}
                    ry={r.band.lineSpacing * 0.44}
                    transform={`rotate(-20 ${r.x} ${r.y})`}
                    strokeWidth={1.5}
                  />
                </g>
              ))}
              {ghost ? (
                <g data-testid="staff-ghost">
                  {ghost.caret ? (
                    <line
                      className="oak-si-caret"
                      strokeWidth={2}
                      x1={ghost.x - ghost.band.lineSpacing * 1.1}
                      x2={ghost.x - ghost.band.lineSpacing * 1.1}
                      y1={ghost.band.topLineY - ghost.band.lineSpacing * 2}
                      y2={ghost.band.topLineY + ghost.band.lineSpacing * 6}
                    />
                  ) : null}
                  {"onNote" in ghost && ghost.onNote ? null : (
                    <>
                      {ledgerSteps(ghost.step).map((s) => (
                        <line
                          key={s}
                          className="oak-si-ghost-line"
                          strokeWidth={1.2}
                          x1={ghost.x - ghost.band.lineSpacing * 1.05}
                          x2={ghost.x + ghost.band.lineSpacing * 1.05}
                          y1={stepY(ghost.band, s)}
                          y2={stepY(ghost.band, s)}
                        />
                      ))}
                      <ellipse
                        className="oak-si-ghost"
                        cx={ghost.x}
                        cy={stepY(ghost.band, ghost.step)}
                        rx={ghost.band.lineSpacing * 0.62}
                        ry={ghost.band.lineSpacing * 0.44}
                        transform={`rotate(-20 ${ghost.x} ${stepY(ghost.band, ghost.step)})`}
                      />
                    </>
                  )}
                </g>
              ) : null}
              {marksDrawn.map((m, i) => (
                <g key={`m${i}`} transform={`translate(${m.x} ${m.y})`}>
                  <circle r={7} fill={m.ok ? "var(--oak-accent)" : "var(--oak-issue)"} />
                  {m.ok ? (
                    <path
                      d="M-3.2 0.2 L-1 2.6 L3.4 -2.4"
                      stroke="var(--oak-on-accent)"
                      strokeWidth={1.7}
                      fill="none"
                    />
                  ) : (
                    <path
                      d="M-2.6 -2.6 L2.6 2.6 M2.6 -2.6 L-2.6 2.6"
                      stroke="#fff"
                      strokeWidth={1.7}
                      fill="none"
                    />
                  )}
                </g>
              ))}
            </svg>
          ) : null}
          {/* The pointer and keyboard surface. */}
          <div
            ref={surface}
            data-staff-surface
            data-testid="staff-surface"
            data-over-note={overNote ? "1" : "0"}
            data-dragging={dragging ? "1" : "0"}
            role="application"
            aria-roledescription="staff"
            aria-label={`${p.label}. Staff with ${spec.bars === 1 ? "one bar" : `${spec.bars} bars`}`}
            aria-describedby={helpId}
            aria-disabled={disabled || undefined}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the staff is a keyboard application (role="application")
            tabIndex={0}
            className="oak-si-surface absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              if (!drag.current) setHover(null);
              setOverNote(false);
            }}
          />
        </div>
        <p id={helpId} className="sr-only">
          {chordMode
            ? "Letters A to G add that note above the chord at the cursor, Shift with a letter adds it under the lowest note; right arrow goes to the next chord; up and down move the selected note; Backspace removes it; "
            : "Letters A to G place a note at the cursor; hash sharpens and minus flattens it; arrows move the cursor or the selected note; Backspace deletes; "}
          Enter {verb === "save" ? "saves" : "checks"}.
        </p>
        <p className="sr-only" aria-live="polite" data-testid="staff-say">
          {say}
        </p>
        {notice ? (
          <p className="text-sm text-text-2" data-testid="staff-notice">
            {notice}
          </p>
        ) : null}
        {chordMode ? (
          <ol
            aria-label="Your chords"
            data-testid="staff-chords"
            className="flex min-h-6 flex-col gap-0.5 text-sm"
          >
            {chords.length === 0 ? <li className="text-text-3">No chords yet.</li> : null}
            {chords.map((c) => {
              const built = buildChord(
                c.pitches.map((x) => x.midi),
                spec.key ?? null,
              );
              const line = built ? describeBuilt(built, naming) : null;
              const m = markOf(feedback, c.index);
              return (
                <li
                  key={`${c.index}-${c.eventIds.join()}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-text-2"
                >
                  <span className="text-[0.8125rem] text-text-3 tabular-nums">
                    bar {c.bar}, beat {Math.round(c.beat * 100) / 100}
                  </span>
                  <span className="font-medium text-text">{line?.notes}</span>
                  {line?.name ? <span data-testid="chord-name">{line.name}</span> : null}
                  {m ? (
                    <span className={m.ok ? "text-accent" : "text-issue"}>
                      {m.ok ? "right" : `not this one${m.note ? `: ${m.note}` : ""}`}
                    </span>
                  ) : null}
                  <span className="sr-only">{describeChord(c)}</span>
                </li>
              );
            })}
          </ol>
        ) : null}
        <ol className="sr-only" aria-label="Your notes">
          {notes.length === 0 ? <li>No notes yet.</li> : null}
          {notes.map((n, i) => {
            const m = marks[i];
            return (
              <li key={`${n.index}-${n.eventIds.join()}`}>
                {describeNote(n)}
                {m ? (m.ok ? ", right" : `, not this one${m.note ? `: ${m.note}` : ""}`) : ""}
              </li>
            );
          })}
        </ol>
        <p className="min-h-6 text-sm text-text-2" data-testid="staff-reveal">
          {revealed !== null ? (
            <>
              <span>Answer: </span>
              <span className="rounded-control border-2 border-dashed border-accent-2 px-1.5 font-semibold text-text">
                {chordMode
                  ? revealChords.map((c) => c.pitches.map((x) => x.display).join("+")).join("  ")
                  : revealNotes.map((n) => n.pitches.map((x) => x.display).join("+")).join(" ")}
              </span>
            </>
          ) : wrongCount > 0 ? (
            <span>
              {chordMode
                ? `${wrongCount === 1 ? "One chord is marked." : `${wrongCount} chords are marked.`} Select a note in it and move it, or add the missing one.`
                : `${wrongCount === 1 ? "One note is marked." : `${wrongCount} notes are marked.`} Select it and move it, or place another.`}
            </span>
          ) : status === "error" ? (
            <span>
              The staff did not draw{renderError ? ` (${renderError})` : ""}. Type the notes below instead.
            </span>
          ) : null}
        </p>
        <details
          open={typing}
          onToggle={(e) => setTyping((e.currentTarget as HTMLDetailsElement).open)}
          className="text-sm text-text-2"
        >
          {/* Enter opens it like any disclosure (an answer widget's Enter is otherwise its Check). */}
          <summary
            className="w-fit cursor-pointer rounded-control px-1 text-text-2 hover:text-text"
            data-enter="native"
          >
            Type the notes instead
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            <input
              id={`${p.idBase}-typed`}
              type="text"
              aria-label={`${p.label} (as text)`}
              aria-describedby={`${p.idBase}-typed-help`}
              readOnly={disabled}
              value={value}
              autoComplete="off"
              spellCheck={false}
              placeholder={chordMode ? "[C4,E4,G4]:2 [B3,D4,G4]:2" : "C4:4 E4:4 G4:4"}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-full max-w-md rounded-control border border-border bg-surface px-3 font-mono text-base text-text"
            />
            <span id={`${p.idBase}-typed-help`} className="text-text-3">
              {engraved.ok ? (
                <>
                  One note per word: letter, octave, length (4 = a quarter), as in{" "}
                  <code className="font-mono">C4:4 E4:4</code>; <code className="font-mono">r:4</code> is a
                  rest.
                  {chordMode ? (
                    <>
                      {" "}
                      A chord is its notes in brackets: <code className="font-mono">[C4,E4,G4]:2</code>.
                    </>
                  ) : null}
                </>
              ) : (
                <>Oak can't read that yet: {engraved.error.replace(/^note list: /, "")}.</>
              )}
            </span>
          </div>
        </details>
      </div>
    </AnswerFrame>
  );
}

function describePlaceShort(onset: Rat, meter: { unitsPerBar: number }): string {
  const cycle = R.floor(onset);
  const beat = 1 + R.toNum(R.sub(onset, [cycle, 1])) * meter.unitsPerBar;
  return `bar ${cycle + 1} beat ${Math.round(beat * 100) / 100}`;
}

// A music token in tutor text as an interactive chip (contracts §10.7, ux §6.4). Hover or focus shows the
// definition; a click plays degrees, numerals, notes, chords, intervals and keys (in the subject's key), loops
// bars in the Workbench and lights them (and a clicked note) on the roll and the staff, opens a tool in the
// Toolbox, and pins a term's definition open. Terms beyond the learner's vocabulary and locked tools carry a
// "preview" badge. A degree chip shows its syllable when the solfège lens is on; a note chip its degree when the
// degree lens is on.
import type { MusicToken, SubjectRef } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Lock, Repeat } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { degreeBackgroundCss, degreeStyle } from "../ui/theme/palette.ts";
import { highlightReference, showBars } from "./context.ts";
import { useThemeName } from "./hooks.ts";
import { describeToken, type TokenContext, type TokenInfo } from "./music-tokens.ts";
import { playChords } from "./preview.ts";

interface PopPos {
  left: number;
  top: number;
  above: boolean;
}

/** A definition bubble that is positioned against the viewport, so a narrow, scrolling panel never clips it. */
function useDefinition() {
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<PopPos | null>(null);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 260;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
    const above = r.bottom + 120 > window.innerHeight;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  };
  const show = (now: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    if (now) place();
    else timer.current = setTimeout(place, 250);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!pinned) setPos(null);
  };
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setPinned(false);
    setPos(null);
  };
  return {
    ref,
    pos,
    show,
    hide,
    close,
    pinned,
    pin: () => {
      setPinned(true);
      place();
    },
  };
}

function Bubble({ id, pos, info }: { id: string; pos: PopPos; info: TokenInfo }) {
  return (
    <span
      id={id}
      role="tooltip"
      style={{ left: pos.left, top: pos.top, width: 260 }}
      className={clsx(
        "pointer-events-none fixed z-[80] rounded-control border border-border bg-surface px-3 py-2 text-left text-sm leading-snug text-text shadow-overlay animate-fade-in",
        pos.above && "-translate-y-full",
      )}
    >
      {info.preview && (
        <span className="mb-1 block text-xs font-semibold tracking-wide text-accent-2 uppercase">
          {info.kind === "tool" ? "Not unlocked yet" : "Preview: not introduced yet"}
        </span>
      )}
      {info.title}
    </span>
  );
}

function PreviewBadge() {
  return (
    <span className="ml-1 rounded-full border border-accent-2/60 px-1.5 text-[0.6875rem] leading-4 font-medium text-text-2">
      preview
    </span>
  );
}

const PILL =
  "mx-0.5 inline-flex h-6 items-center gap-1 rounded-full border px-2 align-baseline text-sm leading-none font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

export function TokenChip({
  token,
  raw,
  ctx,
  thread,
}: {
  token: Exclude<MusicToken, { kind: "reveal" }>;
  raw: string;
  ctx: TokenContext;
  thread: SubjectRef;
}) {
  const theme = useThemeName();
  const def = useDefinition();
  const id = useId();
  const info = describeToken(token, ctx);
  if (!info) return <>{raw}</>;

  const handlers = {
    onMouseEnter: () => def.show(false),
    onMouseLeave: def.hide,
    onFocus: () => def.show(true),
    onBlur: def.close,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && def.pos) {
        e.stopPropagation();
        def.close();
      }
    },
    "aria-describedby": def.pos ? id : undefined,
    "data-token": info.kind,
  };
  const bubble = def.pos ? <Bubble id={id} pos={def.pos} info={info} /> : null;

  let body: ReactNode;
  if (info.kind === "tool" && info.href) {
    body = (
      <Link
        to={info.href}
        ref={(el) => {
          def.ref.current = el;
        }}
        aria-label={info.aria}
        className={clsx(
          PILL,
          "border-border bg-surface-2 font-mono text-[0.8125rem] text-link hover:bg-surface",
        )}
        {...handlers}
      >
        {info.preview && <Lock aria-hidden className="size-3" />}
        {info.label}
      </Link>
    );
  } else {
    let style: React.CSSProperties | undefined;
    let cls = "border-border bg-surface-2 text-text hover:bg-surface";
    if (info.kind === "deg" && info.degree) {
      const ds = degreeStyle(info.degree, theme);
      style = { background: degreeBackgroundCss(ds), color: ds.label, borderColor: ds.outline ?? ds.fill };
      cls = "";
    } else if (info.kind === "note" && info.degree) {
      // The degree lens is on and the key is known: the note wears its degree's colour as an edge.
      const ds = degreeStyle(info.degree, theme);
      style = { borderColor: ds.fill, boxShadow: `inset 3px 0 0 ${ds.fill}` };
      cls = "bg-surface text-text hover:bg-surface-2";
    } else if (info.kind === "term" && info.variant) {
      cls = "border-border bg-surface-2 text-text hover:bg-surface";
    } else if (info.kind === "rn") {
      const ds = info.degree ? degreeStyle(info.degree, theme) : null;
      style = ds ? { borderColor: ds.fill, boxShadow: `inset 3px 0 0 ${ds.fill}` } : undefined;
      cls = "bg-surface text-text hover:bg-surface-2";
    } else if (info.kind === "bars") {
      cls = "border-accent/40 bg-lane-in text-accent hover:bg-surface-2";
    } else if (info.kind === "term" && !info.variant) {
      cls =
        "rounded-none border-0 border-b border-dotted border-text-3 bg-transparent px-0.5 font-normal text-text hover:bg-surface-2";
    }
    const onClick = () => {
      if (info.midi !== undefined) highlightReference({ kind: "note", thread, midi: info.midi });
      if (info.play) void playChords(info.play);
      else if (info.bars) showBars(thread, info.bars.from, info.bars.to);
      else if (info.kind === "term") def.pinned ? def.close() : def.pin();
    };
    body = (
      <button
        type="button"
        ref={(el) => {
          def.ref.current = el;
        }}
        aria-label={info.aria}
        onClick={onClick}
        style={style}
        className={clsx(
          PILL,
          cls,
          (info.kind === "note" || info.kind === "chord") && "font-mono text-[0.8125rem]",
        )}
        data-variant={info.variant}
        {...handlers}
      >
        {info.kind === "bars" && <Repeat aria-hidden className="size-3" />}
        {info.label}
        {info.sub && (
          // Full strength: at 12 px on a degree fill, any fading drops the syllable below 4.5:1.
          <span data-sub className="font-sans text-[0.75rem] font-normal">
            {info.sub}
          </span>
        )}
        {info.kind === "term" && info.preview && <PreviewBadge />}
      </button>
    );
  }
  return (
    <>
      {body}
      {bubble}
    </>
  );
}

// The tutor panel container (ux §2.1, §6.1): docked at L (360 px default, resizable 320–520, persisted) and a
// 400 px overlay drawer at M. Its content is a slot: Wave 2 registers the chat with `setTutorContent`; until then
// a placeholder shows the backend status and the latest notes, which already come from the server.
import { TUTOR_ERROR_COPY } from "@oak/api";
import { clsx } from "clsx";
import { MessageCircle, X } from "lucide-react";
import type { ComponentType, KeyboardEvent, PointerEvent } from "react";
import { create } from "zustand";
import { useHealth, useTutorNotes } from "../../lib/queries.ts";
import { useShell } from "../../lib/shell-store.ts";
import { useIsLarge } from "../../lib/use-media.ts";
import { IconButton } from "../kit/Button.tsx";
import { Chip, WavePlaceholder } from "../kit/basics.tsx";
import { Drawer } from "../kit/Dialog.tsx";
import { TUTOR_WIDTH, usePrefs } from "../theme/prefs.ts";
import { useTutorToggle } from "./status.tsx";

interface TutorSlot {
  Content: ComponentType | null;
}
export const useTutorSlot = create<TutorSlot>(() => ({ Content: null }));
/** Wave 2: the tutor chat registers itself here. */
export function setTutorContent(Content: ComponentType | null): void {
  useTutorSlot.setState({ Content });
}

const STATUS_COPY: Record<string, string> = {
  ready: "Ready",
  missing_key: "No API key and no Claude login found",
  invalid_key: "The API key was refused",
  unreachable: "Anthropic could not be reached",
};

function Placeholder() {
  const health = useHealth();
  const notes = useTutorNotes();
  const h = health.data;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {h ? (
          <>
            <Chip tone={h.tutor === "ready" ? "accent" : "issue"}>{STATUS_COPY[h.tutor] ?? h.tutor}</Chip>
            <Chip>
              {h.tutorBackend === "claude-cli"
                ? "Claude CLI"
                : h.tutorBackend === "anthropic-api"
                  ? "Anthropic API"
                  : "Off"}
            </Chip>
          </>
        ) : health.isError ? (
          <Chip tone="issue">{TUTOR_ERROR_COPY.network}</Chip>
        ) : (
          <Chip>Checking…</Chip>
        )}
      </div>
      <WavePlaceholder feature="The tutor chat">
        <p className="text-sm text-text-2">
          Oak works fully without the tutor. When it is on, Claude sees your code, your grader result and the
          lesson — never your audio.
        </p>
      </WavePlaceholder>
      {notes.data && notes.data.items.length > 0 && (
        <section aria-label="Recent tutor notes">
          <h3 className="mb-2 text-sm font-semibold text-text-2">Recent notes</h3>
          <ul className="flex flex-col gap-2">
            {notes.data.items
              .filter((n) => !n.retractedAt)
              .slice(0, 5)
              .map((n) => (
                <li key={n.id} className="rounded-control border border-border p-2 text-sm">
                  {n.text}
                  <span className="mt-1 block text-text-3">{n.day}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PanelBody() {
  const Content = useTutorSlot((s) => s.Content);
  return Content ? <Content /> : <Placeholder />;
}

function ResizeHandle() {
  const width = usePrefs((s) => s.tutorWidth);
  const set = usePrefs((s) => s.set);
  const clamp = (w: number) => Math.round(Math.min(TUTOR_WIDTH.max, Math.max(TUTOR_WIDTH.min, w)));
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const start = width;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => set({ tutorWidth: clamp(start + (startX - ev.clientX)) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === "ArrowLeft") set({ tutorWidth: clamp(width + step) });
    else if (e.key === "ArrowRight") set({ tutorWidth: clamp(width - step) });
    else if (e.key === "Home") set({ tutorWidth: TUTOR_WIDTH.max });
    else if (e.key === "End") set({ tutorWidth: TUTOR_WIDTH.min });
    else return;
    e.preventDefault();
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a vertical splitter has no native element.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize tutor panel"
      aria-valuemin={TUTOR_WIDTH.min}
      aria-valuemax={TUTOR_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -left-1 w-2 cursor-col-resize focus-visible:bg-accent/30 hover:bg-accent/20"
    />
  );
}

/** Docked panel (L) or drawer (M). Renders nothing when closed. */
export function TutorPanel() {
  const large = useIsLarge();
  const { open, toggle } = useTutorToggle();
  const width = usePrefs((s) => s.tutorWidth);
  const drawerOpen = useShell((s) => s.tutorDrawerOpen);
  const setDrawer = useShell((s) => s.setTutorDrawerOpen);
  if (!large)
    return (
      <Drawer open={drawerOpen} onClose={() => setDrawer(false)} title="Tutor" width={400}>
        <PanelBody />
      </Drawer>
    );
  if (!open) return null;
  return (
    <aside
      aria-label="Tutor"
      data-keyscope="tutor-composer"
      style={{ width }}
      className={clsx("relative flex h-full shrink-0 flex-col border-l border-border bg-surface")}
    >
      <ResizeHandle />
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <h2 className="flex items-center gap-2 font-sans text-base font-semibold">
          <MessageCircle aria-hidden className="size-4" /> Tutor
        </h2>
        <IconButton
          label="Hide tutor"
          shortcut="⌘J"
          icon={<X aria-hidden className="size-4" />}
          onClick={toggle}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <PanelBody />
      </div>
    </aside>
  );
}

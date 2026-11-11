// The tutor panel container (ux §2.1, §6.1): docked on large screens (360 px default, resizable 320–520 with the
// pointer or the arrow keys, width remembered), collapsed to a slim rail when hidden, and a 400 px overlay drawer
// on smaller screens. Mod+J toggles it (GlobalKeys); Mod+I asks Claude: it opens the panel with the editor's
// selection as context and puts the cursor in the composer, or closes the panel when the composer already has
// focus. The content is app/src/tutor/TutorChat.tsx.
import { clsx } from "clsx";
import { Leaf, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useShell } from "../../lib/shell-store.ts";
import { useIsLarge } from "../../lib/use-media.ts";
import { focusTutor, patchSubject, useTutorContext } from "../../tutor/context.ts";
import { installTutorDevHook } from "../../tutor/dev-hook.ts";
import { TutorChat } from "../../tutor/TutorChat.tsx";
import { useHotkeys } from "../keys/KeymapProvider.tsx";
import { IconButton } from "../kit/Button.tsx";
import { Drawer } from "../kit/Dialog.tsx";
import { TUTOR_WIDTH, usePrefs } from "../theme/prefs.ts";
import { useTutorToggle } from "./status.tsx";

installTutorDevHook();

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
      data-testid="tutor-resize"
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/20 focus-visible:bg-accent/30 focus-visible:outline-none"
    />
  );
}

/** The selected text of the focused CodeMirror editor, if any (Mod+I "ask about the selection"). */
function editorSelection(): string | null {
  const active = document.activeElement;
  if (!active?.closest(".cm-editor")) return null;
  const text = document.getSelection()?.toString() ?? "";
  return text.trim() ? text : null;
}

function useAskKey(open: boolean, toggle: () => void) {
  useHotkeys([
    {
      id: "tutor-ask",
      keys: "Mod+I",
      scope: "global",
      group: "Global",
      description: "Ask Claude (focus the tutor; again to close it)",
      allowInInput: true,
      run: () => {
        const inPanel = document.activeElement?.closest("[data-tutor-panel]");
        if (open && inPanel) {
          toggle();
          return;
        }
        const selection = editorSelection();
        const subject = useTutorContext.getState().subject;
        if (subject) patchSubject(subject.thread, { selection });
        focusTutor();
      },
    },
  ]);
}

/** The collapsed panel: a slim rail that keeps the tutor one click (or Mod+J) away. */
function Rail({ onOpen }: { onOpen(): void }) {
  const availability = useTutorContext((s) => s.availability);
  return (
    <aside
      aria-label="Tutor (collapsed)"
      data-testid="tutor-rail"
      className="flex h-full w-11 shrink-0 flex-col items-center gap-2 border-l border-border bg-surface py-2"
    >
      <IconButton
        label="Show tutor"
        shortcut="⌘J"
        tooltipSide="left"
        icon={<PanelRightOpen aria-hidden className="size-4" />}
        onClick={onOpen}
      />
      <span
        aria-hidden
        title={availability === "ready" ? "Claude is ready" : "Tutor off"}
        className={clsx("size-2 rounded-full", availability === "ready" ? "bg-accent" : "bg-text-3")}
      />
      <Leaf aria-hidden className="mt-1 size-4 text-text-3" />
    </aside>
  );
}

/** Docked panel or rail (large screens), drawer (smaller). */
export function TutorPanel() {
  const large = useIsLarge();
  const { open, toggle } = useTutorToggle();
  const width = usePrefs((s) => s.tutorWidth);
  const drawerOpen = useShell((s) => s.tutorDrawerOpen);
  const setDrawer = useShell((s) => s.setTutorDrawerOpen);
  useAskKey(open, toggle);
  if (!large)
    return (
      <Drawer open={drawerOpen} onClose={() => setDrawer(false)} title="Tutor" width={400}>
        <div data-tutor-panel data-keyscope="tutor-composer" className="h-full">
          <TutorChat variant="drawer" />
        </div>
      </Drawer>
    );
  if (!open) return <Rail onOpen={toggle} />;
  return (
    <aside
      aria-label="Tutor"
      data-tutor-panel
      data-keyscope="tutor-composer"
      data-testid="tutor-panel"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-surface"
    >
      <ResizeHandle />
      <TutorChat
        headerEnd={
          <IconButton
            label="Hide tutor"
            shortcut="⌘J"
            tooltipSide="left"
            icon={<PanelRightClose aria-hidden className="size-4" />}
            onClick={toggle}
          />
        }
      />
    </aside>
  );
}

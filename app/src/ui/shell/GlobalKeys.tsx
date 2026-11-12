// Global shortcuts (ux §7.10, contracts §11.9), the navigation and action commands of the palette, and the
// shortcut sheet (`?`).

import { useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import type { Command } from "../../lib/commands.ts";
import { useCommandSource } from "../../lib/commands.ts";
import { NAV_ITEMS, SETTINGS_SECTIONS } from "../../lib/nav.ts";
import { stopAllAudio } from "../../lib/oak.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { useShell } from "../../lib/shell-store.ts";
import { IS_MAC, useHotkeys, useKeymap } from "../keys/KeymapProvider.tsx";
import { type Binding, formatKeys } from "../keys/keymap.ts";
import { sheetSections, useSheetSections } from "../keys/sheet.ts";
import { Kbd } from "../kit/basics.tsx";
import { Dialog } from "../kit/Dialog.tsx";
import { resolveTheme, usePrefs } from "../theme/prefs.ts";
import { useTutorToggle } from "./status.tsx";

function anyDialogOpen(): boolean {
  return document.querySelector("dialog[open]") !== null;
}

export function GlobalKeys() {
  const navigate = useNavigate();
  const router = useRouter();
  const shell = useShell();
  const tutor = useTutorToggle();
  const bootstrap = useBootstrap();
  const setPrefs = usePrefs((s) => s.set);

  const resumeLesson = () => {
    const open = bootstrap.data?.openSession?.mapItemId;
    if (open && /\.L\d+$/.test(open)) void navigate({ to: "/learn/$lessonId", params: { lessonId: open } });
    else void navigate({ to: "/" });
  };
  const toggleTheme = () => {
    const current = resolveTheme(
      usePrefs.getState().theme,
      matchMedia("(prefers-color-scheme: dark)").matches,
    );
    setPrefs({ theme: current === "bark" ? "paper" : "bark" });
  };
  const closeMic = () => useShell.getState().closeMic?.();

  const bindings: Binding[] = [
    {
      id: "palette",
      keys: "Mod+K",
      scope: "global",
      group: "Global",
      description: "Command palette",
      allowInInput: true,
      run: () => shell.setPaletteOpen(!useShell.getState().paletteOpen),
    },
    {
      id: "tutor",
      keys: "Mod+J",
      scope: "global",
      group: "Global",
      description: "Toggle tutor",
      allowInInput: true,
      run: () => tutor.toggle(),
    },
    {
      id: "panic",
      keys: "Mod+.|Ctrl+.|Alt+.",
      scope: "global",
      group: "Global",
      description: "Stop all audio",
      allowInInput: true,
      run: () => stopAllAudio(),
    },
    {
      id: "close-mic",
      keys: "Mod+Shift+M",
      scope: "global",
      group: "Global",
      description: "Close microphone",
      allowInInput: true,
      run: closeMic,
    },
    {
      id: "shortcuts",
      keys: "?",
      scope: "global",
      group: "Global",
      description: "Shortcut sheet",
      run: () => shell.setShortcutsOpen(true),
    },
    {
      id: "leave-focus",
      keys: "Escape",
      scope: "global",
      group: "Global",
      description: "Close overlay / leave focus mode (place saved)",
      when: (ctx) => ctx.focusRoute && !anyDialogOpen(),
      run: () => void navigate({ to: "/" }),
    },
    {
      id: "go-lesson",
      keys: "G L",
      scope: "global",
      group: "Go to",
      description: "Lesson (resume)",
      run: resumeLesson,
    },
    ...NAV_ITEMS.map(
      (item): Binding => ({
        id: `go-${item.id}`,
        keys: `G ${item.gKey}`,
        scope: "global",
        group: "Go to",
        description: item.label,
        run: () => void router.navigate({ to: item.to }),
      }),
    ),
  ];
  useHotkeys(bindings);

  const commands = useMemo<Command[]>(
    () => [
      ...NAV_ITEMS.map(
        (item): Command => ({
          id: `nav:${item.id}`,
          title: `Go to ${item.label}`,
          group: "Navigate",
          shortcut: `G ${item.gKey}`,
          keywords: [item.label],
          run: () => void router.navigate({ to: item.to }),
        }),
      ),
      ...SETTINGS_SECTIONS.map(
        (s): Command => ({
          id: `nav:settings-${s.id}`,
          title: `Settings › ${s.label}`,
          group: "Settings",
          keywords: ["settings", s.id],
          run: () => void router.navigate({ to: `/settings/${s.id}` }),
        }),
      ),
      {
        id: "nav:review",
        title: "Today's review",
        group: "Navigate",
        run: () => void navigate({ to: "/practice/review" }),
      },
      {
        id: "act:new-sketch",
        title: "New sketch",
        group: "Actions",
        keywords: ["studio", "create", "blank"],
        run: () => void navigate({ to: "/studio", search: { new: true } }),
      },
      {
        id: "act:recalibrate",
        title: "Recalibrate mic",
        group: "Actions",
        keywords: ["voice", "microphone", "calibration", "setup"],
        run: () => void navigate({ to: "/settings/voice/setup" }),
      },
      {
        id: "act:tutor",
        title: "Toggle tutor",
        group: "Actions",
        shortcut: "Mod+J",
        run: () => tutor.toggle(),
      },
      {
        id: "act:stop",
        title: "Stop all audio",
        group: "Actions",
        shortcut: "Mod+.",
        run: () => stopAllAudio(),
      },
      {
        id: "act:theme",
        title: "Switch theme (Paper / Bark)",
        group: "Actions",
        keywords: ["dark", "light"],
        run: toggleTheme,
      },
      {
        id: "act:close-mic",
        title: "Close microphone",
        group: "Actions",
        shortcut: "Mod+Shift+M",
        run: closeMic,
      },
      {
        id: "act:shortcuts",
        title: "Keyboard shortcuts",
        group: "Actions",
        shortcut: "?",
        run: () => shell.setShortcutsOpen(true),
      },
      {
        id: "act:backup",
        title: "Back up my data",
        group: "Actions",
        keywords: ["export", "backup"],
        run: () => void navigate({ to: "/settings/data" }),
      },
    ],
    [router, navigate],
  );
  useCommandSource("global", commands);
  return <ShortcutSheet />;
}

function ShortcutSheet() {
  const open = useShell((s) => s.shortcutsOpen);
  const setOpen = useShell((s) => s.setShortcutsOpen);
  const keymap = useKeymap();
  const live = open ? keymap.list().filter((b) => b.group) : [];
  const groups = new Map<string, Binding[]>();
  for (const b of live) groups.set(b.group ?? "", [...(groups.get(b.group ?? "") ?? []), b]);
  // Keys components handle themselves (editor, Workbench, answers, tutor, and any section an area registers,
  // app/src/ui/keys/sheet.ts); a row a live page group already lists is not repeated.
  const registered = useSheetSections((s) => s.sections);
  const statics = sheetSections(registered, new Set(live.map((b) => `${b.keys}|${b.description}`)));
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      className="w-[min(94vw,52rem)]"
    >
      <div className="grid max-h-[65vh] gap-6 overflow-auto sm:grid-cols-2">
        {[...groups].map(([group, list]) => (
          <section key={group}>
            <h3 className="mb-2 font-sans text-sm font-semibold text-text-2">{group}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {list.map((b) => (
                <div key={b.id} className="contents">
                  <dt>
                    <Kbd>{formatKeys(b.keys, IS_MAC)}</Kbd>
                  </dt>
                  <dd>{b.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {statics.map((s) => (
          <section key={s.id} data-sheet-section={s.id}>
            <h3 className="mb-2 font-sans text-sm font-semibold text-text-2">{s.title}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {s.rows.map(([k, d]) => (
                <div key={k + d} className="contents">
                  <dt>
                    <Kbd>{formatKeys(k, IS_MAC)}</Kbd>
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

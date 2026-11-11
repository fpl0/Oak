// The app shell (ux §2.1): NavRail + TopBar around the page in shell routes; a 56 px focus header and no rail
// in focus routes (lesson, drill, checkpoint, onboarding, coda, calibration). The tutor panel docks on the right.
import { Link, useRouterState } from "@tanstack/react-router";
import { clsx } from "clsx";
import {
  AudioWaveform,
  ChevronLeft,
  ListChecks,
  NotebookPen,
  Search,
  Settings,
  Sunrise,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { NAV_ITEMS, type NavId } from "../../lib/nav.ts";
import { useDue } from "../../lib/queries.ts";
import { useShell } from "../../lib/shell-store.ts";
import { OakIcon, RingIcon, TuningForkIcon } from "../icons/index.tsx";
import { isFocusRoute } from "../keys/keymap.ts";
import { IconButton } from "../kit/Button.tsx";
import { StepRail } from "../kit/basics.tsx";
import { Toaster } from "../kit/Toast.tsx";
import { Tooltip } from "../kit/Tooltip.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { useFocusHeader } from "./focus-header.ts";
import { GlobalKeys } from "./GlobalKeys.tsx";
import { AudioStatus, MicLiveDot, NowPlaying, TutorToggle } from "./status.tsx";
import { TutorPanel } from "./TutorPanel.tsx";

const ICONS: Record<NavId, ReactNode> = {
  today: <Sunrise aria-hidden className="size-5" strokeWidth={1.5} />,
  oak: <OakIcon />,
  practice: <TuningForkIcon />,
  studio: <NotebookPen aria-hidden className="size-5" strokeWidth={1.5} />,
  transcribe: <AudioWaveform aria-hidden className="size-5" strokeWidth={1.5} />,
  album: <RingIcon />,
  toolbox: <Wrench aria-hidden className="size-5" strokeWidth={1.5} />,
  progress: <ListChecks aria-hidden className="size-5" strokeWidth={1.5} />,
  settings: <Settings aria-hidden className="size-5" strokeWidth={1.5} />,
};

function PracticeBadge() {
  const due = useDue();
  const items = due.data?.items.length ?? 0;
  if (!items) return null;
  // Raw due counts are never shown (DueBatch.label); the badge is a dot with the label for screen readers.
  return (
    <span
      className="absolute top-1 right-1 size-2 rounded-full bg-accent-2"
      aria-hidden
      title={due.data?.label}
    />
  );
}

function NavRail({ path }: { path: string }) {
  const due = useDue();
  const main = NAV_ITEMS.filter((i) => i.id !== "settings");
  const settings = NAV_ITEMS.find((i) => i.id === "settings");
  const item = (n: (typeof NAV_ITEMS)[number]) => {
    const active = n.match(path);
    const label = n.id === "practice" && due.data?.items.length ? `${n.label} · ${due.data.label}` : n.label;
    return (
      <li key={n.id}>
        <Tooltip content={label} shortcut={`G ${n.gKey}`} side="right">
          <Link
            to={n.to}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            data-nav={n.id}
            className={clsx(
              "relative flex size-10 items-center justify-center rounded-control transition-colors",
              active ? "bg-lane-in text-accent" : "text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            {ICONS[n.id]}
            {n.id === "practice" && <PracticeBadge />}
          </Link>
        </Tooltip>
      </li>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="flex w-[var(--oak-nav-w)] shrink-0 flex-col items-center justify-between border-r border-border bg-surface py-2"
    >
      <ul className="flex flex-col items-center gap-1">
        <li
          className="mb-2 flex h-10 items-center font-display text-lg font-semibold text-accent"
          aria-hidden
        >
          Oak
        </li>
        {main.map(item)}
      </ul>
      <ul className="flex flex-col items-center gap-1">
        {settings && item(settings)}
        <li>
          <AudioStatus compact />
        </li>
        <li>
          <TutorToggle side="right" />
        </li>
      </ul>
    </nav>
  );
}

function TopBar() {
  const title = useShell((s) => s.title);
  const setPalette = useShell((s) => s.setPaletteOpen);
  return (
    <header className="flex h-[var(--oak-topbar-h)] shrink-0 items-center justify-between gap-3 border-b border-border bg-bg px-4">
      <p className="min-w-0 flex-1 truncate font-display text-h3 font-semibold" data-testid="page-title">
        {title}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <NowPlaying />
        <MicLiveDot />
        <AudioStatus />
        <IconButton
          label="Command palette"
          shortcut="⌘K"
          icon={<Search aria-hidden className="size-4" />}
          onClick={() => setPalette(true)}
        />
        <TutorToggle />
      </div>
    </header>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const min = Math.max(0, Math.floor((now - since) / 60_000));
  return (
    <span className="text-sm text-text-3 tabular-nums">
      <span aria-hidden>{min}′</span>
      <span className="sr-only">{min} minutes in</span>
    </span>
  );
}

function FocusBar() {
  const { title, steps, startedAt } = useFocusHeader();
  const shellTitle = useShell((s) => s.title);
  return (
    <header className="flex h-[var(--oak-focusbar-h)] shrink-0 items-center gap-4 border-b border-border bg-bg px-3">
      <Tooltip content="Your place is saved" shortcut="Esc" side="bottom">
        <Link
          to="/"
          className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <ChevronLeft aria-hidden className="size-4" /> Today
        </Link>
      </Tooltip>
      <p className="min-w-0 flex-1 truncate font-display text-h3 font-semibold" data-testid="page-title">
        {title ?? shellTitle}
      </p>
      {steps && <StepRail steps={steps} />}
      {startedAt && <Elapsed since={startedAt} />}
      <MicLiveDot />
      <AudioStatus />
      <TutorToggle />
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const focus = isFocusRoute(path);
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text" data-mode={focus ? "focus" : "shell"}>
      <a
        href="#main"
        className="sr-only-focusable absolute top-2 left-2 z-[70] rounded-control bg-accent px-3 py-2 text-on-accent"
      >
        Skip to content
      </a>
      {!focus && <NavRail path={path} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {focus ? <FocusBar /> : <TopBar />}
        <div className="flex min-h-0 flex-1">
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-auto outline-none">
            {children}
          </main>
          <TutorPanel />
        </div>
      </div>
      <CommandPalette />
      <GlobalKeys />
      <Toaster />
    </div>
  );
}

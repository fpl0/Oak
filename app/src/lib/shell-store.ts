// UI state of the shell that is not a preference and not server data: audio status, mic, now playing, the
// tutor panel's open state on medium screens, the palette and the shortcut sheet.
import { create } from "zustand";

export type AudioStatus =
  | { kind: "asleep" }
  | { kind: "waking" }
  | { kind: "loading"; done: number; total: number }
  | { kind: "ready" }
  /** The browser or the OS suspended the context after it ran (sleep, device change): the next key resumes. */
  | { kind: "suspended" }
  | { kind: "error"; message: string };

export interface NowPlaying {
  /** "Studio · Sketch 037". */
  label: string;
  stop(): void;
}

interface ShellState {
  /** The current page's title (top bar and document title). */
  title: string;
  setTitle(title: string): void;
  audio: AudioStatus;
  /** True only while a microphone stream is open (the red dot). */
  micLive: boolean;
  /** Closes the open mic stream; set by whoever opened it. */
  closeMic: (() => void) | null;
  nowPlaying: NowPlaying | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** The tutor drawer on medium screens (docked panel state lives in prefs). */
  tutorDrawerOpen: boolean;
  setAudio(audio: AudioStatus): void;
  setMic(live: boolean, close?: (() => void) | null): void;
  setNowPlaying(np: NowPlaying | null): void;
  setPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setTutorDrawerOpen(open: boolean): void;
}

export const useShell = create<ShellState>((set) => ({
  title: "Oak",
  setTitle: (title) => set({ title }),
  audio: { kind: "asleep" },
  micLive: false,
  closeMic: null,
  nowPlaying: null,
  paletteOpen: false,
  shortcutsOpen: false,
  tutorDrawerOpen: false,
  setAudio: (audio) => set({ audio }),
  setMic: (micLive, closeMic = null) => set({ micLive, closeMic: micLive ? closeMic : null }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setTutorDrawerOpen: (tutorDrawerOpen) => set({ tutorDrawerOpen }),
}));

export function audioStatusLabel(a: AudioStatus): string {
  switch (a.kind) {
    case "asleep":
      return "Sound asleep — press any key";
    case "waking":
      return "Waking sound…";
    case "loading":
      return `Loading sounds ${a.total > 0 ? Math.round((a.done / a.total) * 100) : 0}%`;
    case "ready":
      return "Ready";
    case "suspended":
      return "Sound paused — press any key";
    case "error":
      return "Sound unavailable";
  }
}

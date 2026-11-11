// The NavRail's destinations (ux §2.1, contracts §11.9 naming) and their `G`-then-letter shortcuts (ux §7.10).
import { useEffect } from "react";
import { useShell } from "./shell-store.ts";

export type NavId =
  | "today"
  | "oak"
  | "practice"
  | "studio"
  | "transcribe"
  | "album"
  | "toolbox"
  | "progress"
  | "settings";

export interface NavItem {
  id: NavId;
  label: string;
  to: string;
  /** Second key after `G`. */
  gKey: string;
  /** Path prefixes that light this item up. */
  match: (path: string) => boolean;
}

const under = (prefix: string) => (p: string) => p === prefix || p.startsWith(`${prefix}/`);

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "today", label: "Today", to: "/", gKey: "T", match: (p) => p === "/" },
  { id: "oak", label: "The Oak", to: "/oak", gKey: "O", match: under("/oak") },
  { id: "practice", label: "Practice", to: "/practice", gKey: "P", match: under("/practice") },
  { id: "studio", label: "Studio", to: "/studio", gKey: "S", match: under("/studio") },
  { id: "transcribe", label: "Transcribe", to: "/transcribe", gKey: "R", match: under("/transcribe") },
  { id: "album", label: "Album", to: "/album", gKey: "A", match: under("/album") },
  { id: "toolbox", label: "Toolbox", to: "/toolbox", gKey: "B", match: under("/toolbox") },
  { id: "progress", label: "Progress", to: "/progress", gKey: "C", match: under("/progress") },
  { id: "settings", label: "Settings", to: "/settings/audio", gKey: ",", match: under("/settings") },
];

export const SETTINGS_SECTIONS = [
  { id: "audio", label: "Audio" },
  { id: "voice", label: "Voice" },
  { id: "tutor", label: "Tutor" },
  { id: "learning", label: "Learning" },
  { id: "appearance", label: "Appearance" },
  { id: "keys", label: "Keys" },
  { id: "data", label: "Data" },
  { id: "about", label: "About" },
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Sets the top-bar and document title while the page is mounted. */
export function usePageTitle(title: string): void {
  const setTitle = useShell((s) => s.setTitle);
  useEffect(() => {
    setTitle(title);
    document.title = title === "Oak" ? "Oak" : `${title} · Oak`;
  }, [title, setTitle]);
}

// Quiet mode across tabs (contracts §8.5: "may I ask for the mic?" has one answer). Switching Quiet mode on in
// one tab (Settings → Voice, the drill's "Quiet mode for today") must reach a lesson or a drill already open in
// another tab, or that tab would still offer Sing and open the mic. The query cache only refetches a stale
// `GET /voice` when the tab regains visibility, and not within its 10 s stale time; so every surface that asks
// for the mic, and the switch itself, run this hook: a tab that sees Quiet mode change tells the others, and a
// tab that hears it refetches the voice state at once.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useVoiceState } from "../lib/queries.ts";

export const VOICE_CHANNEL = "oak-voice";

/** The message one tab sends when the Quiet mode it reads has changed. */
export interface VoiceChanged {
  kind: "voice-changed";
  quiet: boolean;
}

export const isVoiceChanged = (d: unknown): d is VoiceChanged =>
  typeof d === "object" &&
  d !== null &&
  (d as { kind?: unknown }).kind === "voice-changed" &&
  typeof (d as { quiet?: unknown }).quiet === "boolean";

/**
 * Decides whether this tab announces a change: only a change it saw happen (not the first value it loaded, and
 * not a value it was just told about, which would echo back and forth).
 */
export function shouldAnnounce(
  prev: boolean | undefined,
  next: boolean | undefined,
  heard: boolean | null,
): boolean {
  if (prev === undefined || next === undefined || prev === next) return false;
  return heard !== next;
}

/** Tells every other open tab that this one just switched Quiet mode (the switch calls it on success). */
export function announceQuiet(quiet: boolean): void {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(VOICE_CHANNEL);
  ch.postMessage({ kind: "voice-changed", quiet } satisfies VoiceChanged);
  ch.close();
}

export function useVoiceSync(): void {
  const qc = useQueryClient();
  const voice = useVoiceState();
  const quiet = voice.data?.quiet;
  const prev = useRef<boolean | undefined>(undefined);
  const heard = useRef<boolean | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(VOICE_CHANNEL);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      if (!isVoiceChanged(e.data)) return;
      heard.current = e.data.quiet;
      void qc.invalidateQueries({ queryKey: ["api", "voice.get"] });
      void qc.invalidateQueries({ queryKey: ["api", "profile.get"] });
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [qc]);

  useEffect(() => {
    if (shouldAnnounce(prev.current, quiet, heard.current) && quiet !== undefined)
      channel.current?.postMessage({ kind: "voice-changed", quiet } satisfies VoiceChanged);
    if (quiet !== undefined && heard.current === quiet) heard.current = null;
    prev.current = quiet;
  }, [quiet]);
}

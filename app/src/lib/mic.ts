// The app's one microphone graph (contracts §11: the mic opens only in sing steps and calibration; a "Mic live"
// indicator is always visible while it is open; Cmd/Ctrl+Shift+M closes it). Every caller opens the mic through
// `openMic()`, so the shell's indicator, its close button, the global shortcut and the UI-sound mute can never
// disagree with the real stream. The graph shares the adapter's AudioContext (one context per page).
import type { MicGraph, MicSession, MicState } from "@oak/audio";
import { useShell } from "./shell-store.ts";

let graph: Promise<MicGraph> | null = null;
let releaseUiSounds: (() => void) | null = null;

/** Mirrors the graph's state into the shell: the dot shows exactly while a stream is live. */
export function bindMicState(g: Pick<MicGraph, "subscribe" | "closeAll">, suppress?: () => () => void) {
  return g.subscribe((state: MicState) => {
    const shell = useShell.getState();
    if (state === "live") {
      shell.setMic(true, () => g.closeAll());
      releaseUiSounds ??= suppress?.() ?? null;
    } else {
      if (shell.micLive) shell.setMic(false);
      releaseUiSounds?.();
      releaseUiSounds = null;
    }
  });
}

/** The graph, created on first use (call from a user gesture: it may create the audio adapter). */
export function getMicGraph(): Promise<MicGraph> {
  graph ??= (async () => {
    const [audio, oak] = await Promise.all([
      import("@oak/audio"),
      import("./oak.ts").then((m) => m.getOak()),
    ]);
    const g = audio.createMicGraph(oak.ctx);
    bindMicState(g, () => oak.ui.suppress("mic"));
    return g;
  })().catch((e: unknown) => {
    graph = null;
    throw e;
  });
  return graph;
}

/** Opens the mic (rejects with a `MicError`). Close the session, or press Cmd/Ctrl+Shift+M, to close it. */
export async function openMic(opts: { deviceId?: string | null } = {}): Promise<MicSession> {
  const g = await getMicGraph();
  return g.open(opts);
}

/** Closes any open session. Never creates the graph. (Route changes and Mod+Shift+M go through the shell.) */
export function closeMic(): void {
  void graph?.then((g) => g.closeAll()).catch(() => {});
}

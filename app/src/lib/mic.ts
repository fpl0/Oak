// The app's one microphone graph (contracts §11: the mic opens only in sing steps and calibration; a "Mic live"
// indicator is always visible while it is open; Cmd/Ctrl+Shift+M closes it). Every caller opens the mic through
// `openMic()`, so the shell's indicator, its close button, the global shortcut and the UI-sound mute can never
// disagree with the real stream. The graph shares the adapter's AudioContext (one context per page).
//
// Wave 4 (contracts §8.6, runtime bleed detection): the graph also listens to Oak's own output (the master bus,
// post-limiter), so every mic frame says what was playing (`PitchFrame.playing`): `gradeSung` fails a take whose
// playback-only spans the mic heard as the playback (`sing.bleed`), and a session whose live bleed check trips
// leaves the "the mic hears the playback" hint with its fallback (`reportBleed`, shown by `RecheckHint`), whichever
// surface opened it (a lesson's sing step, a drill's sung resolution, the set-up's pitch match).
import type { MicGraph, MicSession, MicState } from "@oak/audio";
import { reportBleed } from "../voice/recheck.ts";
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
    const g = audio.createMicGraph(oak.ctx, { playback: () => oak.master.analyser });
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
  const session = await g.open(opts);
  watchBleed(session);
  return session;
}

/** A session that hears the playback leaves the bleed hint (once per session). */
export function watchBleed(session: Pick<MicSession, "onBleed">, report: () => void = reportBleed): void {
  session.onBleed?.(() => report());
}

/** Closes any open session. Never creates the graph. (Route changes and Mod+Shift+M go through the shell.) */
export function closeMic(): void {
  void graph?.then((g) => g.closeAll()).catch(() => {});
}

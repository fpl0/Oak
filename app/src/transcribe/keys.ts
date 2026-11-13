// Transcribe's keys (ux §7.10 "Transcription", contracts §11.9 scope `transcription`): every transport action
// has one, and each appears in the shortcut sheet under "Transcribe". They act while focus is in the project
// page outside the editor; inside the Workbench its own keys win (contracts §11.9).
import type { Binding } from "../ui/keys/keymap.ts";

export type TranscribeAction =
  | "play"
  | "setA"
  | "setB"
  | "loop"
  | "rateDown"
  | "rateUp"
  | "semiDown"
  | "semiUp"
  | "centsDown"
  | "centsUp"
  | "abToggle"
  | "overlay"
  | "tap"
  | "prevBar"
  | "nextBar"
  | "zoomIn"
  | "zoomOut"
  | "spectrogram";

export const TRANSCRIBE_KEYS: readonly { action: TranscribeAction; keys: string; description: string }[] = [
  { action: "play", keys: "Space", description: "Play or pause" },
  { action: "setA", keys: "[", description: "Set the loop start (A) at the playhead" },
  { action: "setB", keys: "]", description: "Set the loop end (B) at the playhead" },
  { action: "loop", keys: "L", description: "Loop on or off" },
  { action: "rateDown", keys: ",", description: "Slower by 5 %" },
  { action: "rateUp", keys: ".", description: "Faster by 5 %" },
  { action: "semiDown", keys: "-", description: "Transpose down a semitone" },
  { action: "semiUp", keys: "=", description: "Transpose up a semitone" },
  { action: "centsDown", keys: "_", description: "Fine-tune down 5 cents (Shift+-)" },
  { action: "centsUp", keys: "Plus", description: "Fine-tune up 5 cents (Shift+=)" },
  { action: "abToggle", keys: "V", description: "Switch between the source and your code" },
  { action: "overlay", keys: "O", description: "Hear both together" },
  { action: "tap", keys: "T", description: "Tap the tempo (from a bar's first beat)" },
  { action: "prevBar", keys: "Alt+ArrowLeft", description: "Previous bar" },
  { action: "nextBar", keys: "Alt+ArrowRight", description: "Next bar" },
  { action: "zoomIn", keys: ">", description: "Zoom the waveform in" },
  { action: "zoomOut", keys: "<", description: "Zoom the waveform out" },
  { action: "spectrogram", keys: "Shift+S", description: "Spectrogram on or off" },
];

export const TRANSCRIBE_KEY_GROUP = "Transcribe";

/** The bindings for `useHotkeys`: one per action, scope `transcription`, `run` dispatching to `act`. */
export function transcribeBindings(
  act: (a: TranscribeAction) => void,
  enabled: (a: TranscribeAction) => boolean = () => true,
): Binding[] {
  return TRANSCRIBE_KEYS.map((k) => ({
    id: `transcribe:${k.action}`,
    keys: k.keys,
    scope: "transcription",
    group: TRANSCRIBE_KEY_GROUP,
    description: k.description,
    // Space on a focused button presses the button (the same action for the Play button).
    when: (ctx) => enabled(k.action) && !(k.action === "play" && ctx.onControl),
    run: () => act(k.action),
  }));
}

/** The key shown next to a control ("Space", "[", "V"). */
export function keyOf(action: TranscribeAction): string {
  return TRANSCRIBE_KEYS.find((k) => k.action === action)?.keys ?? "";
}

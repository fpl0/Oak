// Card Preview (contracts §10.7): a card's code plays in an isolated, hidden pattern player, never in the
// learner's editor, after the strict `tutor-card` lint. One preview at a time; the playback coordinator stops
// anything else that plays (and stops the preview when something else starts). Token chips (a degree after its
// cadence, a chord) play through the same adapter as short note events.
import type { LintContext, UnlockableId } from "@oak/content-kit";
import type { OakStrudel, PatternPlayer } from "@oak/strudel";
import { create } from "zustand";
import { getOak } from "../lib/oak.ts";
import { useShell } from "../lib/shell-store.ts";

export interface PreviewState {
  /** The card playing now. */
  cardId: string | null;
  /** The card being loaded. */
  loading: string | null;
  /** Why the last Preview did not play, by card. */
  errors: Record<string, string>;
}

export const usePreview = create<PreviewState>(() => ({ cardId: null, loading: null, errors: {} }));

let player: PatternPlayer | null = null;
let unsubscribe: (() => void) | null = null;

function playerFor(oak: OakStrudel): PatternPlayer {
  if (!player) {
    player = oak.createPatternPlayer();
    // The coordinator stops the preview when another source starts (and on panic stop): reflect that.
    unsubscribe = oak.coordinator.subscribe(() => {
      if (player && !player.playing && usePreview.getState().cardId) {
        usePreview.setState({ cardId: null });
        const np = useShell.getState().nowPlaying;
        if (np?.label.startsWith("Tutor card")) useShell.getState().setNowPlaying(null);
      }
    });
  }
  return player;
}

export function stopPreview(): void {
  player?.stop();
  usePreview.setState({ cardId: null, loading: null });
  const np = useShell.getState().nowPlaying;
  if (np?.label.startsWith("Tutor card")) useShell.getState().setNowPlaying(null);
}

/** Lints (strict `tutor-card` profile, previews allowed) and plays a card's code, looping its bars. */
export async function previewCard(card: {
  cardId: string;
  title: string;
  code: string;
  bars: number;
  unlocked: ReadonlySet<string>;
}): Promise<void> {
  if (usePreview.getState().cardId === card.cardId) {
    stopPreview();
    return;
  }
  usePreview.setState((s) => ({ loading: card.cardId, errors: { ...s.errors, [card.cardId]: "" } }));
  try {
    const oak = await getOak();
    const p = playerFor(oak);
    p.stop();
    const lint: LintContext = {
      profile: "tutor-card",
      unlocked: card.unlocked as ReadonlySet<UnlockableId>,
      allowPreview: true,
      meter: "4/4",
      key: null,
    };
    const bars = Math.max(1, Math.min(16, Math.round(card.bars) || 4));
    const outcome = await p.load(card.code, { bars, cps: 0, lint });
    if (!outcome.ok) {
      const first = outcome.diagnostics.find((d) => d.severity === "error") ?? outcome.diagnostics[0];
      throw new Error(first?.message ?? "Oak could not run this card.");
    }
    p.setLoop({ fromBar: 0, bars });
    await p.play();
    usePreview.setState({ cardId: card.cardId, loading: null });
    useShell.getState().setNowPlaying({ label: `Tutor card: ${card.title}`, stop: stopPreview });
  } catch (e) {
    usePreview.setState((s) => ({
      loading: null,
      cardId: null,
      errors: { ...s.errors, [card.cardId]: e instanceof Error ? e.message : String(e) },
    }));
  }
}

/** Plays chords one after another (a token chip: cadence then degree, or one chord). */
export async function playChords(chords: readonly (readonly number[])[], gapMs = 420): Promise<void> {
  const oak = await getOak();
  stopPreview();
  chords.forEach((notes, i) => {
    setTimeout(
      () =>
        oak.playNote({ s: "piano", note: [...notes], dur: i === chords.length - 1 ? 0.9 : 0.4, gain: 0.8 }),
      i * gapMs,
    );
  });
}

/** Tests and HMR. */
export function disposePreview(): void {
  unsubscribe?.();
  unsubscribe = null;
  player?.dispose();
  player = null;
  usePreview.setState({ cardId: null, loading: null, errors: {} });
}

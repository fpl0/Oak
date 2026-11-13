// "Hear it in another key" (the circle of fifths and the key-signature panel, Wave 3): the learner's code with
// every `.scale()` key moved plays through the adapter's hidden PatternPlayer, the editor untouched. "Use this
// key" is the one explicit edit: the moved arguments go into the editor as a single undoable change (the next
// Run plays and, in the Studio, saves it). Nothing here edits code by itself.
import type { KeySpec, LintContext } from "@oak/content-kit";
import type { BandSetup, EditorHandle, EvalOutcome, MuteMap, OakStrudel, PatternPlayer } from "@oak/strudel";
import { useCallback, useEffect, useRef, useState } from "react";
import { keyName, moveKey, scaleTokens } from "./key-tools.ts";

export interface KeyPreviewOptions {
  oak: OakStrudel;
  handle: EditorHandle | null;
  /** The key the piece is in now (its first `.scale()` key). */
  pieceKey: KeySpec | null;
  bars: number;
  cps: number;
  lint: LintContext;
  readOnly: boolean;
  /**
   * The Band under the code (Wave 4, wave4.md §3.5): the preview plays it too, following the moved key, through
   * `PatternPlayer.load({ band })`. Until the pattern player takes a Band, the preview plays the learner's tracks.
   */
  band?: BandSetup | null;
  /** The mute and solo chips: a muted track stays muted in the preview. */
  mutes?: MuteMap;
}

export interface KeyPreview {
  /** The key being heard now (null: nothing previews). */
  playing: KeySpec | null;
  /** A preview is loading. */
  pending: KeySpec | null;
  /** The code can move key here (it has a string `.scale()` argument). */
  movable: boolean;
  /** Why not, in a sentence, when `movable` is false. */
  why: string | null;
  /** The last thing that went wrong, said plainly. */
  error: string | null;
  /** The last preview played the Band as well (false: the learner's tracks only). */
  withBand: boolean;
  canUse: boolean;
  preview(key: KeySpec): void;
  stop(): void;
  /** Writes the key into the `.scale()` arguments (one undoable edit), then plays the edited code. */
  use(key: KeySpec): void;
}

export function useKeyPreview(o: KeyPreviewOptions): KeyPreview {
  const [playing, setPlaying] = useState<KeySpec | null>(null);
  const [pending, setPending] = useState<KeySpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withBand, setWithBand] = useState(false);
  const player = useRef<PatternPlayer | null>(null);
  const seq = useRef(0);
  const ref = useRef(o);
  ref.current = o;

  const code = o.handle && !o.handle.disposed ? o.handle.getCode() : "";
  const movable = o.pieceKey !== null && scaleTokens(code).length > 0;
  const why = movable
    ? null
    : o.pieceKey === null
      ? "The code has no key yet: write the notes with n() and .scale() to move them."
      : "This code names its notes with letters; only notes written as n() with .scale() can move key here.";

  const stop = useCallback(() => {
    seq.current++;
    player.current?.stop();
    setPlaying(null);
    setPending(null);
  }, []);

  const preview = useCallback((key: KeySpec) => {
    const cur = ref.current;
    if (!cur.handle || cur.handle.disposed || !cur.pieceKey) return;
    const moved = moveKey(cur.handle.getCode(), cur.pieceKey, key);
    if (!moved.code) return;
    const my = ++seq.current;
    setPending(key);
    setError(null);
    void (async () => {
      try {
        await cur.oak.unlock();
        player.current ??= cur.oak.createPatternPlayer();
        const p = player.current;
        const base = { bars: Math.max(1, cur.bars), cps: cur.cps, lint: cur.lint };
        let out: EvalOutcome;
        let banded = false;
        if (cur.band) {
          try {
            out = await p.load(moved.code as string, { ...base, band: cur.band });
            banded = true;
          } catch (e) {
            // The pattern player cannot take a Band yet (StrudelNotBuiltError): the learner's tracks alone.
            if ((e as { code?: string } | null)?.code !== "strudel_not_built") throw e;
            out = await p.load(moved.code as string, base);
          }
        } else out = await p.load(moved.code as string, base);
        if (cur.mutes) p.setMutes(cur.mutes);
        setWithBand(banded);
        if (my !== seq.current) return;
        if (!out.ok) {
          setPending(null);
          setError(`${keyName(key)} did not play: the code has an error to fix first.`);
          return;
        }
        cur.handle?.stop();
        await player.current.play();
        if (my !== seq.current) {
          player.current.stop();
          return;
        }
        setPlaying(key);
        setPending(null);
      } catch (e) {
        if (my !== seq.current) return;
        setPending(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const use = useCallback(
    (key: KeySpec) => {
      const cur = ref.current;
      const h = cur.handle;
      if (!h || h.disposed || !cur.pieceKey || cur.readOnly) return;
      const moved = moveKey(h.getCode(), cur.pieceKey, key);
      if (!moved.code || moved.changes.length === 0) return;
      const wasPreviewing = player.current?.playing ?? false;
      stop();
      h.view.dispatch({ changes: moved.changes, userEvent: "input.key" });
      if (wasPreviewing) void h.play();
    },
    [stop],
  );

  useEffect(
    () => () => {
      seq.current++;
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  return {
    playing,
    pending,
    movable,
    why,
    error,
    withBand,
    canUse: movable && !o.readOnly,
    preview,
    stop,
    use,
  };
}

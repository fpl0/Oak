// What a track capstone's session shows above the Workbench (Wave 7): the sound the session opened, and the card of
// its capstone: JC3's form plan with the bridge, RC2's clave lens, JC4's analysis (session 1, through transcribe's
// public analysis stage), its reharmonisation with the melody locked (session 2) and its voice-leading (session 3),
// AC2's voicings and, in its last session, the mix. Every card reads the piece now in the editor.
import type { CapstoneDef, SongDef, ToolEntry, UnlockableId } from "@oak/api";
import type { KeySpec } from "@oak/content-kit";
import { isNotBuilt, reharmView, type SongMelodyNote } from "@oak/grader";
import type { BandSetup } from "@oak/strudel";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { type AnalysisResult, AnalysisStage, analysable, analysisSourceOf } from "../transcribe/index.ts";
import type { CheckOutcome } from "./engine.ts";
import {
  ClaveCard,
  FormPlanCard,
  FoundCard,
  MixCard,
  ReharmCard,
  SessionLinesNote,
  SessionUnlockNote,
} from "./TrackCards.tsx";
import {
  deviceTally,
  melodyTouched,
  missingSessionLines,
  originalChanges,
  reharmRows,
  sessionStartUnlocks,
} from "./tracks.ts";
import type { PieceForm } from "./wave5.ts";
import { chordsInBarsFound, type PieceRead7, topVoiceFound, voicingRows } from "./wave7.ts";

export function TrackSessionCards({
  def,
  sessionId,
  sessionIndex,
  unlocked,
  toolbox,
  outcome,
  form,
  song,
  songMelody,
  onBars,
  onAnalysis,
  band = null,
  songKey = null,
  code = "",
  onAddLines,
  songLoading = false,
}: {
  def: CapstoneDef;
  /** The session worked in now; `null` once every session is done. */
  sessionId: string | null;
  sessionIndex: number;
  unlocked: ReadonlySet<UnlockableId>;
  toolbox: readonly ToolEntry[];
  /** The live check of the code now in the editor (`null` while it is being re-read). */
  outcome: CheckOutcome | null;
  form: PieceForm | null;
  song: SongDef | null;
  songMelody: readonly SongMelodyNote[] | null;
  sketchId: string | null;
  /** The Band playing with the piece (the mix measures it with the learner's parts), and the piece's key. */
  band?: BandSetup | null;
  songKey?: KeySpec | null;
  /** The picked song is still loading (JC4 says nothing about it until it has loaded or is known missing). */
  songLoading?: boolean;
  /** The code in the editor (for the lines this session offers) and how to add them to it. */
  code?: string;
  onAddLines?(lines: readonly string[]): void;
  onBars(from: number, to: number): void;
  onAnalysis(done: boolean): void;
}) {
  const rubric = def.brief?.rubric ?? [];
  const total = def.sessionDefs.length;
  const last = sessionId === null || sessionIndex >= total - 1;
  // A sound granted when this session started (the first session's are shown on the start page).
  const opened =
    sessionId && sessionIndex > 0
      ? sessionStartUnlocks(toolbox, sessionId).filter((t) => unlocked.has(t.id as UnlockableId))
      : [];
  const sessionTitle = sessionId ? `Session ${sessionIndex + 1}` : "This session";
  const piece: PieceRead7 | null =
    outcome?.n && outcome.result.status !== "error"
      ? {
          n: outcome.n,
          code: outcome.code,
          meter: def.meter,
          bars: outcome.bars,
          analysis: outcome.analysis,
          form,
          songMelody,
          songTitle: song?.title ?? null,
        }
      : null;
  const cards: React.ReactNode[] = [];

  // JC3: the AABA plan, the bridge's chords.
  const formRule = rubric.find((r) => r.rule === "form" && r.pattern === "AABA");
  if (formRule) {
    const barsRule = rubric.find((r) => r.rule === "bars" && r.min === r.max);
    const totalBars = barsRule?.rule === "bars" && barsRule.min ? barsRule.min : 32;
    const len = Math.round(totalBars / 4);
    const bridge =
      piece && piece.bars >= len * 3 ? (chordsInBarsFound(piece, [len * 2 + 1, len * 3])[0] ?? null) : null;
    cards.push(
      <FormPlanCard
        key="form"
        pattern="AABA"
        totalBars={totalBars}
        form={form}
        onBars={onBars}
        bridgeChords={bridge?.ok ? bridge.text.replace(/^[^:]+: /, "").replace(/\.$/, "") : null}
      />,
    );
  }

  // RC2: the clave lens.
  const claveRule = rubric.find((r) => r.rule === "clave");
  if (claveRule?.rule === "clave" && piece)
    cards.push(
      <ClaveCard
        key="clave"
        n={piece.n}
        bars={piece.bars}
        track={String(claveRule.track ?? "perc")}
        want={{
          type: claveRule.type === "rumba" ? "rumba" : "son",
          direction: claveRule.direction === "2-3" ? "2-3" : "3-2",
        }}
        onBars={onBars}
      />,
    );

  // JC4: analyse, reharmonise with the melody locked, voice-lead.
  if (def.id === "JC4" && !songLoading) {
    if (!song)
      cards.push(
        <p key="no-song" className="text-sm text-text-2" data-testid="jc4-no-song">
          Oak's renditions of Georgia on My Mind and Body and Soul are still being written and checked against
          their 1930 sources. Until one is ready there is no melody to keep and no chart to analyse; nothing
          else waits on it.
        </p>,
      );
    else if (sessionIndex === 0 && sessionId !== null)
      cards.push(<AnalysisCard key="analysis" song={song} onAnalysis={onAnalysis} />);
    else if (piece) {
      const view = reharmView(piece.n, {
        meter: def.meter,
        bars: piece.bars,
        reference: originalChanges(song),
        ...(songMelody ? { melody: songMelody } : {}),
      });
      const deviceRule = rubric.find((r) => r.rule === "device-count");
      const min = deviceRule?.rule === "device-count" ? deviceRule.min : 3;
      if (!isNotBuilt(view))
        cards.push(
          <ReharmCard
            key="reharm"
            songTitle={song.title}
            rows={reharmRows(view)}
            tally={deviceTally(view, min)}
            touched={melodyTouched(piece.code, song)}
            onBars={onBars}
          />,
        );
      if (sessionIndex >= 2 || last)
        cards.push(
          <FoundCard
            key="voices"
            title="Voice-leading"
            testId="voice-leading-card"
            items={[...topVoiceFound(piece, "@chords", 2, 0.8), ...voicingRows(piece, "@chords")].slice(0, 5)}
            onBars={onBars}
          />,
        );
    }
  }

  // AC2: the voicings, and the mix in its last session.
  if (def.id === "AC2" && piece) {
    cards.push(
      <FoundCard
        key="voicings"
        title="Voicings"
        testId="voicings-card"
        items={voicingRows(piece, "@chords")}
        onBars={onBars}
      />,
    );
    if (last)
      cards.push(
        <MixCard key="mix" n={piece.n} bars={piece.bars} code={piece.code} band={band} songKey={songKey} />,
      );
  }

  const lines = onAddLines ? missingSessionLines(sessionId, code) : [];
  if (opened.length === 0 && cards.length === 0 && lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="track-cards">
      <SessionUnlockNote tools={opened} sessionTitle={sessionTitle} />
      <SessionLinesNote lines={lines} sessionTitle={sessionTitle} onAdd={() => onAddLines?.(lines)} />
      {cards}
    </div>
  );
}

/** JC4.S1: the standard's chart analysed with transcribe's analysis stage; the session ends once it is checked. */
function AnalysisCard({ song, onAnalysis }: { song: SongDef; onAnalysis(done: boolean): void }) {
  const [last, setLast] = useState<AnalysisResult | null>(null);
  if (!analysable(song))
    return (
      <p className="text-sm text-text-2" data-testid="jc4-no-chart">
        {song.title} has no chart and form map in Oak yet, so this session's analysis cannot be checked.
        Reharmonise from its lead sheet in the next session.
      </p>
    );
  const done = last !== null && (last.check.passed || last.revealed);
  return (
    <section className="flex flex-col gap-2" data-testid="jc4-analysis">
      <AnalysisStage
        source={analysisSourceOf(song)}
        title={`The analysis: ${song.title}`}
        onChecked={(r) => {
          setLast(r);
          if (r.check.passed || r.revealed) onAnalysis(true);
        }}
      />
      {done && (
        <p
          className="flex items-center gap-1.5 text-sm text-text-2"
          role="status"
          data-testid="jc4-analysis-done"
        >
          <CheckCircle2 aria-hidden className="size-4 text-accent" />
          {last?.revealed
            ? "The analysis is shown. Next session you reharmonise it; the melody stays as written."
            : "The analysis holds. Next session you reharmonise it; the melody stays as written."}
        </p>
      )}
    </section>
  );
}

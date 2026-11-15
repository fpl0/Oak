// The gym's own pages after the core (Wave 7): a generated jazz chart or rhythm item (`/transcribe?item=…`) and a
// standard's analysis (`/transcribe?analyse=song.…`). Each plays its source as a pattern source and checks what
// the learner writes in the browser, bar by bar; nothing here is graded evidence on the server (apiNotes: the gym's
// jazz and rhythm items have no server item yet). Serving an item writes it to the gym log, so it is not served
// again inside two weeks.
import type { SongId } from "@oak/content-kit";
import type { ChordSymbolStyle } from "@oak/notation";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useGymPlan, useUnlocks } from "../lib/queries.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, PageHeader, Skeleton } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { AnalysisStage } from "./AnalysisStage.tsx";
import { analysable, analysisSourceOf } from "./analysis-source.ts";
import { localDay } from "./gym-after-core.ts";
import { type GymItem, gymItemOf, itemCps } from "./gym-items.ts";
import { logGymSource } from "./gym-log.ts";
import { JazzChart } from "./JazzChart.tsx";
import { checkJazzChart, type JazzChartCheck, parseChartCell } from "./jazz-chart.ts";
import { PatternSource } from "./PatternSource.tsx";
import { RhythmLab } from "./RhythmLab.tsx";
import { checkRhythmLab, type RhythmAnswer, type RhythmLabCheck } from "./rhythm-lab.ts";
import { useRepertoireSong } from "./songs.ts";
import { REF_PREFIX, type StimulusCode } from "./stimulus-code.ts";

const JAZZ_GLYPHS = "tb.feature.jazz-glyphs";

/** The learner's chord style: jazz glyphs once J1.L02 gave them the toggle (`tb.feature.jazz-glyphs`). */
export function useChordStyle(): ChordSymbolStyle {
  const unlocks = useUnlocks();
  return unlocks.data?.items.some((u) => u.itemId === JAZZ_GLYPHS) ? "jazz" : "lead-sheet";
}

function Back() {
  return (
    <Link to="/transcribe" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
      <ArrowLeft aria-hidden className="size-4" /> Transcribe
    </Link>
  );
}

export function GymItemPage({ itemId }: { itemId: string }) {
  const item = useMemo(() => gymItemOf(itemId), [itemId]);
  useEffect(() => {
    if (item) logGymSource(item.id, localDay());
  }, [item?.id]);
  if (!item)
    return (
      <>
        <Back />
        <Callout tone="attention" title="That gym item doesn't exist">
          Go back to Transcribe and pick one from the gym.
        </Callout>
      </>
    );
  return <ItemBody key={item.id} item={item} />;
}

function ItemBody({ item }: { item: GymItem }) {
  const style = useChordStyle();
  const [cells, setCells] = useState<string[]>(() => Array.from({ length: item.bars }, () => ""));
  const [chartCheck, setChartCheck] = useState<JazzChartCheck | null>(null);
  const [answers, setAnswers] = useState<Record<string, RhythmAnswer>>({});
  const [labCheck, setLabCheck] = useState<RhythmLabCheck | null>(null);
  const [revealed, setRevealed] = useState(false);
  const checked = chartCheck !== null || labCheck !== null;
  const passed = chartCheck?.passed || labCheck?.passed;
  const barMarks =
    item.kind === "jazz" && chartCheck
      ? new Map(chartCheck.bars.map((b) => [b.bar - 1, b.ok ? ("ok" as const) : ("issue" as const)]))
      : undefined;
  return (
    <div className="flex flex-col gap-4" data-testid="gym-item" data-item={item.id}>
      <Back />
      <PageHeader
        title={item.title}
        sub={
          item.kind === "jazz"
            ? `Transcription Gym · a jazz chart · ${item.bars} bars at ${item.bpm} BPM, swung 8ths`
            : `Transcription Gym · rhythm · ${item.meter} at ${item.bpm} BPM`
        }
      />
      <Card className="p-4">
        <PatternSource
          stimulus={item.stimulus}
          bars={item.bars}
          cps={itemCps(item)}
          meter={item.meter}
          feel={item.feel}
          grouping={item.grouping}
          preload={item.preload}
          clave={item.kind === "rhythm" && (passed || revealed) ? item.clave : null}
          {...(barMarks ? { barMarks } : {})}
          label={`${item.title}: the source`}
          autoFocus
        />
      </Card>
      <Card className="p-4">
        {item.kind === "jazz" ? (
          <JazzChart
            bars={item.bars}
            value={cells}
            onChange={setCells}
            style={style}
            check={revealed ? null : chartCheck}
            revealed={revealed ? item.chart : null}
            onCheck={() =>
              setChartCheck(
                checkJazzChart(
                  item.chart,
                  cells.map((c) => parseChartCell(c)),
                ),
              )
            }
            label="Your chart"
          />
        ) : (
          <RhythmLab
            tasks={item.tasks}
            answers={answers}
            onAnswer={(id, a) => setAnswers((x) => ({ ...x, [id]: a }))}
            check={revealed ? null : labCheck}
            onCheck={() => setLabCheck(checkRhythmLab(item.tasks, answers))}
            revealed={revealed}
            groups={item.grouping}
          />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {checked && !passed && !revealed ? (
            <Button variant="ghost" onClick={() => setRevealed(true)} data-testid="gym-reveal">
              {item.kind === "jazz" ? "Show the chart" : "Show the answers"}
            </Button>
          ) : null}
          {revealed ? (
            <p className="text-sm text-text-2" role="status" data-testid="gym-revealed">
              Shown. Loop the bars you missed and listen for them now that you know where they are.
            </p>
          ) : null}
          {passed ? (
            <p className="text-sm" role="status" data-testid="gym-done">
              Done. The gym won't serve this one again for two weeks.{" "}
              <Link to="/transcribe" className="underline">
                Back to the gym
              </Link>
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

/** A song's layers as one hidden pattern, each line labelled `ref_…` (played, never shown). */
function songStimulus(layers: Partial<Record<"drums" | "bass" | "chords" | "melody", string>>): StimulusCode {
  const lines: string[] = [];
  const tracks: string[] = [];
  for (const [name, code] of Object.entries(layers)) {
    if (!code) continue;
    const label = `${REF_PREFIX}${name === "melody" ? "mel" : name}`;
    const sound = /\.s\(|\.sound\(/.test(code) ? "" : '.s("piano")';
    lines.push(`${label}: ${code}${sound}`);
    tracks.push(label);
  }
  return { code: lines.join("\n"), tracks };
}

export function AnalysisPage({ songId }: { songId: string }) {
  const gym = useGymPlan();
  const song = useRepertoireSong(songId as SongId);
  const style = useChordStyle();
  useEffect(() => {
    logGymSource(`analysis:${songId}`, localDay());
  }, [songId]);
  const cfTDone = gym.data?.cfT?.status === "released";
  if (gym.isPending || song.isPending)
    return (
      <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading the song">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (!cfTDone)
    return (
      <>
        <Back />
        <Callout tone="info" title="Opens when your Standard Transcription is released">
          A standard's changes are what CF-T asks you to hear; its analysis waits until that is done.
        </Callout>
      </>
    );
  const def = song.data;
  if (!def || !analysable(def))
    return (
      <>
        <Back />
        <Callout tone="info" title="This song has no chart to analyse yet">
          Its answer key is still being checked against the printed song.
        </Callout>
      </>
    );
  const source = analysisSourceOf(def);
  const units = def.meter === "3/4" ? 3 : def.meter === "2/4" ? 2 : 4;
  return (
    <div className="flex flex-col gap-4" data-testid="analysis-page" data-song={def.id}>
      <Back />
      <PageHeader
        title={`${def.title}: the analysis`}
        sub={`Transcription Gym · ${def.year === "trad" ? "trad." : def.year} · the chart is given; the numerals, the ii–Vs and the form are yours`}
      />
      <Card className="p-4">
        <PatternSource
          stimulus={songStimulus(def.answerKey.layers)}
          bars={def.answerKey.bars + (def.pickup ? 1 : 0)}
          pickup={def.pickup !== undefined}
          cps={def.bpm / 60 / units}
          meter={def.meter}
          feel={def.swing ? "swing" : "straight"}
          preload={["piano", "upright", "rd", "bd", "sd"]}
          claveKey={false}
          label={`${def.title}: Oak's setting`}
          autoFocus
        />
      </Card>
      <Card className="p-4">
        <AnalysisStage source={source} style={style} />
      </Card>
    </div>
  );
}

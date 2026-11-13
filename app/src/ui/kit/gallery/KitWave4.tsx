// Specimens of the Wave 4 kit pieces in their states, for review and for kit/e2e/wave4.pw.ts. It needs no router
// and no server, so it can sit on /dev/kit (session owner: `<KitWave4 />` under the Wave 3 sections) or be mounted
// on its own with `mountKitWave4` (what the spec does, so it never depends on another area's page).
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, StrictMode, useContext, useState } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "../../../lib/query-client.ts";
import { AlbumCover } from "../../AlbumCover.tsx";
import { Button } from "../Button.tsx";
import { Card, Chip } from "../basics.tsx";
import { Checklist, type ChecklistItem } from "../Checklist.tsx";
import { FileDropZone } from "../FileDropZone.tsx";
import { FineSlider } from "../FineSlider.tsx";
import { MediaCard } from "../MediaCard.tsx";
import { bytesLabel, centsLabel } from "../model.ts";
import { Toaster, toast } from "../Toast.tsx";
import { AbSwitch, TransportBar } from "../Transport.tsx";
import { VersionList } from "../VersionList.tsx";

/** One heading level below the gallery's own title (`h2` alone, `h3` nested in /dev/kit). */
const SpecimenLevel = createContext<2 | 3>(2);

function Specimen({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const H = useContext(SpecimenLevel) === 3 ? "h3" : "h2";
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-kit-section={id}>
      <H id={id} className="text-h3">
        {title}
      </H>
      <Card className="flex flex-col gap-4 p-4">{children}</Card>
    </section>
  );
}

const C2_CHECKS: ChecklistItem[] = [
  { id: "loop", label: "Bars 1–6 loop I–V–vi–IV", state: "met" },
  {
    id: "cadence",
    label: "Bars 7–8 land with a cadence",
    state: "unmet",
    detail: "Bar 8 ends on vi. Try V then I.",
    action: (
      <Button size="sm" variant="ghost" onClick={() => toast.info("Show me where", "A specimen.")}>
        Show me where
      </Button>
    ),
  },
  { id: "tones", label: "Chord tones on the strong beats", state: "partial", stateText: "7 of 10 beats" },
  { id: "motif", label: "A motif comes back", state: "pending" },
  {
    id: "phrase-2",
    label: "Phrase 2",
    state: "revealed",
    detail: "Shown, so it is named in the liner notes.",
  },
  { id: "rn", label: "Stage 3: Roman numerals", state: "locked" },
  { id: "title", label: "A title", state: "optional" },
  { id: "run", label: "Plays without errors", state: "running" },
];

/**
 * `nested`: mounted inside another page that has its own `h1` (/dev/kit): the gallery's title is an `h2` and its
 * specimens `h3`, so the page keeps one `h1`.
 */
export function KitWave4({ nested = false }: { nested?: boolean } = {}) {
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [rate, setRate] = useState(0.75);
  const [semis, setSemis] = useState(0);
  const [cents, setCents] = useState(0);
  const [side, setSide] = useState<"source" | "mine" | "both">("source");
  const [two, setTwo] = useState<"a" | "b">("a");
  const [version, setVersion] = useState(3);
  const [file, setFile] = useState<string | null>(null);
  const [volume, setVolume] = useState(70);
  const [cardPlaying, setCardPlaying] = useState(false);
  return (
    <SpecimenLevel.Provider value={nested ? 3 : 2}>
      <div className="mx-auto flex max-w-page flex-col gap-8 p-6" data-testid="kit-wave4">
        <header>
          {nested ? (
            <h2 className="text-h1">UI kit · Wave 4</h2>
          ) : (
            <h1 className="text-h1">UI kit · Wave 4</h1>
          )}
          <p className="mt-1 text-text-2">
            Transport, sliders, A/B, checklists, versions, files and album tracks.
          </p>
        </header>

        <Specimen id="w4-transport" title="TransportBar">
          <TransportBar
            playing={playing}
            onPlayToggle={() => setPlaying((p) => !p)}
            position={83.4}
            duration={160}
            loop={{ on: loop, onToggle: () => setLoop((l) => !l), range: "bars 3–4", key: "L" }}
            rate={{ value: rate, onChange: setRate, keys: [",", "."] }}
            pitch={{
              semitones: semis,
              onSemitones: setSemis,
              keys: ["-", "="],
              cents,
              onCents: setCents,
            }}
          >
            <AbSwitch
              label="Hear"
              value={side}
              onChange={setSide}
              keyHint="V"
              options={[
                { value: "source", letter: "A", label: "Source" },
                { value: "mine", letter: "B", label: "Mine" },
                { value: "both", letter: "A+B", label: "Both" },
              ]}
            />
          </TransportBar>
          <TransportBar
            label="Transport, nothing loaded"
            playing={false}
            onPlayToggle={() => undefined}
            loop={{ on: false, onToggle: () => undefined, range: null }}
            disabled
          />
        </Specimen>

        <Specimen id="w4-slider" title="FineSlider">
          <FineSlider
            label="Volume"
            showLabel
            value={volume}
            min={0}
            max={100}
            step={5}
            fine={1}
            coarse={20}
            format={(v) => `${v} %`}
            defaultValue={70}
            onChange={setVolume}
          />
          <FineSlider
            label="Fine-tune"
            showLabel
            value={cents}
            min={-50}
            max={50}
            step={5}
            fine={1}
            coarse={25}
            origin={0}
            marks={[0]}
            defaultValue={0}
            format={centsLabel}
            onChange={setCents}
          />
          <FineSlider
            label="Speed (disabled)"
            showLabel
            value={0.5}
            min={0.25}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)} %`}
            onChange={() => undefined}
            disabled
          />
          <p className="text-sm text-text-2">
            Arrows move one step, Alt+arrows a fine step, Shift+arrows or Page Up/Down a coarse one.
          </p>
        </Specimen>

        <Specimen id="w4-ab" title="AbSwitch">
          <AbSwitch
            label="Compare two takes"
            value={two}
            onChange={setTwo}
            options={[
              { value: "a", letter: "A", label: "Original" },
              { value: "b", letter: "B", label: "Your code" },
            ]}
          />
        </Specimen>

        <Specimen id="w4-checklist" title="Checklist">
          <Checklist label="C2 checklist" items={C2_CHECKS} />
        </Specimen>

        <Specimen id="w4-versions" title="VersionList">
          <div className="max-w-md">
            <VersionList
              label="Versions of “Porch Light”"
              selected={version}
              onSelect={setVersion}
              items={[
                { version: 1, when: "3 Nov", note: "First release." },
                { version: 2, name: "Brighter chorus", when: "6 Nov" },
                {
                  version: 3,
                  when: "12 Nov",
                  note: "The loop lands on I in bar 8 now.",
                  badges: <Chip tone="accent">reviewed</Chip>,
                },
              ]}
              actions={(v) => (
                <Button size="sm" variant="ghost" onClick={() => toast.info(`Compare with v${v.version}`)}>
                  Compare
                </Button>
              )}
            />
          </div>
        </Specimen>

        <Specimen id="w4-drop" title="FileDropZone">
          <div className="grid gap-4 md:grid-cols-2">
            <FileDropZone
              title="Bring a recording"
              hint="It stays on this device."
              accept={["audio/*", ".mp3", ".wav", ".flac", ".ogg", ".m4a"]}
              kinds="MP3, WAV, FLAC, OGG or M4A"
              maxBytes={300 * 1024 * 1024}
              onFile={(f) => setFile(`${f.name} · ${bytesLabel(f.size)}`)}
              data-testid="drop-audio"
            />
            <FileDropZone
              title="Uploading"
              hint="A specimen of the busy state."
              onFile={() => undefined}
              busy
            />
          </div>
          <p className="text-sm text-text-2" aria-live="polite" data-testid="drop-result">
            {file ? `Taken: ${file}` : "No file taken yet."}
          </p>
        </Specimen>

        <Specimen id="w4-media" title="MediaCard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MediaCard
              cover={<AlbumCover seed="kit-c2" title="Porch Light" />}
              title="Porch Light"
              titleText="Porch Light"
              subtitle="C2 · Four-Chord Song"
              meta="v3 · 12 Nov"
              durationS={42}
              playing={cardPlaying}
              onPlay={() => setCardPlaying((p) => !p)}
              badges={<Chip tone="accent">reviewed</Chip>}
            />
            <MediaCard
              cover={<AlbumCover seed="kit-x1" title="Aura Lee" />}
              title="Aura Lee"
              titleText="Aura Lee"
              subtitle="X1 · Folk Transcription"
              meta="v1 · 14 Nov"
              playDisabledReason="no recording yet"
            />
          </div>
          <MediaCard
            layout="row"
            cover={<AlbumCover seed="kit-c0" title="Intro" />}
            title="Intro"
            titleText="Intro"
            subtitle="C0 · Intro"
            meta="v2 · 1 Oct"
            durationS={24}
            onPlay={() => toast.info("Play “Intro”", "A specimen.")}
            actions={
              <Button size="sm" variant="ghost" onClick={() => toast.info("Liner notes", "A specimen.")}>
                Liner notes
              </Button>
            }
          />
        </Specimen>
      </div>
    </SpecimenLevel.Provider>
  );
}

/** Renders the specimens on their own (a spec mounts it on any app page); returns the unmount. */
export function mountKitWave4(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <KitWave4 />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
  return () => root.unmount();
}

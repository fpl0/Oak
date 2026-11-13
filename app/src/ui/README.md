# app/src/ui — the shared kit, shell and keys

Owner: **kit** (docs/design/wave4.md §1). Everyone else imports from here and never edits it; ask under `apiNotes`.

## New in Wave 5 (use these instead of a local copy)

All exported from `kit/index.ts`; specimens in both themes in `kit/gallery/KitWave5.tsx` (`mountKitWave5`, screenshot by
`kit/e2e/wave5.pw.ts`). Pure rules in `kit/model-w5.ts` (unit-tested).

| Piece | File | What it is for |
|---|---|---|
| `SectionRibbon` | `kit/SectionRibbon.tsx` | The sections of a piece as labelled blocks as wide as their bars (`RibbonSection`: `tag`, `text`, `letter`, `startBar`, `bars`, `energy?`; a `FormViewSection` from `lib/form-view.ts` fits as is). One tab stop: arrows move, Home/End, Enter or Space loops the focused section (again: stops), Esc stops; a click loops. `loopTag` + `onLoop` (loopable), `selectedTag` + `onSelect` (a form answer), `currentBar` (a playhead), `pickup` (bars count from the first full bar, c4), `problem` (the tracks disagree: a sentence, never a wrong form), `empty`. Blocks under a tenth of the ribbon show their letter alone. The Workbench keeps its own ribbon on the roll's time axis; this one stands alone (a brief, a prompt, the Coda). |
| `BarGrid` | `kit/BarGrid.tsx` | A grid of bar boxes, four a line (the twelve-bar chart, a 16-bar form). `cells: { content, text?, state? }[]` with states `empty` (a slash a beat), `given`, `filled`, `met`, `unmet` (icon + words). One tab stop: arrows move a box, up/down a line, Home/End the line, Mod+Home/End the grid; `selected` + `onSelect`, `current` (playing), `lineLabels` ("I", "IV", "V"), `firstBar`. |
| `LineChart` | `kit/LineChart.tsx` | A small line chart of one series (the energy curve): SVG line and area, HTML points and labels (a run of equal labels prints once), `marked` point, one accessible sentence naming the lowest and highest points (`chartSummary`), `table` adds a visually hidden table, `empty` text. |
| `ScopeFrame` | `kit/ScopeFrame.tsx` | The frame Oak's scope, spectrum and probe curves draw in: a DPR-sized canvas, the grid at the axis ticks, HTML tick labels that thin out so none overlap (`thinTicks`), `x`/`y` `AxisSpec` (`linear` / `log`, unit, label, ticks), an `empty` sentence ("Press Play to see the wave"), `header`, `description`. `live` redraws every frame — at most 10 a second under reduced motion (wave5.md §4.4); otherwise it redraws on `frameKey`, size and theme. You draw in `draw(ctx, plot)` with `plot.x(v)`, `plot.y(v)` and the theme's `plot.colours`. |
| `ControlReadout` | `kit/ControlReadout.tsx` | One sound control, knob-less: label, its method in code (`.lpf()`), the value large with its unit ("800 Hz"), a slider on the control's own scale (`log`: a step is a half step of frequency, Shift an octave, Alt a quarter of a half step; `linear`: `step` / `fine` / `coarse`), Home/End, PageUp/PageDown, a Reset to `defaultValue`, `help`. `role="slider"` carries the real value. |
| helpers | `kit/model-w5.ts` | `barNumber`, `barSpanText` ("bars 5–8", "the pickup and bars 1–4"), `axisFraction`, `axisValue`, `axisTicks`, `unitLabel` ("1.2 kHz", "250 ms", "−12 dB"), `chartSummary` (exported from the index); `ribbonKey`, `gridMove`, `controlKeyValue`, `thinTicks` (internal, tested). |

## Shell and settings (Wave 5)

- The shortcut sheet has a section **Sections, charts and sound controls** (the kit pieces' keys). Workbench lens and
  panel keys whose tool is not unlocked yet stay listed but say when they open ("Opens with U09 · Form", "Opens with
  the side lesson Waves & Harmonics"), from the owners' tables (`workbench/panels.ts`, `lib/lenses.ts`) and the
  course (`keys/locks.ts`). Nothing is marked before the unlock list loads.
- The command palette lists side lessons as optional ("Optional side lesson", "Side lesson · opens after …",
  "Side lesson · done"): the server's `sideLessons.list` answer when a page loaded it, else the unlock list
  (`shell/side-lessons.ts`). It never fetches for it.
- Settings › Data lists the album's recordings (each version with a take: place, length, size, on the album or an
  earlier version) with the server's total, and the own-audio recordings that deleted projects left behind.

## New in Wave 4 (use these instead of a local copy)

| Piece | File | What it is for |
|---|---|---|
| `TransportBar` | `kit/Transport.tsx` | Play/pause with its key, clock (`position` / `duration` in s), A–B `loop` (on, range in words, key), `rate` (FineSlider, 25–100 % default, 5 % steps, 1 % with Alt), `pitch` (±12 st Nudge, optional ±50¢ fine-tune). Draws and reports only; the owner keeps the audio state and binds the keys. |
| `FineSlider` | `kit/FineSlider.tsx` | A slider with fine keyboard steps: arrows `step`, Alt+arrows `fine`, Shift+arrows and PageUp/PageDown `coarse`, Home/End. `origin` fills from a centre; `defaultValue` adds a Reset; `marks` draws ticks. `role="slider"` with `aria-valuetext`. |
| `Nudge` | `kit/Transport.tsx` | A `−  value  +` control for whole steps (semitones), naming its keys. |
| `AbSwitch` | `kit/Transport.tsx` | The segmented A/B switch with letter badges ("A Source · B Mine · A+B Both"), roving arrows, optional key hint. |
| `Checklist` | `kit/Checklist.tsx` | Lines with a state each: `met`, `partial`, `unmet`, `pending`, `running`, `revealed`, `locked`, `optional`; icon + words, never colour alone; "3 of 5 met" summary; a detail line and an action per line. |
| `VersionList` | `kit/VersionList.tsx` | Versions newest first, the open one `aria-current`, "latest" marked, ArrowUp/ArrowDown between rows, row actions beside the row button. |
| `FileDropZone` | `kit/FileDropZone.tsx` | Drop or choose a file; refuses wrong type, empty or over-limit files with a sentence; `busy` while you upload. Pass `accept={AUDIO_UPLOAD_TYPES}`-style rules and `maxBytes={AUDIO_UPLOAD_MAX_BYTES}`. |
| `MediaCard` | `kit/MediaCard.tsx` | An album track as a card (`tile` for a grid, `row` for a list): cover slot, title node (make it a Link), subtitle, meta, length, play button that names the track or says why there is nothing to play. |
| helpers | `kit/model.ts` | `rateLabel`, `semitoneLabel`, `centsLabel`, `clockLabel`, `bytesLabel`, `fileProblem`, `acceptsFile`, `checklistSummary`, `versionLabel` (all unit-tested). |

All of it is exported from `kit/index.ts`. A specimen of each, in both themes, is in `kit/gallery/KitWave4.tsx`
(`kit/e2e/wave4.pw.ts` screenshots it).

## Shell (Wave 4)

- The NavRail marks **Transcribe** (opens with `tb.feature.transcribe`, U07.L01) and **Album** (`tb.feature.album`,
  the first capstone session) honestly: before the unlock the item is quieter, carries a small lock and its
  tooltip says when it opens. Both stay reachable (contracts §7.6 rule 6: never gated). `shell/nav-state.ts`.
- The shortcut sheet lists Transcribe's keys (from `transcribe/keys.ts`) and the harmony answers' keys from any
  page; register your own section with `registerShortcutSection` (`keys/sheet.ts`). Rows with several keys may be
  written "A B C" or "ArrowRight / ArrowLeft": the sheet shows them as keys, not as a sequence.

## Rules

- Colours only from `--oak-*` tokens (`theme/tokens.css`); Paper and Bark must both read at WCAG AA.
- Every control has a visible focus ring (global `:focus-visible`), an accessible name and a keyboard path.
- Motion obeys `reduced:` (≤ 120 ms cross-fades).

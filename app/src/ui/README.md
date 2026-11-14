# app/src/ui — the shared kit, shell and keys

Owner: **kit** (docs/design/wave4.md §1). Everyone else imports from here and never edits it; ask under `apiNotes`.

## New in Wave 6 (use these instead of a local copy)

`KeyStrip`, `DeviceCounter`, `LoudnessReadout`, `AlbumPlayerBar`, `BranchCard` — all exported from `kit/index.ts`;
specimens in both themes in `kit/gallery/KitWave6.tsx` (`mountKitWave6`, screenshot and keyboard-tested by
`kit/e2e/wave6.pw.ts`). Pure rules in `kit/model-w6.ts` (unit-tested in `model-w6.test.ts`). Each piece draws and
reports only: the owner measures, plays and words the music (`@oak/theory`, the grader's views, the server's notes).

| Piece | File | What it is for |
|---|---|---|
| `KeyStrip` | `kit/KeyStrip.tsx` | The key in force along a piece: segments as wide as their bars, every change a heavy bar line with its distance in words above it ("+2: up a whole step", never colour alone). `segments: KeySegment[]` (`text`, `startBar` 0-based, `bars`, `change`, `sounding`); `keySegments(spans, { pickup, totalBars })` turns the 1-based spans of the grader's `keyPlanView` into them, `keyChangeWords(keyDistance(...))` words a change. One tab stop: arrows, Home/End, Enter/Space picks (`onSelect`, `selectedId`); `currentBar` outlines and names the key that sounds; a narrow segment prints "D", "Em", "+2" and keeps the full name in its accessible name; `hideSingle` draws nothing for a piece in one key; `empty`. A live status line reads the whole plan ("C major, then D major from bar 33 (+2: up a whole step)"). |
| `DeviceCounter` | `kit/DeviceCounter.tsx` | Named things a piece may hold (CF-A's six devices, C7's colours), each found (with where: `barsListText` → "bars 11 and 27") or open ("Not yet": quiet, never an error), the count beside the heading against the rule's `need` ("3 of 6 · 4 needed"), one pip per item with the need marked, a `detail` line and an `action` per row, `dense`, `countText` (a rule not live yet). |
| `LoudnessReadout` | `kit/LoudnessReadout.tsx` | A calm meter with numbers for CF-A's Master step: the loudest moment before the limiter on a dB scale with the threshold marked (amber past it, never red, no flashing), what the limiter took off and in words (`limiter`: resting / touching / working → "Resting", "Catching peaks", "Working steadily"), the average level, `live` while measuring, `lines` (the owner's sentences), `empty`, `action`. `dbText` prints levels as @oak/audio's `levelText` does. Reduced motion: no transitions. |
| `AlbumPlayerBar` | `kit/AlbumPlayerBar.tsx` | One bar that plays a whole record (Side A on the finale Coda and the album): "3 of 12 · Four-Chord Song · 0:42 / 1:36", a play / stop button that names what it plays, previous / next, the track's progress. Keys on the bar: Space plays or stops, ←/→ change track, Esc stops. The owner keeps the `<audio>`, the order and the breath between tracks; it never starts by itself. `disabledReason`, `idleText`, `cover`, `actions`, `sticky`. |
| `BranchCard` | `kit/BranchCard.tsx` | A branch of the course off the core's path (an advanced track): `locked` ("Not open yet" + what opens it), `open` (gate met, nothing to start: the server's honest note, "Its first lessons are still being written."), `ready` (a lesson to start). `branchState(TrackState)` picks the state; an `action` is drawn ONLY when `ready`, so an unwritten track can never look like a way in; `more` is an always-honest link (to the Oak); `fresh` says "Opened today"; `layout="card" | "row"`; `progress` only when ready. |
| helpers | `kit/model-w6.ts` | `keySegments`, `keyChangeWords`, `keyPlanSentence`, `keySegmentAt`, `shortKeyName`, `shortChange`, `deviceCount`, `barsListText`, `dbText`, `reductionText`, `dbFraction`, `loudnessSentence`, `LIMITER_WORDS` / `LIMITER_PHRASES`, `nowPlayingText`, `playFraction`, `branchState`, `branchNote`, `branchSummary`, `listWords`. |

## Shell and settings (Wave 6)

- **Advanced tracks, honestly.** `shell/course-state.ts` reads the server's `TrackState` (`lessons.progress.tracks`),
  or the same gates from the course progress when a server does not send it. Before U13.CP nothing is said in the
  rail; afterwards the Oak's rail item and tooltip say "Jazz Harmony and Advanced Rhythm are open, their first lessons
  still being written" (never a lock or a badge: tracks are optional). In the palette a track is "Advanced track ·
  open · its first lessons are still being written" and leads to `/oak?view=course`; a lesson nobody has written yet
  says "… · still being written" and leads there too, never to an empty `/learn` page.
- **The end of the core.** Every rail destination stays, none locked or worded as an ending (`FINISHED_WORDS` is
  tested against the rail, the palette and the sheet). Once the core's lessons are done the palette asks
  `course.completion` and lists what stays open first ("Open to you · …"; a track with nothing to start: "Open,
  nothing to start yet · …", leading to the Oak).
- **Shortcut sheet.** New section "Key strip and the record"; "Staff input: rhythm" (T tie, . dot, ; triplet — a
  staff that offers them registers the same id); the applied-numeral key `/`; the form map's X and A; the music-lens
  keys Shift+I guide tones, Shift+J key ribbon, Shift+V beat grid, each locked until ANY ONE of its tools is unlocked
  (`keys/locks.ts` `WORKBENCH_KEY_ANY_UNLOCKS`, from `MUSIC_LENS_UNLOCKS`). The sheet flows in two columns that
  scroll down. `G L` resumes the lesson THIS tab left open (d21: `ownOpenSession(session.day)`), else goes to Today.
- `Kbd tone="onAccent"` for a key hint inside a primary button (AA on the accent in both themes).

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

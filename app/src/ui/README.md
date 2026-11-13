# app/src/ui — the shared kit, shell and keys

Owner: **kit** (docs/design/wave4.md §1). Everyone else imports from here and never edits it; ask under `apiNotes`.

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

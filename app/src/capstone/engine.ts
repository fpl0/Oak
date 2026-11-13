// The capstone's impure steps: a check in capstone mode through the browser grader host (contracts §6.4: the
// whole piece up to 128 bars, 5 s, the rubric of §6.6), the performance recorded through the @oak/strudel
// recorder (MediaRecorder on the master bus, UI sounds suppressed), and the release with its upload.
import {
  type AlbumTrackDetail,
  type AnalysisSummary,
  type CapstoneDef,
  type CapstoneReleaseResult,
  type CapstoneState,
  type FlavourId,
  type GradeResult,
  type KeySpec,
  OakApiError,
  type UnlockableId,
} from "@oak/api";
import { keyEstimate, type Normalized, normalize } from "@oak/grader";
import type { Recording } from "@oak/strudel";
import { sideOfCapstone } from "../album/model.ts";
import { callApi } from "../lib/api.ts";
import { graderHost } from "../lib/grader-client.ts";
import { anchorsOf, type BarAnchor } from "./anchors.ts";

export { isSilentTake, recordPerformance, SILENT_PEAK, SILENT_TAKE } from "./record.ts";

import { hasPitches, MAX_CAPSTONE_BARS, pieceAnalysis, pieceBars, truncate } from "./piece.ts";
import { audioErrorText } from "./release-text.ts";

export interface CheckOutcome {
  code: string;
  result: GradeResult;
  /** The first pass of the piece; `null` when it does not evaluate. */
  n: Normalized | null;
  bars: number;
  analysis: AnalysisSummary | null;
  anchors: Record<string, BarAnchor | null>;
  key: KeySpec | null;
}

export function lintFor(def: CapstoneDef, unlocked: ReadonlySet<UnlockableId>) {
  return {
    profile: "graded" as const,
    unlocked,
    allowPreview: false,
    meter: def.meter,
    key: def.key ?? null,
  };
}

/** Grades the brief in capstone mode and analyses the piece's first pass. */
export async function checkPiece(
  def: CapstoneDef,
  code: string,
  unlocked: ReadonlySet<UnlockableId>,
  signal?: AbortSignal,
): Promise<CheckOutcome> {
  const brief = def.brief;
  if (!brief) throw new Error(`${def.id} has no brief`);
  const host = await graderHost();
  const lint = lintFor(def, unlocked);
  const ev = await host.analyze(
    code,
    { mode: "capstone", bars: MAX_CAPSTONE_BARS, lint, meter: def.meter },
    signal,
  );
  let n: Normalized | null = null;
  let bars = 1;
  let key: KeySpec | null = def.key ?? null;
  if (ev.ok) {
    const full = normalize(ev, { meter: def.meter });
    bars = pieceBars(code, full.all);
    n = truncate(full, bars);
    if (!key && hasPitches(n)) key = keyEstimate(n.all)[0]?.key ?? null;
  }
  const result = await host.grade(
    {
      exercise: brief,
      response: { code },
      ctx: {
        exerciseGlobalId: `${def.id}/${brief.id}`,
        mode: "capstone",
        key: key ?? { tonic: "C", mode: "major" },
        meter: def.meter,
        bpm: def.bpm ? Math.round((def.bpm[0] + def.bpm[1]) / 2) : 100,
        ...(def.swing ? { swing: def.swing } : {}),
        params: {},
        attemptNo: 1,
        firstAttempt: true,
        rung: 0,
        tutorHints: 0,
        extraReplays: 0,
        lint,
      },
    },
    signal,
  );
  const analysis = n ? pieceAnalysis(n, { code, meter: def.meter, key, bars }) : null;
  const unmet = new Set((result.rubric ?? []).filter((r) => !r.ok).map((r) => r.ruleId));
  const details: Record<string, string | null> = {};
  for (const r of result.rubric ?? [])
    details[r.ruleId] = typeof r.diag?.params.detail === "string" ? r.diag.params.detail : null;
  return {
    code,
    result: analysis ? { ...result, analysis } : result,
    n,
    bars,
    analysis,
    anchors: anchorsOf(brief.rubric, unmet, n, bars, details),
    key,
  };
}

/** The piece without a rubric (a transcription's release): its first pass, length, analysis and key. */
export async function analyzeDraft(
  code: string,
  o: { meter: CapstoneDef["meter"]; key: KeySpec | null; unlocked: ReadonlySet<UnlockableId> },
  signal?: AbortSignal,
): Promise<Pick<CheckOutcome, "code" | "n" | "bars" | "analysis" | "key"> & { error: string | null }> {
  const host = await graderHost();
  const lint = {
    profile: "graded" as const,
    unlocked: o.unlocked,
    allowPreview: false,
    meter: o.meter,
    key: o.key,
  };
  const ev = await host.analyze(
    code,
    { mode: "capstone", bars: MAX_CAPSTONE_BARS, lint, meter: o.meter },
    signal,
  );
  if (!ev.ok) {
    return {
      code,
      n: null,
      bars: 1,
      analysis: null,
      key: o.key,
      error: ev.error.message || "The code doesn't run.",
    };
  }
  const full = normalize(ev, { meter: o.meter });
  const bars = pieceBars(code, full.all);
  const n = truncate(full, bars);
  const key = o.key ?? (hasPitches(n) ? (keyEstimate(n.all)[0]?.key ?? null) : null);
  return { code, n, bars, analysis: pieceAnalysis(n, { code, meter: o.meter, key, bars }), key, error: null };
}

// --- recording ------------------------------------------------------------------------------------

/** Seconds the recording will take: the piece once plus its tail. */
export function recordingSeconds(bars: number, cps: number): number {
  return bars / (cps > 0 ? cps : 0.5) + 1.5;
}

// --- release --------------------------------------------------------------------------------------

export interface ReleaseInput {
  def: CapstoneDef;
  state: CapstoneState;
  sessionId: string | null;
  sketchId: string;
  sketchVersion: number;
  title: string;
  flavour: FlavourId | null;
  linerNotesMd: string;
  theoryTags: string[];
  includeReviewNote: boolean;
  /** Claude's liner note, appended by this client only when the server cannot release (see below). */
  reviewNote: string | null;
  recording: Recording | null;
}

export interface ReleaseOutcome {
  track: AlbumTrackDetail;
  version: number;
  result: Pick<CapstoneReleaseResult, "unlocks" | "canDo"> | null;
  audioError: string | null;
}

/**
 * Release (ux §2.3): `capstones.release` completes the last capstone session, puts the version on the album (a new
 * track, or the next version of the track), attaches Claude's review and its liner note if chosen, and marks the
 * capstone released. Then the recording is uploaded. A server without the endpoint (a typed 501) gets the same
 * rows through `capstones.completeSession` and `album.createTrack` / `album.addVersion`.
 */
export async function releaseTrack(i: ReleaseInput): Promise<ReleaseOutcome> {
  let track: AlbumTrackDetail;
  let result: ReleaseOutcome["result"] = null;
  try {
    const r = await callApi("capstones.release", {
      params: { id: i.def.id },
      body: {
        sessionId: i.sessionId,
        sketchId: i.sketchId,
        sketchVersion: i.sketchVersion,
        title: i.title,
        flavour: i.flavour,
        linerNotesMd: i.linerNotesMd,
        theoryTags: i.theoryTags,
        includeReviewNote: i.includeReviewNote,
      },
    });
    track = r.track;
    result = { unlocks: r.unlocks, canDo: r.canDo };
  } catch (e) {
    if (!(e instanceof OakApiError) || e.code !== "not_implemented") throw e;
    const last = i.def.sessionDefs.at(-1)?.id ?? `${i.def.id}.S1`;
    if (!i.state.sessions.includes(last))
      await callApi("capstones.completeSession", {
        params: { id: i.def.id },
        body: { sessionId: i.sessionId, capstoneSessionId: last, sketchId: i.sketchId, flavour: i.flavour },
      });
    const notes =
      i.includeReviewNote && i.reviewNote
        ? `${i.linerNotesMd}\n\n${i.reviewNote}`.slice(0, 4000)
        : i.linerNotesMd;
    const version = {
      sketchId: i.sketchId,
      sketchVersion: i.sketchVersion,
      linerNotesMd: notes,
      theoryTags: i.theoryTags,
      attribution: null,
    };
    track = i.state.trackId
      ? await callApi("album.addVersion", { params: { id: i.state.trackId }, body: version })
      : await callApi("album.createTrack", {
          body: {
            capstoneId: i.def.id,
            side: sideOfCapstone(i.def.id),
            title: i.title,
            flavour: i.flavour,
            ...version,
          },
        });
  }
  const version = track.currentVersion;
  let audioError: string | null = null;
  if (i.recording) {
    try {
      await callApi("album.putAudio", {
        params: { id: track.id, v: String(version) },
        query: { durationS: String(Math.round(i.recording.durationS * 10) / 10) },
        body: i.recording.blob,
        contentType: i.recording.mime.split(";")[0],
      } as never);
    } catch (e) {
      audioError = audioErrorText(e);
    }
  }
  return { track, version, result, audioError };
}

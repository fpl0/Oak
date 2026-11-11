// The REST contract: every endpoint under /api (architecture §4.4 as amended by contracts §11).
// The server mounts handlers from this table (zValidator on `params`, `query`, `body`); the client
// (./client.ts) types calls from it. One entry per endpoint, no codegen.

import { SUBJECT_KINDS } from "@oak/content-kit";
import { z } from "zod";
import * as D from "./dto.ts";
import {
  CardRecordSchema,
  SubjectRefSchema,
  TutorNoteSchema,
  TutorTimelineSchema,
  TutorTurnRequestSchema,
  TutorUsageReportSchema,
} from "./tutor.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface EndpointDef {
  method: HttpMethod;
  /** Path under `/api`, with `:name` segments. */
  path: `/${string}`;
  /** Path parameters. Every `:name` in `path` has a key here. */
  params?: z.ZodObject;
  query?: z.ZodObject;
  /** JSON body schema, or `binary` for a raw upload (the body is the file; metadata goes in the query). */
  body?: z.ZodType | "binary";
  /** JSON response schema; `binary` for media and archives; `sse` for tutor streams (events: ./tutor.ts). */
  res: z.ZodType | "binary" | "sse";
  /** Destructive: needs `X-Oak-Confirm: <nonce>` from `POST /api/confirm` for this action (contracts §11.6). */
  confirm?: D.ConfirmAction;
  /**
   * Media GET, the target of an `<audio src>`: exempt from `X-Oak: 1`, must carry
   * `Sec-Fetch-Site: same-origin` instead (contracts §11.1 rule 4). Supports Range.
   */
  media?: true;
  /** Exists only when `OAK_DEV=1`. */
  dev?: true;
}

const id = z.string().min(1);
const p = <K extends string>(...names: K[]) =>
  z.strictObject(Object.fromEntries(names.map((n) => [n, id])) as Record<K, typeof id>);
const list = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });
const flag = z.enum(["0", "1"]);

export const contract = {
  // --- meta ---
  health: { method: "GET", path: "/health", res: D.HealthSchema },
  bootstrap: { method: "GET", path: "/bootstrap", res: D.BootstrapSchema },
  "settings.put": {
    method: "PUT",
    path: "/settings/:key",
    params: z.strictObject({ key: z.enum(D.SETTING_KEYS) }),
    body: z.strictObject({ value: z.unknown() }),
    res: D.SettingsSchema,
  },
  "settings.anthropicKey.set": {
    method: "POST",
    path: "/settings/anthropic-key",
    body: z.strictObject({ key: z.string().min(20).max(400) }),
    res: D.KeyStatusSchema,
  },
  "settings.anthropicKey.delete": {
    method: "DELETE",
    path: "/settings/anthropic-key",
    res: D.KeyStatusSchema,
    confirm: "anthropic-key.delete",
  },
  confirm: { method: "POST", path: "/confirm", body: D.ConfirmRequestSchema, res: D.ConfirmNonceSchema },
  "data.reset": { method: "POST", path: "/data/reset", res: D.Ok, confirm: "data.reset" },

  // --- profile ---
  "profile.get": { method: "GET", path: "/profile", res: D.ProfileSchema },
  "profile.put": { method: "PUT", path: "/profile", body: D.ProfilePatchSchema, res: D.ProfileSchema },
  "profile.calibration": {
    method: "POST",
    path: "/profile/calibration",
    body: D.CalibrationRunSchema,
    res: D.ProfileSchema,
  },

  // --- session ---
  "session.today": {
    method: "GET",
    path: "/session/today",
    query: z.strictObject({ targetMinutes: z.enum(["15", "20", "25"]).optional() }),
    res: D.SessionPlanSchema,
  },
  "session.start": {
    method: "POST",
    path: "/session/start",
    body: D.SessionStartSchema,
    res: D.SessionSchema,
  },
  "session.heartbeat": {
    method: "POST",
    path: "/session/:id/heartbeat",
    params: p("id"),
    body: D.SessionHeartbeatSchema,
    res: D.Ok,
  },
  "session.end": {
    method: "POST",
    path: "/session/:id/end",
    params: p("id"),
    body: D.SessionEndSchema,
    res: D.SessionSummarySchema,
  },

  // --- lessons, steps, checkpoints, capstones, gym ---
  "lessons.progress": { method: "GET", path: "/lessons/progress", res: D.CourseProgressSchema },
  "steps.state": {
    method: "GET",
    path: "/lessons/:id/steps/:stepId",
    params: p("id", "stepId"),
    res: D.StepStateSchema,
  },
  "steps.attempt": {
    method: "POST",
    path: "/lessons/:id/steps/:stepId/attempts",
    params: p("id", "stepId"),
    body: D.StepAttemptCreateSchema,
    res: D.StepAttemptResultSchema,
  },
  /** Pressing Hint: raises the stored rung by one (to 4 only with `reveal: true`), exactly as a tutor hint request does up to 3. */
  "steps.hint": {
    method: "POST",
    path: "/lessons/:id/steps/:stepId/hints",
    params: p("id", "stepId"),
    body: z.strictObject({ reveal: z.boolean() }),
    res: D.StepStateSchema,
  },
  /** "Try a new one": starts a new attempt series with fresh params. */
  "steps.newSeries": {
    method: "POST",
    path: "/lessons/:id/steps/:stepId/series",
    params: p("id", "stepId"),
    res: D.StepStateSchema,
  },
  "lessons.complete": {
    method: "POST",
    path: "/lessons/:id/complete",
    params: p("id"),
    body: D.LessonCompleteRequestSchema,
    res: D.LessonCompleteResultSchema,
  },
  "checkpoints.start": {
    method: "POST",
    path: "/checkpoints/:cpId/start",
    params: p("cpId"),
    res: D.CheckpointAttemptStartSchema,
  },
  "checkpoints.attempt": {
    method: "POST",
    path: "/checkpoints/:cpId/attempts",
    params: p("cpId"),
    body: D.CheckpointSubmitSchema,
    res: D.CheckpointOutcomeSchema,
  },
  "capstones.get": { method: "GET", path: "/capstones/:id", params: p("id"), res: D.CapstoneStateSchema },
  "capstones.check": {
    method: "POST",
    path: "/capstones/:id/checks",
    params: p("id"),
    body: D.CapstoneCheckSchema,
    res: D.CapstoneStateSchema,
  },
  "capstones.completeSession": {
    method: "POST",
    path: "/capstones/:id/sessions",
    params: p("id"),
    body: D.CapstoneSessionCompleteSchema,
    res: D.CapstoneStateSchema,
  },
  "gym.start": {
    method: "POST",
    path: "/gym/sessions",
    body: D.GymSessionCreateSchema,
    res: D.GymSessionSchema,
  },
  "terms.introduced": { method: "GET", path: "/terms/introduced", res: list(D.TermIntroducedSchema) },

  // --- skills, SRS, drills ---
  "skills.map": { method: "GET", path: "/skills/map", res: D.SkillMapSchema },
  "srs.due": {
    method: "GET",
    path: "/srs/due",
    query: z.strictObject({ budgetSec: z.string().regex(/^\d+$/).optional(), more: flag.optional() }),
    res: D.DueBatchSchema,
  },
  "srs.review": {
    method: "POST",
    path: "/srs/review",
    body: D.SrsReviewRequestSchema,
    res: D.SrsReviewResultSchema,
  },
  "families.list": {
    method: "GET",
    path: "/drills/families",
    res: z.object({ families: z.array(D.FamilyStateSchema), cards: z.array(D.SrsCardSchema) }),
  },
  "families.state": {
    method: "GET",
    path: "/drills/difficulty/:familyId",
    params: p("familyId"),
    res: D.FamilyStateSchema,
  },
  "drills.start": {
    method: "POST",
    path: "/drills/sessions",
    body: D.DrillSessionCreateSchema,
    res: D.DrillSessionSchema,
  },
  "drills.trials": {
    method: "POST",
    path: "/drills/sessions/:id/trials",
    params: p("id"),
    body: z.strictObject({ trials: z.array(D.DrillTrialRecordSchema).min(1).max(50) }),
    res: D.Ok,
  },
  "drills.finish": {
    method: "POST",
    path: "/drills/sessions/:id/finish",
    params: p("id"),
    res: D.DrillFinishSchema,
  },

  // --- unlocks, can-do, progress, streak ---
  "unlocks.list": { method: "GET", path: "/unlocks", res: list(D.UnlockSchema) },
  "unlocks.seen": { method: "POST", path: "/unlocks/:id/seen", params: p("id"), res: D.Ok },
  "cando.list": { method: "GET", path: "/cando", res: list(D.CanDoEntrySchema) },
  "progress.get": { method: "GET", path: "/progress", res: D.ProgressReportSchema },
  "streak.get": {
    method: "GET",
    path: "/streak",
    query: z.strictObject({ weeks: z.string().regex(/^\d+$/).optional() }),
    res: z.object({
      summary: D.StreakSummarySchema,
      weeks: z.array(D.StreakWeekSchema),
      days: z.array(D.StreakDaySchema),
    }),
  },

  // --- sketches ---
  "sketches.list": {
    method: "GET",
    path: "/sketches",
    query: z.strictObject({ origin: z.enum(D.SKETCH_ORIGINS).optional(), archived: flag.optional() }),
    res: list(D.SketchSchema),
  },
  "sketches.create": {
    method: "POST",
    path: "/sketches",
    body: D.SketchCreateSchema,
    res: D.SketchSavedSchema,
  },
  "sketches.get": { method: "GET", path: "/sketches/:id", params: p("id"), res: D.SketchDetailSchema },
  "sketches.addVersion": {
    method: "POST",
    path: "/sketches/:id/versions",
    params: p("id"),
    body: D.SketchVersionCreateSchema,
    res: D.SketchSavedSchema,
  },
  "sketches.patch": {
    method: "PATCH",
    path: "/sketches/:id",
    params: p("id"),
    body: D.SketchPatchSchema,
    res: D.SketchSchema,
  },
  "sketches.delete": {
    method: "DELETE",
    path: "/sketches/:id",
    params: p("id"),
    res: D.Ok,
    confirm: "sketch.delete",
  },

  // --- album ---
  "album.get": { method: "GET", path: "/album", res: D.AlbumSchema },
  "album.track": { method: "GET", path: "/album/tracks/:id", params: p("id"), res: D.AlbumTrackDetailSchema },
  "album.createTrack": {
    method: "POST",
    path: "/album/tracks",
    body: D.AlbumTrackCreateSchema,
    res: D.AlbumTrackDetailSchema,
  },
  "album.addVersion": {
    method: "POST",
    path: "/album/tracks/:id/versions",
    params: p("id"),
    body: D.AlbumTrackVersionCreateSchema,
    res: D.AlbumTrackDetailSchema,
  },
  "album.putAudio": {
    method: "PUT",
    path: "/album/tracks/:id/versions/:v/audio",
    params: p("id", "v"),
    query: z.strictObject({ durationS: z.string().optional() }),
    body: "binary",
    res: D.AlbumTrackVersionSchema,
  },
  "album.getAudio": {
    method: "GET",
    path: "/album/tracks/:id/versions/:v/audio",
    params: p("id", "v"),
    res: "binary",
    media: true,
  },
  "album.deleteTrack": {
    method: "DELETE",
    path: "/album/tracks/:id",
    params: p("id"),
    res: D.Ok,
    confirm: "track.delete",
  },

  // --- audio (the learner's own files; never leave the machine) ---
  "audio.upload": {
    method: "POST",
    path: "/audio",
    query: z.strictObject({ name: z.string().min(1).max(255) }),
    body: "binary",
    res: D.AudioFileSchema,
  },
  "audio.get": { method: "GET", path: "/audio/:id", params: p("id"), res: "binary", media: true },
  "audio.putPeaks": { method: "PUT", path: "/audio/:id/peaks", params: p("id"), body: "binary", res: D.Ok },
  "audio.getPeaks": { method: "GET", path: "/audio/:id/peaks", params: p("id"), res: "binary", media: true },
  "audio.delete": {
    method: "DELETE",
    path: "/audio/:id",
    params: p("id"),
    res: D.Ok,
    confirm: "audio.delete",
  },

  // --- transcriptions ---
  "transcriptions.list": { method: "GET", path: "/transcriptions", res: list(D.TranscriptionSchema) },
  "transcriptions.create": {
    method: "POST",
    path: "/transcriptions",
    body: D.TranscriptionCreateSchema,
    res: D.TranscriptionDetailSchema,
  },
  "transcriptions.get": {
    method: "GET",
    path: "/transcriptions/:id",
    params: p("id"),
    res: D.TranscriptionDetailSchema,
  },
  "transcriptions.patch": {
    method: "PATCH",
    path: "/transcriptions/:id",
    params: p("id"),
    body: D.TranscriptionPatchSchema,
    res: D.TranscriptionSchema,
  },
  "transcriptions.addVersion": {
    method: "POST",
    path: "/transcriptions/:id/versions",
    params: p("id"),
    body: D.TranscriptionVersionCreateSchema,
    res: D.TranscriptionDetailSchema,
  },
  "transcriptions.delete": {
    method: "DELETE",
    path: "/transcriptions/:id",
    params: p("id"),
    res: D.Ok,
    confirm: "transcription.delete",
  },

  // --- tutor (SSE: POST + fetch stream; there is no delete endpoint for threads or messages) ---
  "tutor.chat": { method: "POST", path: "/tutor/chat", body: TutorTurnRequestSchema, res: "sse" },
  "tutor.hint": { method: "POST", path: "/tutor/hint", body: TutorTurnRequestSchema, res: "sse" },
  "tutor.note": { method: "POST", path: "/tutor/note", body: TutorTurnRequestSchema, res: "sse" },
  "tutor.reviewCapstone": {
    method: "POST",
    path: "/tutor/reviews/capstone",
    body: TutorTurnRequestSchema,
    res: "sse",
  },
  "tutor.reviewTranscription": {
    method: "POST",
    path: "/tutor/reviews/transcription",
    body: TutorTurnRequestSchema,
    res: "sse",
  },
  "tutor.warm": {
    method: "POST",
    path: "/tutor/warm",
    res: z.object({ ok: z.boolean(), warmed: z.boolean() }),
  },
  "tutor.timeline": {
    method: "GET",
    path: "/tutor/timeline",
    query: z.strictObject({ subjectKind: z.enum(SUBJECT_KINDS), subjectId: id }),
    res: TutorTimelineSchema,
  },
  "tutor.usage": {
    method: "GET",
    path: "/tutor/usage",
    query: z.strictObject({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    }),
    res: TutorUsageReportSchema,
  },
  "tutor.cardApplied": {
    method: "POST",
    path: "/tutor/cards/:id/applied",
    params: p("id"),
    body: z.strictObject({ sketchId: z.string().nullable(), toNewSketch: z.boolean() }),
    res: CardRecordSchema,
  },
  "tutor.notes": {
    method: "GET",
    path: "/tutor/notes",
    query: SubjectRefSchema.partial(),
    res: list(TutorNoteSchema),
  },
  "tutor.retractNote": {
    method: "POST",
    path: "/tutor/notes/:id/retract",
    params: p("id"),
    res: TutorNoteSchema,
  },

  // --- server grader, telemetry, QA ---
  grade: { method: "POST", path: "/grade", body: D.GradeRequestSchema, res: D.GradeResultSchema },
  analyze: { method: "POST", path: "/analyze", body: D.AnalyzeRequestSchema, res: D.AnalyzeResponseSchema },
  "telemetry.steps": {
    method: "POST",
    path: "/telemetry/steps",
    body: z.strictObject({ steps: z.array(D.StepTelemetrySchema).min(1).max(200) }),
    res: D.Ok,
  },
  "qa.report": { method: "POST", path: "/qa/reports", body: D.QaReportCreateSchema, res: D.QaReportSchema },

  // --- backup ---
  "backup.info": { method: "GET", path: "/backup", res: D.BackupInfoSchema },
  "backup.export": {
    method: "GET",
    path: "/backup/export",
    query: z.strictObject({ audio: flag.optional() }),
    res: "binary",
  },
  "backup.import": {
    method: "POST",
    path: "/backup/import",
    body: "binary",
    res: D.BackupImportResultSchema,
    confirm: "backup.import",
  },

  // --- dev (OAK_DEV=1) ---
  "dev.qa": { method: "GET", path: "/dev/qa", res: list(D.QaReportSchema), dev: true },
  "dev.qaUpdate": {
    method: "PATCH",
    path: "/dev/qa/:id",
    params: p("id"),
    body: z.strictObject({ status: z.enum(["open", "triaged", "fixed", "wontfix"]) }),
    res: D.QaReportSchema,
    dev: true,
  },
  "dev.telemetry": { method: "GET", path: "/dev/telemetry", res: D.TelemetryReportSchema, dev: true },
  "dev.contentReport": {
    method: "GET",
    path: "/dev/content-report",
    res: z.object({
      contentVersion: z.string().nullable(),
      lessons: z.number().int(),
      problems: z.array(z.object({ id: z.string(), message: z.string() })),
    }),
    dev: true,
  },
} as const satisfies Record<string, EndpointDef>;

export type Contract = typeof contract;
export type EndpointName = keyof Contract;
export const ENDPOINT_NAMES = Object.keys(contract) as EndpointName[];

type DefOf<N extends EndpointName> = Contract[N];
type ParamsOf<Def> = Def extends { params: infer P extends z.ZodType } ? { params: z.input<P> } : unknown;
type QueryOf<Def> = Def extends { query: infer Q extends z.ZodType } ? { query?: z.input<Q> } : unknown;
type BodyOf<Def> = Def extends { body: infer B extends z.ZodType }
  ? { body: z.input<B> }
  : Def extends { body: "binary" }
    ? { body: Blob | ArrayBuffer | Uint8Array; contentType?: string }
    : unknown;

/** What a caller passes for endpoint `N`: `params`, `query` and `body` as the contract declares them. */
export type EndpointInput<N extends EndpointName> = ParamsOf<DefOf<N>> & QueryOf<DefOf<N>> & BodyOf<DefOf<N>>;
/** What endpoint `N` returns: the parsed JSON, or the raw `Response` for binary endpoints. */
export type EndpointOutput<N extends EndpointName> = DefOf<N>["res"] extends infer R
  ? R extends z.ZodType
    ? z.output<R>
    : R extends "binary"
      ? Response
      : never
  : never;
/** What a server handler receives after validation. */
export type HandlerInput<N extends EndpointName> = (DefOf<N> extends { params: infer P extends z.ZodType }
  ? { params: z.output<P> }
  : unknown) &
  (DefOf<N> extends { query: infer Q extends z.ZodType } ? { query: z.output<Q> } : unknown) &
  (DefOf<N> extends { body: infer B extends z.ZodType } ? { body: z.output<B> } : unknown);

export type SseEndpointName = {
  [N in EndpointName]: DefOf<N>["res"] extends "sse" ? N : never;
}[EndpointName];
export type JsonEndpointName = Exclude<EndpointName, SseEndpointName>;
export type ConfirmEndpointName = {
  [N in EndpointName]: DefOf<N> extends { confirm: string } ? N : never;
}[EndpointName];

/** Header names of contracts §11. */
export const HEADERS = { oak: "X-Oak", confirm: "X-Oak-Confirm" } as const;
export const API_PREFIX = "/api";
/** The server binds 127.0.0.1:8787 only; in dev Vite on 5173 proxies /api and /sounds to it. */
export const PORTS = { api: 8787, vite: 5173 } as const;
export const ALLOWED_HOSTS = ["127.0.0.1:8787", "localhost:8787"] as const;
export const ALLOWED_DEV_HOSTS = ["127.0.0.1:5173", "localhost:5173"] as const;

/** Path parameter names of a contract path, in order. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1] as string);
}

/** `/api` + the path with its parameters filled in and the query appended. */
export function buildPath(
  def: Pick<EndpointDef, "path">,
  params: Record<string, string> = {},
  query: Record<string, string | undefined> = {},
): string {
  const path = def.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_m, name: string) => {
    const value = params[name];
    if (value === undefined || value === "")
      throw new Error(`missing path parameter "${name}" for ${def.path}`);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) search.set(k, v);
  const qs = search.toString();
  return `${API_PREFIX}${path}${qs ? `?${qs}` : ""}`;
}

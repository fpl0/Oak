// The learner's own things: sketches, the album (tracks, versions, liner-note data, recorded audio),
// their audio files, and transcription projects. Saving a sketch version after a successful Run
// qualifies the streak day (contracts §7.8 b).
import type {
  AlbumTrackDetail,
  AlbumTrackVersion,
  AudioFile,
  Sketch,
  SketchDetail,
  SketchSaved,
  SketchVersion,
  Transcription,
  TranscriptionDetail,
} from "@oak/api";
import type { GradeResult, NEvent } from "@oak/content-kit";
import { tx } from "../db/index.ts";
import type { StoredTranscription } from "../db/repos/library.ts";
import { ApiError, badRequest, conflict, notFound } from "../errors.ts";
import {
  type AudioStore,
  extFor,
  MAX_AUDIO_BYTES,
  mimeFor,
  sha256,
  sniffAudio,
  wavInfo,
} from "./audio-store.ts";
import { LearnerTime, newId, type ServiceContext } from "./context.ts";
import type { StreakService } from "./streak.ts";

type VersionInput = Omit<SketchVersion, "sketchId" | "version" | "createdAt"> & {
  ranOk: boolean;
  sessionId: string | null;
};

/** Events of hidden pattern code for the Transcribe player, computed by the server grader. */
export type PatternStimulus = (code: string, bars: number) => Promise<TranscriptionDetail["stimulus"]>;
/** A ladder piece (`@oak/drills` `generateLadderPiece`), behind a seam because it may be unfinished. */
export type LadderGenerator = (
  level: number,
  realism: number,
  seed: number,
) => { code: string; events: NEvent[]; cps: number; bars: number; preload: string[] };

export interface LibraryDeps {
  streak: StreakService;
  store: AudioStore;
  stimulus?: PatternStimulus;
  ladder?: LadderGenerator;
}

export class LibraryService {
  readonly time: LearnerTime;
  readonly #stimulusCache = new Map<string, NonNullable<TranscriptionDetail["stimulus"]>>();
  constructor(
    private readonly ctx: ServiceContext,
    private readonly d: LibraryDeps,
  ) {
    this.time = new LearnerTime(ctx);
  }
  get #repos() {
    return this.ctx.repos;
  }

  // --- sketches ---------------------------------------------------------------------------------

  sketches(filter: { origin?: Sketch["originKind"]; archived?: boolean }): Sketch[] {
    return this.#repos.sketches.list(filter);
  }
  sketch(id: string): SketchDetail {
    const s = this.#repos.sketches.get(id);
    if (s === null) throw notFound(`sketch ${id}`);
    return { ...s, versions: this.#repos.sketches.versions(id) };
  }

  #version(sketchId: string, version: number, v: VersionInput, at: string): SketchVersion {
    return {
      sketchId,
      version,
      code: v.code,
      bpm: v.bpm,
      meter: v.meter,
      key: v.key,
      analysis: v.analysis,
      note: v.note,
      tutorAssisted: v.tutorAssisted,
      band: v.band,
      flags: v.flags,
      createdAt: at,
    };
  }

  createSketch(
    body: VersionInput & { title: string; originKind: Sketch["originKind"]; originId: string | null },
  ): SketchSaved {
    const id = newId("sk");
    tx(this.#repos.db, () => {
      const at = this.time.iso();
      this.#repos.sketches.insert({
        id,
        title: body.title,
        originKind: body.originKind,
        originId: body.originId,
        currentVersion: 1,
        tags: [],
        archived: false,
        listeningNote: null,
        createdAt: at,
        updatedAt: at,
      });
      this.#repos.sketches.insertVersion(this.#version(id, 1, body, at));
      if (body.ranOk) this.d.streak.qualify("sketch");
    });
    return { sketch: this.sketch(id), streak: this.d.streak.summary() };
  }

  addSketchVersion(id: string, body: VersionInput): SketchSaved {
    tx(this.#repos.db, () => {
      const s = this.#repos.sketches.get(id);
      if (s === null) throw notFound(`sketch ${id}`);
      this.#repos.sketches.insertVersion(this.#version(id, s.currentVersion + 1, body, this.time.iso()));
      if (body.ranOk) this.d.streak.qualify("sketch");
    });
    return { sketch: this.sketch(id), streak: this.d.streak.summary() };
  }

  patchSketch(
    id: string,
    patch: { title?: string; tags?: string[]; archived?: boolean; listeningNote?: string | null },
  ): Sketch {
    if (this.#repos.sketches.get(id) === null) throw notFound(`sketch ${id}`);
    this.#repos.sketches.patch(id, patch, this.time.iso());
    return this.#repos.sketches.get(id) as Sketch;
  }

  deleteSketch(id: string): void {
    if (!this.#repos.sketches.delete(id)) throw notFound(`sketch ${id}`);
  }

  // --- album ------------------------------------------------------------------------------------

  album() {
    return { tracks: this.#repos.album.tracks() };
  }
  track(id: string): AlbumTrackDetail {
    const t = this.#repos.album.track(id);
    if (t === null) throw notFound(`track ${id}`);
    return { ...t, versions: this.#repos.album.versions(id) };
  }

  #trackVersion(
    trackId: string,
    version: number,
    body: {
      sketchId: string;
      sketchVersion: number;
      linerNotesMd: string;
      theoryTags: string[];
      attribution: string | null;
    },
  ): AlbumTrackVersion {
    const sv = this.#repos.sketches.version(body.sketchId, body.sketchVersion);
    if (sv === null) throw notFound(`sketch ${body.sketchId} v${body.sketchVersion}`);
    return {
      trackId,
      version,
      sketchId: body.sketchId,
      sketchVersion: body.sketchVersion,
      hasAudio: false,
      audioMime: null,
      durationS: null,
      linerNotesMd: body.linerNotesMd,
      theoryTags: body.theoryTags,
      review: null,
      tutorAssisted: sv.tutorAssisted,
      attribution: body.attribution,
      band: sv.band,
      flags: sv.flags,
      createdAt: this.time.iso(),
    };
  }

  createTrack(body: {
    capstoneId: AlbumTrackDetail["capstoneId"];
    side: AlbumTrackDetail["side"];
    title: string;
    flavour: AlbumTrackDetail["flavour"];
    sketchId: string;
    sketchVersion: number;
    linerNotesMd: string;
    theoryTags: string[];
    attribution: string | null;
  }): AlbumTrackDetail {
    const id = newId("trk");
    tx(this.#repos.db, () => {
      if (body.capstoneId !== null) {
        if (this.ctx.content.capstoneMeta(body.capstoneId) === null)
          throw notFound(`capstone ${body.capstoneId}`);
        if (this.#repos.album.trackOfCapstone(body.capstoneId) !== null)
          throw conflict("this capstone already has a track; add a version to it");
      } else if (body.side !== "Bside") throw badRequest("a track without a capstone is a B-side");
      const version = this.#trackVersion(id, 1, body);
      this.#repos.album.insertTrack({
        id,
        capstoneId: body.capstoneId,
        sketchId: body.capstoneId === null ? body.sketchId : null,
        side: body.side,
        trackNo: this.#repos.album.nextTrackNo(body.side),
        title: body.title,
        flavour: body.flavour,
        currentVersion: 1,
        coverSeed: sha256(new TextEncoder().encode(`${id}:${body.title}`)).slice(0, 16),
        createdAt: version.createdAt,
      });
      this.#repos.album.insertVersion(version);
      if (body.capstoneId !== null) {
        const row = this.#repos.capstones.get(body.capstoneId);
        if (row !== null) this.#repos.capstones.save({ ...row, trackId: id, updatedAt: version.createdAt });
      }
    });
    return this.track(id);
  }

  addTrackVersion(
    id: string,
    body: {
      sketchId: string;
      sketchVersion: number;
      linerNotesMd: string;
      theoryTags: string[];
      attribution: string | null;
    },
  ): AlbumTrackDetail {
    tx(this.#repos.db, () => {
      const t = this.#repos.album.track(id);
      if (t === null) throw notFound(`track ${id}`);
      this.#repos.album.insertVersion(this.#trackVersion(id, t.currentVersion + 1, body));
    });
    return this.track(id);
  }

  putTrackAudio(
    id: string,
    version: number,
    bytes: Uint8Array,
    _declaredMime: string,
    durationS: number | null,
  ): AlbumTrackVersion {
    const v = this.#repos.album.version(id, version);
    if (v === null) throw notFound(`track ${id} v${version}`);
    if (bytes.length === 0) throw badRequest("empty upload");
    if (bytes.length > MAX_AUDIO_BYTES) throw new ApiError("payload_too_large", "audio file too large");
    const sniffed = sniffAudio(bytes);
    if (sniffed === null) throw badRequest("not an audio file this app can store");
    const ext = extFor(sniffed, "");
    const abs = this.d.store.albumPath(id, version, ext);
    const old = this.#repos.album.audioOf(id, version);
    this.d.store.write(abs, bytes);
    if (old !== null && this.d.store.resolveStored(old.path) !== abs)
      this.d.store.remove(this.d.store.resolveStored(old.path));
    const duration = durationS ?? wavInfo(bytes).durationS;
    this.#repos.album.setAudio(id, version, this.d.store.storedName(abs), mimeFor(ext, sniffed), duration);
    return this.#repos.album.version(id, version) as AlbumTrackVersion;
  }

  trackAudio(id: string, version: number): { abs: string; mime: string } {
    const a = this.#repos.album.audioOf(id, version);
    if (a === null) throw notFound(`audio of track ${id} v${version}`);
    const abs = this.d.store.resolveStored(a.path);
    if (!this.d.store.exists(abs)) throw notFound(`audio of track ${id} v${version}`);
    return { abs, mime: a.mime };
  }

  deleteTrack(id: string): void {
    tx(this.#repos.db, () => {
      const t = this.#repos.album.track(id);
      if (t === null) throw notFound(`track ${id}`);
      this.#repos.album.deleteTrack(id);
      if (t.capstoneId !== null) {
        const row = this.#repos.capstones.get(t.capstoneId);
        if (row !== null && row.trackId === id)
          this.#repos.capstones.save({ ...row, trackId: null, updatedAt: this.time.iso() });
      }
    });
    this.d.store.removeDir(id);
  }

  /** An accepted capstone review lands on the capstone's track, latest version (contracts §10.6). */
  saveCapstoneReview(capstoneId: string, review: unknown): boolean {
    const t = this.#repos.album.trackOfCapstone(capstoneId);
    if (t === null) return false;
    this.#repos.album.setReview(t.id, t.currentVersion, review);
    return true;
  }

  // --- audio files ------------------------------------------------------------------------------

  audioList(): AudioFile[] {
    return this.#repos.audio.list().map(({ storedPath: _s, peaksPath: _p, ...a }) => a);
  }

  uploadAudio(name: string, bytes: Uint8Array, declaredMime: string): AudioFile {
    if (bytes.length === 0) throw badRequest("empty upload");
    if (bytes.length > MAX_AUDIO_BYTES) throw new ApiError("payload_too_large", "audio file too large");
    const sniffed = sniffAudio(bytes);
    if (sniffed === null) throw badRequest("not an audio file this app can read");
    const id = sha256(bytes);
    const existing = this.#repos.audio.get(id);
    if (existing !== null) {
      const { storedPath: _s, peaksPath: _p, ...a } = existing;
      return a;
    }
    const ext = extFor(sniffed, name);
    const abs = this.d.store.ownPath(id, ext);
    this.d.store.write(abs, bytes);
    const info = wavInfo(bytes);
    const row = {
      id,
      originalName: name,
      mime: mimeFor(ext, declaredMime || sniffed),
      bytes: bytes.length,
      durationS: info.durationS,
      sampleRate: info.sampleRate,
      channels: info.channels,
      hasPeaks: false,
      createdAt: this.time.iso(),
      storedPath: this.d.store.storedName(abs),
      peaksPath: null,
    };
    this.#repos.audio.insert(row);
    const { storedPath: _s, peaksPath: _p, ...a } = row;
    return a;
  }

  audio(id: string): { abs: string; mime: string } {
    const a = this.#repos.audio.get(id);
    if (a === null) throw notFound(`audio ${id}`);
    const abs = this.d.store.resolveStored(a.storedPath);
    if (!this.d.store.exists(abs)) throw notFound(`audio ${id}`);
    return { abs, mime: a.mime };
  }

  putPeaks(id: string, bytes: Uint8Array): void {
    const a = this.#repos.audio.get(id);
    if (a === null) throw notFound(`audio ${id}`);
    if (bytes.length === 0 || bytes.length > 16 * 1024 * 1024)
      throw badRequest("peaks must be 1 byte to 16 MB");
    const abs = this.d.store.peaksPath(id);
    this.d.store.write(abs, bytes);
    this.#repos.audio.setPeaks(id, this.d.store.storedName(abs));
  }

  peaks(id: string): string {
    const a = this.#repos.audio.get(id);
    if (a === null || a.peaksPath === null) throw notFound(`peaks of ${id}`);
    const abs = this.d.store.resolveStored(a.peaksPath);
    if (!this.d.store.exists(abs)) throw notFound(`peaks of ${id}`);
    return abs;
  }

  deleteAudio(id: string): void {
    const a = this.#repos.audio.get(id);
    if (a === null) throw notFound(`audio ${id}`);
    // Projects that used it keep their transcription; `audio_id` becomes NULL (ON DELETE SET NULL).
    this.#repos.audio.delete(id);
    this.d.store.remove(this.d.store.resolveStored(a.storedPath));
    if (a.peaksPath !== null) this.d.store.remove(this.d.store.resolveStored(a.peaksPath));
  }

  // --- transcriptions ---------------------------------------------------------------------------

  transcriptions(): Transcription[] {
    return this.#repos.transcriptions.list().map(({ hiddenCode: _h, ...t }) => t);
  }

  async transcription(id: string): Promise<TranscriptionDetail> {
    const t = this.#repos.transcriptions.get(id);
    if (t === null) throw notFound(`transcription ${id}`);
    const { hiddenCode, ...rest } = t;
    const versions = this.#repos.transcriptions.versions(id).map((v) => ({
      transcriptionId: v.transcriptionId,
      version: v.version,
      code: v.code,
      createdAt: v.createdAt,
    }));
    return { ...rest, versions, stimulus: await this.#stimulus(t, hiddenCode) };
  }

  async #stimulus(t: StoredTranscription, code: string | null): Promise<TranscriptionDetail["stimulus"]> {
    if (t.player !== "pattern" || code === null) return null;
    const key = `${t.id}:${sha256(new TextEncoder().encode(code))}`;
    const cached = this.#stimulusCache.get(key);
    if (cached !== undefined) return cached;
    if (this.d.stimulus === undefined) return null;
    const song = t.songId === null ? null : this.ctx.content.source.songs.find((s) => s.id === t.songId);
    const bars = song?.answerKey.bars ?? 8;
    try {
      const s = await this.d.stimulus(code, bars);
      if (s !== null) this.#stimulusCache.set(key, s);
      return s;
    } catch {
      return null;
    }
  }

  createTranscription(body: {
    sourceKind: Transcription["sourceKind"];
    audioId: string | null;
    songId: string | null;
    title: string;
    artist: string | null;
    ladderLevel: number | null;
    templateId: string | null;
  }): Promise<TranscriptionDetail> {
    const id = newId("tr");
    const at = this.time.iso();
    const base: StoredTranscription = {
      id,
      sourceKind: body.sourceKind,
      player: body.sourceKind === "own-audio" ? "audio" : "pattern",
      audioId: null,
      songId: null,
      title: body.title,
      artist: body.artist,
      key: null,
      bpm: null,
      meter: null,
      downbeatS: null,
      fineTuneCents: 0,
      ladderLevel: null,
      realism: null,
      regions: [],
      checklist: {},
      selfScore: null,
      currentVersion: 0,
      status: "in_progress",
      review: null,
      createdAt: at,
      updatedAt: at,
      hiddenCode: null,
    };
    if (body.sourceKind === "own-audio") {
      if (body.audioId === null || this.#repos.audio.get(body.audioId) === null)
        throw notFound(`audio ${body.audioId ?? ""}`);
      base.audioId = body.audioId;
    } else if (body.sourceKind === "pd-song") {
      const song = this.ctx.content.source.songs.find((s) => s.id === body.songId);
      if (song === undefined) throw notFound(`song ${body.songId ?? ""}`);
      Object.assign(base, {
        songId: song.id,
        key: song.key,
        bpm: song.bpm,
        meter: song.meter,
        hiddenCode: song.answerKey.code,
        ladderLevel: body.ladderLevel,
      });
    } else {
      if (this.d.ladder === undefined)
        throw new ApiError("unavailable", "the ladder generator is not available yet");
      const level = body.ladderLevel ?? 1;
      const seed = Number.parseInt(sha256(new TextEncoder().encode(id)).slice(0, 8), 16);
      const piece = this.d.ladder(level, 0, seed);
      Object.assign(base, {
        ladderLevel: level,
        realism: 0,
        hiddenCode: piece.code,
        bpm: Math.round(piece.cps * 60 * 4),
      });
      this.#stimulusCache.set(`${id}:${sha256(new TextEncoder().encode(piece.code))}`, {
        events: piece.events,
        cps: piece.cps,
        bars: piece.bars,
        preload: piece.preload,
      });
    }
    if (body.templateId !== null) base.regions = [];
    this.#repos.transcriptions.insert(base);
    return this.transcription(id);
  }

  patchTranscription(id: string, patch: Partial<Omit<Transcription, "id">>): Transcription {
    const t = this.#repos.transcriptions.get(id);
    if (t === null) throw notFound(`transcription ${id}`);
    const next: StoredTranscription = {
      ...t,
      ...patch,
      id,
      hiddenCode: t.hiddenCode,
      updatedAt: this.time.iso(),
    };
    this.#repos.transcriptions.update(next);
    const { hiddenCode: _h, ...out } = next;
    return out;
  }

  addTranscriptionVersion(
    id: string,
    body: { code: string; result: GradeResult | null; ranOk: boolean },
  ): Promise<TranscriptionDetail> {
    tx(this.#repos.db, () => {
      const t = this.#repos.transcriptions.get(id);
      if (t === null) throw notFound(`transcription ${id}`);
      const at = this.time.iso();
      const version = t.currentVersion + 1;
      this.#repos.transcriptions.insertVersion({
        transcriptionId: id,
        version,
        code: body.code,
        result: body.result,
        createdAt: at,
      });
      this.#repos.transcriptions.update({ ...t, currentVersion: version, updatedAt: at });
      if (body.ranOk) this.d.streak.qualify("sketch");
    });
    return this.transcription(id);
  }

  deleteTranscription(id: string): void {
    if (!this.#repos.transcriptions.delete(id)) throw notFound(`transcription ${id}`);
  }

  saveTranscriptionReview(id: string, review: unknown): boolean {
    const t = this.#repos.transcriptions.get(id);
    if (t === null) return false;
    this.#repos.transcriptions.update({ ...t, review, updatedAt: this.time.iso() });
    return true;
  }
}

// sketches, album, audio (media GETs with Range), transcriptions.
import type { AppDeps } from "../deps.ts";
import { badRequest } from "../errors.ts";
import { serveFile } from "../services/audio-store.ts";
import type { Mounter } from "./define.ts";

/** A partial body without its absent keys (`exactOptionalPropertyTypes`). */
function stripUndefined<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
}

function versionParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw badRequest("version must be a positive integer");
  return n;
}

export function libraryRoutes(mount: Mounter, d: AppDeps): void {
  const lib = d.services.library;

  mount("sketches.list", ({ query }) => ({
    items: lib.sketches({
      ...(query.origin === undefined ? {} : { origin: query.origin }),
      ...(query.archived === undefined ? {} : { archived: query.archived === "1" }),
    }),
  }));
  mount("sketches.create", ({ body }) => lib.createSketch(body));
  mount("sketches.get", ({ params }) => lib.sketch(params.id));
  mount("sketches.addVersion", ({ params, body }) => lib.addSketchVersion(params.id, body));
  mount("sketches.patch", ({ params, body }) => lib.patchSketch(params.id, body as never));
  mount("sketches.delete", ({ params }) => {
    lib.deleteSketch(params.id);
    return { ok: true as const };
  });

  mount("album.get", () => lib.album());
  mount("album.track", ({ params }) => lib.track(params.id));
  mount("album.createTrack", ({ body }) => lib.createTrack(body));
  mount("album.addVersion", ({ params, body }) => lib.addTrackVersion(params.id, body));
  mount("album.putAudio", ({ params, query, bytes, contentType }) => {
    const duration = query.durationS === undefined ? null : Number(query.durationS);
    if (duration !== null && !(Number.isFinite(duration) && duration >= 0))
      throw badRequest("durationS must be a number of seconds");
    return lib.putTrackAudio(params.id, versionParam(params.v), bytes, contentType, duration);
  });
  mount("album.getAudio", ({ params }, c) => {
    const a = lib.trackAudio(params.id, versionParam(params.v));
    return serveFile(a.abs, c.req.raw, { mime: a.mime, media: true });
  });
  mount("album.deleteTrack", ({ params }) => {
    lib.deleteTrack(params.id);
    return { ok: true as const };
  });

  mount("audio.upload", ({ query, bytes, contentType }) => lib.uploadAudio(query.name, bytes, contentType));
  mount("audio.get", ({ params }, c) => {
    const a = lib.audio(params.id);
    return serveFile(a.abs, c.req.raw, {
      mime: a.mime,
      media: true,
      cacheControl: "private, max-age=31536000, immutable",
    });
  });
  mount("audio.putPeaks", ({ params, bytes }) => {
    lib.putPeaks(params.id, bytes);
    return { ok: true as const };
  });
  mount("audio.getPeaks", ({ params }, c) =>
    serveFile(lib.peaks(params.id), c.req.raw, { mime: "application/octet-stream", media: true }),
  );
  mount("audio.delete", ({ params }) => {
    lib.deleteAudio(params.id);
    return { ok: true as const };
  });

  mount("transcriptions.list", () => ({ items: lib.transcriptions() }));
  mount("transcriptions.create", ({ body }) => lib.createTranscription(body));
  mount("transcriptions.get", ({ params }) => lib.transcription(params.id));
  mount("transcriptions.patch", ({ params, body }) => lib.patchTranscription(params.id, body as never));
  mount("transcriptions.addVersion", ({ params, body }) =>
    lib.addTranscriptionVersion(params.id, {
      code: body.code,
      result: body.result,
      ranOk: body.ranOk,
      ...(body.machineDraft === undefined ? {} : { machineDraft: body.machineDraft }),
    }),
  );
  mount("transcriptions.delete", ({ params }) => {
    lib.deleteTranscription(params.id);
    return { ok: true as const };
  });

  // Wave 4 (docs/design/wave4.md §5.2, §5.3): album versions, reviews attached, transcription settings.
  mount("album.patchVersion", ({ params, body }) =>
    lib.patchTrackVersion(params.id, versionParam(params.v), {
      ...(body.linerNotesMd === undefined ? {} : { linerNotesMd: body.linerNotesMd }),
      ...(body.includeReviewNote === undefined ? {} : { includeReviewNote: body.includeReviewNote }),
    }),
  );
  mount("album.attachReview", ({ params, body }) =>
    lib.attachTrackReview(params.id, versionParam(params.v), body),
  );
  mount("transcriptions.putSettings", ({ params, body }) =>
    lib.putTranscriptionSettings(params.id, stripUndefined(body)),
  );
}

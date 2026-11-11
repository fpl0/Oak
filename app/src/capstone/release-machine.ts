// The release flow (XState 5, ux §2.3): name the track, write its one line, choose whether Claude's liner note
// goes in, record the performance, listen back, release.
//
//   details → recording → take ⇄ recording → releasing → released
//                 ↘ details (error)         ↘ take (error)
//
// `record` and `release` are actors the workspace provides (the recorder and the server); the machine decides.
import type { Recording } from "@oak/strudel";
import { assign, fromPromise, setup } from "xstate";

export interface ReleaseDetails {
  title: string;
  /** The learner's one line for the liner notes. */
  line: string;
  includeReviewNote: boolean;
}

export interface ReleaseContext extends ReleaseDetails {
  recording: Recording | null;
  error: string | null;
  /** The released version (`AlbumTrackVersion.version`) and track. */
  trackId: string | null;
  version: number | null;
  audioError: string | null;
}

export type ReleaseEvent =
  | { type: "EDIT"; patch: Partial<ReleaseDetails> }
  | { type: "RECORD" }
  /** Only when this browser cannot record (no MediaRecorder): the album shows "No recording yet". */
  | { type: "RELEASE_WITHOUT_AUDIO" }
  | { type: "RELEASE" }
  | { type: "BACK" };

export interface ReleaseActorInput extends ReleaseDetails {
  recording: Recording | null;
}
export interface ReleaseActorOutput {
  trackId: string;
  version: number;
  audioError: string | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const releaseMachine = setup({
  types: {
    context: {} as ReleaseContext,
    events: {} as ReleaseEvent,
    input: {} as ReleaseDetails,
  },
  actors: {
    record: fromPromise<Recording, void>(async () => {
      throw new Error("record actor not provided");
    }),
    release: fromPromise<ReleaseActorOutput, ReleaseActorInput>(async () => {
      throw new Error("release actor not provided");
    }),
  },
  guards: {
    named: ({ context }) => context.title.trim().length > 0,
  },
}).createMachine({
  id: "capstone-release",
  context: ({ input }) => ({
    ...input,
    recording: null,
    error: null,
    trackId: null,
    version: null,
    audioError: null,
  }),
  initial: "details",
  states: {
    details: {
      on: {
        EDIT: { actions: assign(({ context, event }) => ({ ...context, ...event.patch, error: null })) },
        RECORD: { guard: "named", target: "recording" },
        RELEASE_WITHOUT_AUDIO: { guard: "named", target: "releasing" },
      },
    },
    recording: {
      entry: assign({ error: null, recording: null }),
      invoke: {
        src: "record",
        onDone: { target: "take", actions: assign({ recording: ({ event }) => event.output }) },
        onError: { target: "details", actions: assign({ error: ({ event }) => message(event.error) }) },
      },
    },
    take: {
      on: {
        RECORD: "recording",
        RELEASE: "releasing",
        BACK: "details",
        EDIT: { actions: assign(({ context, event }) => ({ ...context, ...event.patch })) },
      },
    },
    releasing: {
      entry: assign({ error: null }),
      invoke: {
        src: "release",
        input: ({ context }) => ({
          title: context.title.trim(),
          line: context.line.trim(),
          includeReviewNote: context.includeReviewNote,
          recording: context.recording,
        }),
        onDone: {
          target: "released",
          actions: assign({
            trackId: ({ event }) => event.output.trackId,
            version: ({ event }) => event.output.version,
            audioError: ({ event }) => event.output.audioError,
          }),
        },
        onError: [
          {
            guard: ({ context }) => context.recording !== null,
            target: "take",
            actions: assign({ error: ({ event }) => message(event.error) }),
          },
          { target: "details", actions: assign({ error: ({ event }) => message(event.error) }) },
        ],
      },
    },
    released: { type: "final" },
  },
});

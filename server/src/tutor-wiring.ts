// The seam between the server and the tutor service (server/src/tutor, owned by another session).
// Everything the server knows about the tutor's shape is in this file and in tutor-adapters/: the
// eight port adapters, `createDefaultTutor`, the review sink, and the status the health route reports.
// The contract routes whose wire shape differs from the tutor's own routes (timeline, usage, notes,
// card applied, note retract) are served by routes/tutor.ts and mounted before the tutor's app.
import type { BackendId } from "@oak/api";
import type { Hono } from "hono";
import type { ContentIndex } from "./content/index.ts";
import type { Repos } from "./db/repos/index.ts";
import type { GraderHosts } from "./deps.ts";
import type { Secrets } from "./secrets.ts";
import type { Services } from "./services/index.ts";
import { createDefaultTutor, type DefaultTutorDeps } from "./tutor/compose.ts";
import type { TutorPorts } from "./tutor/ports.ts";
import type { TutorService } from "./tutor/service-types.ts";
import { GraderAdapter } from "./tutor-adapters/grader.ts";
import { LessonContextAdapter } from "./tutor-adapters/lessons.ts";
import { ProgressAdapter } from "./tutor-adapters/progress.ts";
import {
  learnerClock,
  SettingsAdapter,
  SqliteConversationStore,
  SqliteNotesStore,
  SqliteUsageSink,
} from "./tutor-adapters/stores.ts";

export type TutorHealth = "ready" | "missing_key" | "invalid_key" | "unreachable";

export interface TutorWiring {
  /** Mount at the root: `/api/tutor/*` and the CLI backend's `/mcp/tutor`. */
  app: Hono;
  service: TutorService;
  ports: TutorPorts;
  lessons: LessonContextAdapter;
  status(): Promise<{ tutor: TutorHealth; backend: BackendId | null }>;
  /** After a key is pasted or removed, or the backend setting changes. */
  refresh(): void;
}

export interface TutorWiringDeps {
  repos: Repos;
  content: ContentIndex;
  services: Services;
  graders: GraderHosts;
  secrets: Secrets;
  now: () => Date;
  port: number;
  devPorts: readonly number[];
  /** Test and transport options passed through to `createDefaultTutor`. */
  tutor?: Pick<DefaultTutorDeps, "api" | "cli" | "idleTimeout" | "bunServer" | "heartbeatMs" | "log">;
}

export function createTutorWiring(d: TutorWiringDeps): TutorWiring {
  const clock = learnerClock(d.repos, d.now);
  const lessons = new LessonContextAdapter(d.content, d.repos);
  const ports: TutorPorts = {
    grader: new GraderAdapter(d.graders.tutor, d.repos, d.content),
    conversations: new SqliteConversationStore(d.repos, clock),
    notes: new SqliteNotesStore(d.repos, clock),
    lessons,
    progress: new ProgressAdapter(d.repos, d.content, {
      course: d.services.course,
      gates: d.services.gates,
      streak: d.services.streak,
    }),
    settings: new SettingsAdapter(d.repos, clock),
    usage: new SqliteUsageSink(d.repos),
    clock,
  };
  const tutor = createDefaultTutor({
    ports,
    apiKey: () => d.secrets.anthropicKey(),
    port: d.port,
    devPorts: d.devPorts,
    onReview: (accepted) => {
      if (accepted.reviewKind === "capstone")
        d.services.library.saveCapstoneReview(accepted.subject.subjectId, accepted.review);
      else d.services.library.saveTranscriptionReview(accepted.subject.subjectId, accepted.review);
    },
    ...(d.tutor ?? {}),
  });
  return {
    app: tutor.app,
    service: tutor.service,
    ports,
    lessons,
    async status() {
      try {
        const s = await tutor.service.status();
        return { tutor: s.tutor as TutorHealth, backend: s.active };
      } catch {
        return { tutor: "unreachable", backend: null };
      }
    },
    refresh: () => tutor.refresh(),
  };
}

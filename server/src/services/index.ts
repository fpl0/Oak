// Builds every service over one context, in dependency order.
import { freshness as cardFreshness } from "@oak/srs";
import type { OakConfig } from "../config.ts";
import { AudioStore } from "./audio-store.ts";
import { BackupService } from "./backup.ts";
import { CanDoService } from "./cando.ts";
import { CapstoneReleaseService } from "./capstone-release.ts";
import type { ServiceContext } from "./context.ts";
import { CourseService } from "./course.ts";
import { GatesService } from "./gates.ts";
import { type LadderGenerator, LibraryService, type PatternStimulus } from "./library.ts";
import { MasteryService } from "./mastery.ts";
import { OnboardingService } from "./onboarding.ts";
import { OpsService } from "./ops.ts";
import type { SrsPort } from "./ports.ts";
import { SessionsService } from "./sessions.ts";
import { StreakService } from "./streak.ts";
import { UnlocksService } from "./unlocks.ts";
import { VoiceService } from "./voice.ts";

export interface Services {
  ctx: ServiceContext;
  gates: GatesService;
  unlocks: UnlocksService;
  mastery: MasteryService;
  cando: CanDoService;
  streak: StreakService;
  course: CourseService;
  release: CapstoneReleaseService;
  onboarding: OnboardingService;
  sessions: SessionsService;
  library: LibraryService;
  ops: OpsService;
  backup: BackupService;
  store: AudioStore;
  voice: VoiceService;
}

export interface ServiceOptions {
  config: Pick<OakConfig, "audioDir" | "albumDir" | "backupsDir">;
  srs: () => SrsPort | null;
  stimulus?: PatternStimulus;
  ladder?: LadderGenerator;
}

export function createServices(ctx: ServiceContext, opts: ServiceOptions): Services {
  const gates = new GatesService(ctx);
  const unlocks = new UnlocksService(ctx, gates);
  const mastery = new MasteryService(ctx, {
    recall: (cardId) => opts.srs()?.recall(cardId) ?? null,
    lessonStatus: (id) => gates.lessonStatus(id),
  });
  const streak = new StreakService(ctx);
  const voice = new VoiceService(ctx, { gates });
  const sourceDone = (id: string): boolean => {
    if (ctx.content.lessonSite(id) !== null) return gates.lessonCompleted(id);
    if (ctx.content.checkpointMeta(id) !== null) return gates.checkpointPassed(id);
    if (ctx.content.capstoneMeta(id) !== null) return gates.capstoneReleased(id);
    return false;
  };
  const freshness = (skillId: string): number => {
    const input = mastery.inputOf(skillId);
    if (input === null || input.cards.length === 0) return 1;
    const total = input.cards.reduce((s, c) => s + c.weight, 0);
    return (
      input.cards.reduce((s, c) => s + c.weight * cardFreshness(c.retrievability, c.desiredRetention), 0) /
      total
    );
  };
  const cando = new CanDoService(ctx, { sourceDone, freshness });
  const course = new CourseService(ctx, { gates, unlocks, mastery, cando, streak, voice, srs: opts.srs });
  const store = new AudioStore(opts.config.audioDir, opts.config.albumDir);
  const sessions = new SessionsService(ctx, {
    gates,
    unlocks,
    streak,
    course,
    voice,
    tutorOff: () => ctx.repos.settings.get("tutor").backend === "off",
  });
  const library = new LibraryService(ctx, {
    streak,
    store,
    ...(opts.stimulus === undefined ? {} : { stimulus: opts.stimulus }),
    ...(opts.ladder === undefined ? {} : { ladder: opts.ladder }),
  });
  const release = new CapstoneReleaseService(ctx, { course, gates, library, unlocks, cando, streak });
  const onboarding = new OnboardingService(ctx, course);
  const ops = new OpsService(ctx, mastery);
  const backup = new BackupService(
    ctx.repos.db,
    { backupsDir: opts.config.backupsDir, store },
    { contentVersion: () => ctx.content.contentVersion, now: () => ctx.clock.now() },
  );
  return {
    ctx,
    gates,
    unlocks,
    mastery,
    cando,
    streak,
    course,
    release,
    onboarding,
    sessions,
    library,
    ops,
    backup,
    store,
    voice,
  };
}

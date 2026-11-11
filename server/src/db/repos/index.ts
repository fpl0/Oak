// Every repository over one connection. Services take this bundle; nothing else writes SQL.
import type { Db } from "../index.ts";
import { LessonsRepo } from "./lessons.ts";
import { AlbumRepo, AudioRepo, SketchesRepo, TranscriptionsRepo } from "./library.ts";
import { MasteryRepo } from "./mastery.ts";
import { ListenRepo, OnboardingRepo } from "./onboarding.ts";
import { OpsRepo } from "./ops.ts";
import { ProfileRepo, SettingsRepo } from "./profile.ts";
import { CanDoRepo, CapstonesRepo, CheckpointsRepo, TermsRepo, UnlocksRepo } from "./progress.ts";
import { GymRepo, SessionsRepo } from "./sessions.ts";
import { SrsRepo } from "./srs.ts";
import { StreakRepo } from "./streak.ts";
import { TutorRepo } from "./tutor.ts";

export interface Repos {
  db: Db;
  profile: ProfileRepo;
  settings: SettingsRepo;
  sessions: SessionsRepo;
  gym: GymRepo;
  lessons: LessonsRepo;
  mastery: MasteryRepo;
  srs: SrsRepo;
  streak: StreakRepo;
  unlocks: UnlocksRepo;
  cando: CanDoRepo;
  terms: TermsRepo;
  checkpoints: CheckpointsRepo;
  capstones: CapstonesRepo;
  sketches: SketchesRepo;
  album: AlbumRepo;
  audio: AudioRepo;
  transcriptions: TranscriptionsRepo;
  tutor: TutorRepo;
  ops: OpsRepo;
  onboarding: OnboardingRepo;
  listen: ListenRepo;
}

export function createRepos(db: Db, defaults: { timezone: string; now: () => Date }): Repos {
  return {
    db,
    profile: new ProfileRepo(db, defaults),
    settings: new SettingsRepo(db),
    sessions: new SessionsRepo(db),
    gym: new GymRepo(db),
    lessons: new LessonsRepo(db),
    mastery: new MasteryRepo(db),
    srs: new SrsRepo(db),
    streak: new StreakRepo(db),
    unlocks: new UnlocksRepo(db),
    cando: new CanDoRepo(db),
    terms: new TermsRepo(db),
    checkpoints: new CheckpointsRepo(db),
    capstones: new CapstonesRepo(db),
    sketches: new SketchesRepo(db),
    album: new AlbumRepo(db),
    audio: new AudioRepo(db),
    transcriptions: new TranscriptionsRepo(db),
    tutor: new TutorRepo(db),
    ops: new OpsRepo(db),
    onboarding: new OnboardingRepo(db),
    listen: new ListenRepo(db),
  };
}

export {
  AlbumRepo,
  AudioRepo,
  CanDoRepo,
  CapstonesRepo,
  CheckpointsRepo,
  GymRepo,
  LessonsRepo,
  ListenRepo,
  MasteryRepo,
  OnboardingRepo,
  OpsRepo,
  ProfileRepo,
  SessionsRepo,
  SettingsRepo,
  SketchesRepo,
  SrsRepo,
  StreakRepo,
  TermsRepo,
  TranscriptionsRepo,
  TutorRepo,
  UnlocksRepo,
};

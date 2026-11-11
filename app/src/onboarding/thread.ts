// The tutor thread of onboarding: one general-kind conversation of its own, so the first exchange stays together.
import type { SubjectRef } from "@oak/api";

export const ONBOARDING_THREAD: SubjectRef = { subjectKind: "general", subjectId: "onboarding" };

// `/onboarding` typed by hand (or an old bookmark): the same as Today's link, `/onboarding/1`, which resumes where
// the learner is, or says "You're set up" once onboarding is done. Never "This page isn't part of Oak".
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/onboarding/")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/$step", params: { step: "1" }, replace: true });
  },
});

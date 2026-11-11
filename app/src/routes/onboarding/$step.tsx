// Onboarding = U00 "Hello, Loop" and its set-up (focus mode, ux §8; contracts §2.3 U00, §8). The flow lives in
// app/src/onboarding; this file only binds it to the URL. `/onboarding/1` (Today's link) resumes where the learner is.
import { createFileRoute } from "@tanstack/react-router";
import { OnboardingFlow } from "../../onboarding/OnboardingFlow.tsx";

export const Route = createFileRoute("/onboarding/$step")({ component: Onboarding });

function Onboarding() {
  const { step } = Route.useParams();
  return <OnboardingFlow param={step} />;
}

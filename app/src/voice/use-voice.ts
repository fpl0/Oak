// One hook for the voice state every surface shares (contracts §8.2, §8.5): Quiet mode and the tolerance
// ladder, read from `GET /voice` and written through `PUT /voice/quiet` and `PUT /voice/ladder`. While the
// server answers those with the typed 501 (docs/design/wave3.md §4.1) — or on an older server — it reads and
// writes the profile instead, which has always carried `quiet` and the tolerance, so the switch never dead-ends.
// Lessons, drills and the mic chip can use it as is: `useVoice().quiet.quiet` is the one answer to "may I ask
// for the mic?".
import type { Profile, VoiceLadderSet, VoiceState } from "@oak/api";
import { useProfile, useVoiceLadder, useVoiceQuiet, useVoiceState } from "../lib/queries.ts";
import { useUpdateProfile } from "../lib/settings.ts";
import { toast } from "../ui/kit/Toast.tsx";
import { isNotBuilt, type LadderView, ladderViewOf, type QuietView, quietViewOf } from "./state.ts";
import { announceQuiet } from "./sync.ts";

export interface Voice {
  /** Loaded: the profile has arrived (and `GET /voice` answered or is known to be missing). */
  ready: boolean;
  /** Where the values come from. */
  source: "server" | "profile";
  profile: Profile | null;
  state: VoiceState | null;
  quiet: QuietView;
  ladder: LadderView;
  pending: boolean;
  setQuiet(quiet: boolean, scope: "today" | "always"): Promise<void>;
  setLadder(body: VoiceLadderSet): Promise<void>;
}

const NO_PROFILE: Pick<Profile, "quiet" | "inputKind" | "singToleranceCents" | "singTolMode"> = {
  quiet: false,
  inputKind: "builtin",
  singToleranceCents: 70,
  singTolMode: "auto",
};

export function useVoice(): Voice {
  const profileQ = useProfile();
  const voiceQ = useVoiceState();
  const quietM = useVoiceQuiet();
  const ladderM = useVoiceLadder();
  const profileUpdate = useUpdateProfile();
  const state = voiceQ.data ?? null;
  const server = state !== null;
  const profile = profileQ.data ?? null;
  const p = profile ?? NO_PROFILE;
  const settled = voiceQ.isSuccess || voiceQ.isError;

  async function setQuiet(quiet: boolean, scope: "today" | "always") {
    try {
      await quietM.mutateAsync({ body: { quiet, scope } });
      announceQuiet(quiet);
    } catch (e) {
      if (isNotBuilt(e) || (!server && voiceQ.isError)) {
        // The profile keeps Quiet mode until it is switched off ("today" cannot lapse on its own there).
        profileUpdate.set({ quiet });
        return;
      }
      toast.error("Quiet mode wasn't changed", e instanceof Error ? e.message : undefined);
    }
  }

  async function setLadder(body: VoiceLadderSet) {
    try {
      await ladderM.mutateAsync({ body });
    } catch (e) {
      if (isNotBuilt(e) || (!server && voiceQ.isError)) {
        if (body.mode === "auto") profileUpdate.set({ singTolMode: "auto" });
        else if (body.mode === "fixed" && body.cents !== undefined)
          profileUpdate.set({ singTolMode: "fixed", singToleranceCents: body.cents });
        return;
      }
      toast.error("The tolerance wasn't changed", e instanceof Error ? e.message : undefined);
    }
  }

  return {
    ready: profileQ.isSuccess && settled,
    source: server ? "server" : "profile",
    profile,
    state,
    quiet: quietViewOf(state, p),
    ladder: ladderViewOf(state?.ladder ?? null, p),
    pending: quietM.isPending || ladderM.isPending || profileUpdate.pending,
    setQuiet,
    setLadder,
  };
}

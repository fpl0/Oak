import * as webaudio from "@strudel/webaudio";
import { LIMITER, limiterMakeupDb } from "../master-bus.ts";

/** The recorded branch of createMasterBus, using its exact limiter and makeup trim.
 * OfflineAudioContext has no MediaStream destination, volume UI or meter to attach. */
export function attachOfflineMaster(ctx: OfflineAudioContext): void {
  const output = webaudio.getSuperdoughAudioController().output as { destinationGain: GainNode };
  const limiter = new DynamicsCompressorNode(ctx, LIMITER);
  const trim = new GainNode(ctx, { gain: 10 ** (-limiterMakeupDb() / 20) });
  output.destinationGain.disconnect();
  output.destinationGain.connect(limiter);
  limiter.connect(trim);
  trim.connect(ctx.destination);
}

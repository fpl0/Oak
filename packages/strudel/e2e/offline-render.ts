import { installPieceRenderFrame } from "../src/offline/frame.ts";

// The abort probe retains only context handles, so it can observe a detached realm stop rendering.
const Original = window.OfflineAudioContext;
window.OfflineAudioContext = class extends Original {
  constructor(...args: ConstructorParameters<typeof OfflineAudioContext>) {
    super(...args);
    const parent = window.parent as Window & { __offlineContexts?: OfflineAudioContext[] };
    parent.__offlineContexts?.push(this);
  }
} as typeof OfflineAudioContext;

installPieceRenderFrame();

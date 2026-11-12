// The offline render frame of the audibility harness (one render per frame instance).
import { installRenderFrame } from "../src/audibility/render-frame.ts";
import { SOUNDS_ROOT } from "./pack-root.ts";

installRenderFrame(SOUNDS_ROOT);

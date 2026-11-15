// The offline renderer's frame (app/offline-render.html): a hidden same-origin iframe that renders one piece to
// PCM faster than real time and posts it back to the page (@oak/strudel/offline `renderPiece`). It holds no app
// state and loads nothing else of the app.
import { installPieceRenderFrame } from "@oak/strudel/offline/frame";

installPieceRenderFrame();

// Worker entry, shared by the browser module Worker and the Bun Worker. It uses no Bun API and no DOM:
// only `postMessage` / `onmessage` of the worker scope. Capture `postMessage` before any evaluation,
// mute the console around the dynamic import of the runtime, answer `init` with `ready`.
export {};

throw new Error("@oak/grader: worker.ts is not implemented yet");

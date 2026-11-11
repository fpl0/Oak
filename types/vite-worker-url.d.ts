// Vite import suffixes used outside the app (so packages do not need `vite/client` in their types).
// `?worker&url` is the only proven way to load an AudioWorklet in dev and build (spike S5); never use
// `new URL("./x.worklet.ts", import.meta.url)` for worklets.
declare module "*?worker&url" {
  const url: string;
  export default url;
}
declare module "*?worker" {
  const WorkerFactory: new (options?: { name?: string }) => Worker;
  export default WorkerFactory;
}
declare module "*?url" {
  const url: string;
  export default url;
}
declare module "*?raw" {
  const text: string;
  export default text;
}

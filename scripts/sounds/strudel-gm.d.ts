// @strudel/soundfonts ships no types. gm.mjs maps gm_* names to WebAudioFont file stems, in `n` order.
declare module "@strudel/soundfonts/gm.mjs" {
  const gm: Record<string, string[]>;
  export default gm;
}

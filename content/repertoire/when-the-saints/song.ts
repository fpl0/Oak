// When the Saints Go Marching In, the first line, "Oh when the saints | go marching in": one four-note
// figure (1 3 4 | 5, held) sung twice. The tune begins with a three-note pickup; here each pickup sits on
// beats 2–4 of a bar that opens with a rest (no pickup before U07.L08), as U02.L08 and U03.L09 play it.
import { fragmentSong } from "../fragment.ts";

export const setting = "The three-note pickup moved into a bar of its own that opens with a rest.";
export default fragmentSong({
  id: "song.when-the-saints",
  bpm: 108,
  degrees: "<[~ 0 2 3] [4@4] [~ 0 2 3] [4@4]>",
  bars: 4,
  setting,
});

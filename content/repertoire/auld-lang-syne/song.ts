// Auld Lang Syne, the first phrase from the first full bar: the pickup ("Should") is left out. Plain
// rhythm: each dotted quarter and eighth becomes two quarters; the last note is held for the bar.
import { fragmentSong } from "../fragment.ts";

export const setting =
  "From the first full bar (the pickup is left out); dotted quarter and eighth pairs become two quarters.";
export default fragmentSong({
  id: "song.auld-lang-syne",
  bpm: 80,
  degrees: "<[0 0 0 2] [1 0 1 2] [0 0 2 4] [5@4]>",
  bars: 4,
  setting,
});

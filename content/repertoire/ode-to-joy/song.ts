// Ode to Joy, the theme's first phrase (bars 1–4), as U02.L08 and U03.L09 play it. Plain rhythm: bar 4's
// dotted quarter and eighth (3. 2) become two quarters, and the last 2 is held for two beats.
import { fragmentSong } from "../fragment.ts";

export const setting =
  "Plain rhythm: bar 4's dotted quarter and eighth become two quarters; the last note is held for two beats.";
export default fragmentSong({
  id: "song.ode-to-joy",
  bpm: 100,
  degrees: "<[2 2 3 4] [4 3 2 1] [0 0 1 2] [2 1 1@2]>",
  bars: 4,
  setting,
});

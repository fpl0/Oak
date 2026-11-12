// Michael, Row the Boat Ashore, "Michael, row the boat ashore, Hallelujah" from the first full bar: the
// pickup ("Mi-") is left out. The familiar tune; the verifier must compare it with the 1867 printing
// (Slave Songs of the United States), not with the 1954 folk-revival adaptation, and change it to the
// 1867 notes where they differ.
import { fragmentSong } from "../fragment.ts";

export const setting = "From the first full bar (the pickup is left out); plain quarters and halves.";
export default fragmentSong({
  id: "song.michael-row",
  bpm: 96,
  degrees: "<[2 4 2 4] [5 4@2 ~] [~ 2 4 5] [4@4]>",
  bars: 4,
  setting,
});

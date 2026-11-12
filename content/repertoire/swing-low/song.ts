// Swing Low, Sweet Chariot, the opening of the chorus ("Swing low, sweet chariot"). Plain rhythm: Swing and
// low on half notes, "sweet" held two beats, "char-i-" on quarters, landing on a held 5 below home; bar 4
// rests.
import { fragmentSong } from "../fragment.ts";

export const setting = 'Plain rhythm: half notes and quarters only; the slide on "low" is one note.';
export default fragmentSong({
  id: "song.swing-low",
  bpm: 72,
  degrees: "<[2@2 0@2] [2@2 0 -2] [-3@4] ~>",
  bars: 4,
  setting,
});

// Can-do statements (contracts §1.2, curriculum can-do areas): "I can …" in the learner's words, the skill
// nodes they summarise, and the lesson, checkpoint or capstone that first awards them. Lessons list them
// in `LessonDef.canDo`; capstones in `CapstoneDef.canDo`.
import { type CanDoArea, type CanDoDef, type CanDoId, defineCanDo, type SkillId } from "@oak/content-kit";

const c = (id: string, area: CanDoArea, statement: string, skills: string, source: CanDoDef["source"]) =>
  defineCanDo({ id: id as CanDoId, area, statement, skills: skills.split(" ") as SkillId[], source });

// biome-ignore format: one can-do to a line
export const candos: readonly CanDoDef[] = [
  // hear
  c("cd.hear.pulse", "hear", "I can find the beat in a groove and keep it going.", "R01 E01", "U01.L01"),
  c("cd.hear.higher-lower", "hear", "I can tell which of two notes is higher.", "E02", "U02.L01"),
  c("cd.hear.home", "hear", "I can hear which note is home in a melody.", "E03", "U03.L01"),
  c("cd.hear.degrees", "hear", "I can name degrees 1 to 7 in a major key by ear.", "E04 E05", "U03.L04"),
  c("cd.hear.intervals", "hear", "I can name the distance between two notes in a key.", "E06", "U04.L04"),
  c("cd.hear.triads", "hear", "I can tell major, minor, diminished and augmented chords apart.", "E08", "U05.L03"),
  c("cd.hear.bass", "hear", "I can hear the bass degree under a chord progression.", "E09", "U06.L05"),
  c("cd.hear.cadences", "hear", "I can hear whether a phrase ends closed or open.", "H03", "U06.L04"),
  c("cd.hear.minor", "hear", "I can tell a major key from a minor one.", "E10", "U10.L03"),
  c("cd.hear.sevenths", "hear", "I can tell seventh-chord qualities apart.", "E11", "U12.L02"),
  c("cd.hear.chromatic", "hear", "I can hear chromatic degrees and borrowed chords.", "E12a E12b", "U16.L05"),
  c("cd.hear.key-change", "hear", "I can hear where a song changes key.", "E13", "U17.L03"),
  c("cd.hear.meter", "hear", "I can tell a groove in three from a groove in four.", "R08", "U01.L08"),
  c("cd.hear.swing", "hear", "I can hear whether a groove is straight or swung.", "R13", "U11.L07"),
  // read
  c("cd.read.count-four", "read", "I can find beat 1, count a bar of four, and use a rest as part of a rhythm.", "R03 R06", "U01.L02"),
  c("cd.read.rhythm", "read", "I can read whole, half, quarter and eighth notes on the percussion staff.", "N01", "U01.L05"),
  c("cd.read.sixteenths", "read", "I can count 1-e-&-a and write sixteenth-note patterns.", "R07", "U01.L06"),
  c("cd.read.half-whole", "read", "I can find half and whole steps and name the black keys as sharps or flats.", "P03 P04", "U02.L03"),
  c("cd.read.treble", "read", "I can read notes on the treble staff.", "N02", "U02.L04"),
  c("cd.read.play-from-page", "read", "I can play a short tune from the treble staff in code.", "N02 D05", "U02.L08"),
  c("cd.read.keysig", "read", "I can name a major key from its key signature.", "N03 S04", "U03.L06"),
  c("cd.read.bass-clef", "read", "I can read notes on the bass clef.", "N04", "U05.L06"),
  c("cd.read.chord-symbols", "read", "I can read lead-sheet chord symbols.", "N05", "U05.L04"),
  c("cd.read.roman", "read", "I can name chords with Roman numerals in a major key.", "N06", "U06.L02"),
  c("cd.read.leadsheet", "read", "I can play a song from a lead sheet.", "N07", "U07.L09"),
  c("cd.read.jazz-symbols", "read", "I can read jazz chord symbols for sevenths, sixths and sus chords.", "J01", "J1.L02"),
  // write
  c("cd.write.scale", "write", "I can spell any major scale.", "S01", "U03.L01"),
  c("cd.write.triads", "write", "I can build a triad on any degree of a key.", "C01 H01", "U06.L01"),
  c("cd.write.voice-leading", "write", "I can voice a progression so each note moves as little as possible.", "C05", "U05.L07"),
  c("cd.write.bass-line", "write", "I can write a bass line from the chords.", "B01 B02", "U08.L02"),
  // compose
  c("cd.compose.backbeat", "compose", "I can write a backbeat groove with one line per drum.", "R04", "U01.L03"),
  c("cd.compose.fill", "compose", "I can vary a four-bar phrase and end it with a fill.", "R04 R07", "U01.L07"),
  c("cd.compose.drum-intro", "compose", "I can write a drum intro with a fill.", "R04 R07", "C0"),
  c("cd.compose.first-loop", "compose", "I can write a 4-bar loop with drums, bass and a riff.", "R04 P05", "C1"),
  c("cd.compose.melody-on-1", "compose", "I can write an 8-bar melody that ends at home.", "M01 S03", "U03.L11"),
  c("cd.compose.fourchord", "compose", "I can write a four-chord song that loops, then lands.", "H04 H03 M03", "C2"),
  c("cd.compose.verse-chorus", "compose", "I can arrange a song in verse–chorus form with contrast.", "F02 F05", "C3"),
  c("cd.compose.minor-ballad", "compose", "I can write in a minor key with a strong cadence.", "H08 H09", "C4"),
  c("cd.compose.twelve-bar", "compose", "I can write a 12-bar blues with a shuffle feel.", "H10 F04 R13", "C5"),
  c("cd.compose.modal-vamp", "compose", "I can write a modal vamp that shows the mode's colour.", "S12 H11", "C6"),
  c("cd.compose.chromatic", "compose", "I can colour a song with secondary dominants, borrowed chords and a key lift.", "H12 H13 H14", "C7"),
  c("cd.compose.album-single", "compose", "I can finish a two-minute song with a bridge.", "F02 F03 H14", "CF-A"),
  c("cd.compose.ii-v-ballad", "compose", "I can write a ballad over ii–V–I changes in several keys.", "J04 J05 J07", "JC1"),
  c("cd.compose.jazz-blues", "compose", "I can comp and walk a jazz blues from one chord pattern.", "J11 B05", "JC2"),
  c("cd.compose.contrafact", "compose", "I can write a new head on rhythm changes.", "J12", "JC3"),
  c("cd.compose.reharm", "compose", "I can reharmonize a standard without changing its melody.", "J13 J14", "JC4"),
  c("cd.compose.funk", "compose", "I can build a 16th-note funk pocket with ghost notes.", "R14 R15", "RC1"),
  c("cd.compose.clave", "compose", "I can lock a groove to son clave with a tresillo bass.", "R18 R17", "RC2"),
  c("cd.compose.two-genres", "compose", "I can arrange one tune in two genres.", "D09", "AC1"),
  c("cd.compose.neo-soul", "compose", "I can produce a neo-soul ballad with extended chords and a laid-back feel.", "D09 D10 J02", "AC2"),
  // transcribe
  c("cd.transcribe.drums", "transcribe", "I can copy a drum loop by ear.", "E01", "U01.L09"),
  c("cd.transcribe.melody", "transcribe", "I can write down a short melody by ear.", "E07", "U03.L10"),
  c("cd.transcribe.folk-tune", "transcribe", "I can transcribe a folk tune phrase by phrase.", "E07 E09", "X1"),
  c("cd.transcribe.blues", "transcribe", "I can transcribe a blues: bass, changes, melody.", "E09 E07", "X2"),
  c("cd.transcribe.standard", "transcribe", "I can transcribe a standard's form, bass, changes and melody.", "E13 E07", "CF-T"),
  // sing
  c("cd.sing.first-note", "sing", "I can sing back a note I hear.", "V01", "U00.L02"),
  c("cd.sing.echo", "sing", "I can sing back a short phrase of two or three notes.", "V01 E02", "U02.L07"),
  c("cd.sing.degrees", "sing", "I can sing degrees on numbers and syllables.", "V02 V03", "U03.L08"),
  c("cd.sing.sight", "sing", "I can sight-sing a simple tune from the staff.", "V04", "U03.L09"),
  c("cd.sing.bass", "sing", "I can sing the roots of a progression.", "V05", "U06.L05"),
  c("cd.sing.guide-tones", "sing", "I can sing guide-tone lines through a ii–V–I.", "V06", "J1.L04"),
  // code
  c("cd.code.first-loop", "code", "I can start, stop and change a loop in code.", "D01", "U00.L01"),
  c("cd.code.tempo", "code", "I can set a tempo and write a one-line beat.", "R02", "U01.L01"),
  c("cd.code.subdivision", "code", "I can split a beat in two with [ ] and write eighth-note hats.", "R05", "U01.L04"),
  c("cd.code.notes", "code", "I can write a melody with note names and octaves.", "P02 P05", "U02.L02"),
  c("cd.code.transpose", "code", "I can move a melody up or down by half steps with .transpose().", "P06", "U02.L05"),
  c("cd.code.timbre", "code", "I can play the same line on different instruments and synth waves.", "D01", "U02.L06"),
  c("cd.code.degrees", "code", "I can write a melody as degrees with n() and .scale().", "S02", "U03.L02"),
  c("cd.code.chords", "code", "I can write chords as symbols and let Strudel voice them.", "C05 N05", "U05.L08"),
  c("cd.code.arrange", "code", "I can arrange sections with one arrange() per track.", "F02 F06", "U09.L02"),
];
export default candos;

export const candoById: ReadonlyMap<string, CanDoDef> = new Map(candos.map((x) => [x.id, x] as const));

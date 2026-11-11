// The repertoire pool by stage (contracts §2.8, §2.9): metadata for every song the course, the ladder and
// the transcription capstones may use. Answer keys come in later waves as
// content/repertoire/<song-id>/song.ts (`defineSong`), which also needs `verifiedBy`: the human who checks
// the answer key against the cited score. Until then each entry carries a CANDIDATE source (a score or
// collection published in 1930 or earlier) with `verified: false`; content CI fails a `song.ts` that
// lacks both, and never lets an unverified source pass as checked. Oak ships only its own renditions:
// never a recording, never lyrics of a non-PD text. `key` and `meter` are Oak's teaching rendition.
import type { CapstoneId, KeySpec, LessonId, MeterId, PickupSpec, SongId } from "@oak/content-kit";

export type RepertoireStage = "reading" | "folk" | "minor" | "blues" | "standards";
export interface RepertoireEntry {
  id: SongId;
  title: string;
  year: number | "trad";
  status: "US-PD" | "trad";
  /** Candidate source for the answer key; `verified` turns true only when a human has checked it. */
  provenance: { source: string; year: number };
  verified: false;
  key: KeySpec;
  meter: MeterId;
  pickup?: PickupSpec;
  form: string;
  stage: RepertoireStage;
  /** Transcription-ladder level (L5 folk, L6 blues and standards, L8 CF-T). */
  ladder?: 5 | 6 | 8;
  /** Not before this lesson (Drunken Sailor from U14). Also: before U13 only fragments with no ties or dots. */
  availableFrom?: LessonId;
  /** Lessons and capstones that name it. */
  usedIn: (LessonId | CapstoneId)[];
  /** "Further standards … only when verified" (§2.8): never offered until `verified`. */
  onlyWhenVerified?: true;
  note?: string;
}

const C: KeySpec = { tonic: "C", mode: "major" };
const F: KeySpec = { tonic: "F", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };
const D: KeySpec = { tonic: "D", mode: "major" };
const Bb: KeySpec = { tonic: "Bb", mode: "major" };
const Am: KeySpec = { tonic: "A", mode: "minor" };
const Dm: KeySpec = { tonic: "D", mode: "minor" };
const Em: KeySpec = { tonic: "E", mode: "minor" };
const Ddor: KeySpec = { tonic: "D", mode: "dorian" };
const Amix: KeySpec = { tonic: "A", mode: "mixolydian" };
const TBV = "an edition published in 1930 or earlier, to be chosen by the verifier";

type E = Omit<RepertoireEntry, "verified">;
const song = (e: E): RepertoireEntry => ({ ...e, verified: false });

// biome-ignore format: one song to a line
export const repertoire: readonly RepertoireEntry[] = [
  // U02–U03 reading, tunes by number, first by-ear work
  song({ id: "song.ode-to-joy", title: "Ode to Joy (theme)", year: 1824, status: "US-PD", provenance: { source: "L. van Beethoven, Symphony No. 9, Op. 125, first edition (Schott)", year: 1826 }, key: C, meter: "4/4", form: "AA'BA'", stage: "reading", usedIn: ["U02.L08"] }),
  song({ id: "song.when-the-saints", title: "When the Saints Go Marching In", year: "trad", status: "trad", provenance: { source: "K. E. Purvis and J. M. Black, \"When the Saints Are Marching In\"", year: 1896 }, key: F, meter: "4/4", form: "strophic", stage: "reading", usedIn: ["U02.L08"], note: "The familiar tune begins with a pickup: before U07.L08 start at the first full bar." }),
  song({ id: "song.auld-lang-syne", title: "Auld Lang Syne", year: "trad", status: "trad", provenance: { source: "G. Thomson, A Select Collection of Original Scottish Airs", year: 1799 }, key: F, meter: "4/4", pickup: { units: [1, 4] }, form: "verse chorus", stage: "reading", usedIn: ["U03.L10"], note: "Begins with a pickup: before U07.L08 use a setting that starts at the first full bar." }),
  song({ id: "song.swing-low", title: "Swing Low, Sweet Chariot", year: "trad", status: "trad", provenance: { source: "Jubilee Songs, as Sung by the Fisk Jubilee Singers", year: 1872 }, key: F, meter: "4/4", form: "verse chorus", stage: "reading", usedIn: ["U03.L10"] }),
  song({ id: "song.michael-row", title: "Michael, Row the Boat Ashore", year: "trad", status: "trad", provenance: { source: "W. F. Allen, C. P. Ware and L. M. Garrison, Slave Songs of the United States", year: 1867 }, key: C, meter: "4/4", pickup: { units: [1, 4] }, form: "strophic", stage: "reading", usedIn: ["U03.L10"], note: "Begins with a pickup: before U07.L08 use a setting that starts at the first full bar." }),
  song({ id: "song.down-by-the-riverside", title: "Down by the Riverside", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: C, meter: "4/4", form: "verse chorus", stage: "reading", usedIn: [] }),
  // Ladder L5 (PD folk), U07, X1
  song({ id: "song.aura-lee", title: "Aura Lee", year: 1861, status: "US-PD", provenance: { source: "G. R. Poulton and W. W. Fosdick, \"Aura Lea\", sheet music", year: 1861 }, key: C, meter: "4/4", form: "verse chorus (4 phrases)", stage: "folk", ladder: 5, usedIn: ["X1"] }),
  song({ id: "song.red-river-valley", title: "Red River Valley", year: "trad", status: "trad", provenance: { source: "J. J. Kerrigan, \"In the Bright Mohawk Valley\"", year: 1896 }, key: C, meter: "4/4", form: "verse chorus (4 phrases)", stage: "folk", ladder: 5, usedIn: ["X1"] }),
  song({ id: "song.shenandoah", title: "Shenandoah", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: D, meter: "4/4", form: "strophic", stage: "folk", ladder: 5, usedIn: [] }),
  song({ id: "song.drunken-sailor", title: "Drunken Sailor", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: Ddor, meter: "4/4", form: "verse chorus", stage: "folk", ladder: 5, availableFrom: "U14.L03", usedIn: ["U14.L03"] }),
  song({ id: "song.scarborough-fair", title: "Scarborough Fair", year: "trad", status: "trad", provenance: { source: "F. Kidson, Traditional Tunes", year: 1891 }, key: Ddor, meter: "3/4", form: "strophic", stage: "folk", ladder: 5, availableFrom: "U14.L03", usedIn: ["U14.L03"], note: "The traditional melody only; never the 1966 arrangement." }),
  song({ id: "song.amazing-grace", title: "Amazing Grace (New Britain)", year: "trad", status: "trad", provenance: { source: "W. Walker, The Southern Harmony (\"New Britain\")", year: 1835 }, key: F, meter: "3/4", pickup: { units: [1, 3] }, form: "strophic (4 phrases)", stage: "folk", availableFrom: "U07.L09", usedIn: ["U07.L09"], note: "U07.L09 reading only; never X1." }),
  song({ id: "song.simple-gifts", title: "Simple Gifts", year: 1848, status: "US-PD", provenance: { source: TBV, year: 1930 }, key: F, meter: "4/4", form: "AB", stage: "folk", ladder: 5, usedIn: [] }),
  song({ id: "song.oh-susanna", title: "Oh! Susanna", year: 1848, status: "US-PD", provenance: { source: "S. C. Foster, \"Oh! Susanna\", sheet music", year: 1848 }, key: G, meter: "4/4", form: "verse chorus", stage: "folk", ladder: 5, usedIn: [] }),
  // U10 minor
  song({ id: "song.wayfaring-stranger", title: "Wayfaring Stranger", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: Dm, meter: "3/4", form: "strophic", stage: "minor", availableFrom: "U10.L09", usedIn: ["U10.L09"] }),
  song({ id: "song.go-down-moses", title: "Go Down Moses", year: "trad", status: "trad", provenance: { source: "Jubilee Songs, as Sung by the Fisk Jubilee Singers", year: 1872 }, key: Am, meter: "4/4", form: "verse refrain", stage: "minor", availableFrom: "U10.L09", usedIn: ["U10.L09"] }),
  song({ id: "song.joshua-fit-the-battle", title: "Joshua Fit the Battle", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: Dm, meter: "4/4", form: "verse refrain", stage: "minor", usedIn: [] }),
  song({ id: "song.greensleeves", title: "Greensleeves", year: "trad", status: "trad", provenance: { source: "W. Chappell, Popular Music of the Olden Time", year: 1859 }, key: Em, meter: "6/8", form: "AB", stage: "minor", usedIn: [] }),
  // Ladder L6, U11, X2, U14, AC1
  song({ id: "song.st-louis-blues", title: "St. Louis Blues (12-bar strain)", year: 1914, status: "US-PD", provenance: { source: "W. C. Handy, \"The St. Louis Blues\", sheet music", year: 1914 }, key: G, meter: "4/4", form: "12-bar blues strain", stage: "blues", ladder: 6, usedIn: ["U11.L08", "X2", "AC1"] }),
  song({ id: "song.memphis-blues", title: "Memphis Blues", year: 1912, status: "US-PD", provenance: { source: "W. C. Handy, \"The Memphis Blues\", sheet music", year: 1912 }, key: F, meter: "4/4", form: "12-bar blues strains", stage: "blues", ladder: 6, usedIn: [] }),
  song({ id: "song.careless-love", title: "Careless Love", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: F, meter: "4/4", form: "16-bar verse", stage: "blues", ladder: 6, usedIn: ["X2"] }),
  song({ id: "song.frankie-and-johnny", title: "Frankie and Johnny", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: C, meter: "4/4", form: "12-bar verse", stage: "blues", ladder: 6, usedIn: [] }),
  song({ id: "song.old-joe-clark", title: "Old Joe Clark", year: "trad", status: "trad", provenance: { source: TBV, year: 1930 }, key: Amix, meter: "4/4", form: "AB", stage: "blues", ladder: 6, availableFrom: "U14.L02", usedIn: ["U14.L02"] }),
  song({ id: "song.the-entertainer", title: "The Entertainer (A strain)", year: 1902, status: "US-PD", provenance: { source: "S. Joplin, \"The Entertainer\", sheet music (John Stark & Son)", year: 1902 }, key: C, meter: "2/4", form: "A strain", stage: "blues", ladder: 6, usedIn: [] }),
  song({ id: "song.sweet-georgia-brown", title: "Sweet Georgia Brown", year: 1925, status: "US-PD", provenance: { source: "B. Bernie, M. Pinkard and K. Casey, \"Sweet Georgia Brown\", sheet music", year: 1925 }, key: F, meter: "4/4", form: "ABAC", stage: "blues", ladder: 6, availableFrom: "U15.L05", usedIn: ["U15.L05", "AC1"] }),
  // U15–U17, CF-T, J track
  song({ id: "song.five-foot-two", title: "Five Foot Two, Eyes of Blue", year: 1925, status: "US-PD", provenance: { source: "R. Henderson, S. M. Lewis and J. Young, sheet music", year: 1925 }, key: C, meter: "4/4", form: "ABAC", stage: "standards", ladder: 8, usedIn: ["U15.L05", "CF-T"] }),
  song({ id: "song.aint-she-sweet", title: "Ain't She Sweet", year: 1927, status: "US-PD", provenance: { source: "M. Ager and J. Yellen, sheet music", year: 1927 }, key: C, meter: "4/4", form: "AABA", stage: "standards", ladder: 8, usedIn: ["CF-T"] }),
  song({ id: "song.bye-bye-blackbird", title: "Bye Bye Blackbird", year: 1926, status: "US-PD", provenance: { source: "R. Henderson and M. Dixon, sheet music", year: 1926 }, key: F, meter: "4/4", form: "ABAC", stage: "standards", ladder: 8, usedIn: ["CF-T"] }),
  song({ id: "song.body-and-soul", title: "Body and Soul", year: 1930, status: "US-PD", provenance: { source: "J. Green, E. Heyman, R. Sour and F. Eyton, sheet music", year: 1930 }, key: { tonic: "Db", mode: "major" }, meter: "4/4", form: "AABA", stage: "standards", ladder: 6, usedIn: ["U17.L04", "JC4"] }),
  song({ id: "song.georgia-on-my-mind", title: "Georgia on My Mind", year: 1930, status: "US-PD", provenance: { source: "H. Carmichael and S. Gorrell, sheet music", year: 1930 }, key: F, meter: "4/4", form: "AABA", stage: "standards", ladder: 6, usedIn: ["JC4"] }),
  song({ id: "song.i-got-rhythm", title: "I Got Rhythm", year: 1930, status: "US-PD", provenance: { source: "G. and I. Gershwin, \"I Got Rhythm\" (Girl Crazy), sheet music", year: 1930 }, key: Bb, meter: "4/4", form: "AABA", stage: "standards", ladder: 6, usedIn: ["J4.L03", "JC3"] }),
  song({ id: "song.blue-skies", title: "Blue Skies", year: 1926, status: "US-PD", provenance: { source: "I. Berlin, sheet music", year: 1927 }, key: C, meter: "4/4", form: "AABA", stage: "standards", usedIn: [], onlyWhenVerified: true }),
  song({ id: "song.aint-misbehavin", title: "Ain't Misbehavin'", year: 1929, status: "US-PD", provenance: { source: "T. Waller, H. Brooks and A. Razaf, sheet music", year: 1929 }, key: Bb, meter: "4/4", form: "AABA", stage: "standards", usedIn: [], onlyWhenVerified: true }),
  song({ id: "song.honeysuckle-rose", title: "Honeysuckle Rose", year: 1929, status: "US-PD", provenance: { source: "T. Waller and A. Razaf, sheet music", year: 1929 }, key: F, meter: "4/4", form: "AABA", stage: "standards", usedIn: [], onlyWhenVerified: true }),
  song({ id: "song.sunny-side-of-the-street", title: "On the Sunny Side of the Street", year: 1930, status: "US-PD", provenance: { source: "J. McHugh and D. Fields, sheet music", year: 1930 }, key: C, meter: "4/4", form: "AABA", stage: "standards", usedIn: [], onlyWhenVerified: true }),
  song({ id: "song.tea-for-two", title: "Tea for Two", year: 1924, status: "US-PD", provenance: { source: "V. Youmans and I. Caesar, sheet music", year: 1924 }, key: { tonic: "Ab", mode: "major" }, meter: "4/4", form: "ABAC", stage: "standards", usedIn: [], onlyWhenVerified: true }),
  song({ id: "song.lady-be-good", title: "Oh, Lady Be Good!", year: 1924, status: "US-PD", provenance: { source: "G. and I. Gershwin, sheet music", year: 1924 }, key: G, meter: "4/4", form: "AABA", stage: "standards", usedIn: [], onlyWhenVerified: true }),
];
export default repertoire;

export const songById: ReadonlyMap<string, RepertoireEntry> = new Map(
  repertoire.map((s) => [s.id, s] as const),
);
/** Never shipped (§2.8): post-1930 compositions, modern arrangements of trad tunes, any recording. */
export const NEVER_SHIPPED = [
  "House of the Rising Sun (the 1964 arrangement)",
  "Scarborough Fair (the 1966 arrangement)",
] as const;

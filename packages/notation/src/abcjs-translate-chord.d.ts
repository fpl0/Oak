// abcjs ships its renderer's chord translation without types. Tests read chord symbols back through it, so they see
// what abcjs draws (it cuts a "/" that starts no bass note), not only what it parses.
declare module "abcjs/src/write/creation/translate-chord.js" {
  export default function translateChord(
    chordString: string,
    jazzchords: boolean,
    germanAlphabet: boolean,
  ): string;
}

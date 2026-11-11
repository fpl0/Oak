import { lintStrict } from "../lint.ts";
const legit = [
  'setcpm(120/4)\ndrums: s("bd*4, [~ sd]*2, hh*8").bank("RolandTR909")\nchords: chord("<C Am F G>").voicing().s("piano")\nmel: n("0 2 4 <6 7>").scale("C4:major")',
  'const prog = "<C^7 Am7 Dm7 G7>"\nbass: n("0").chord(prog).rootNotes(2).note()\nkeys: chord(prog).dict("lefthand").voicing()',
  'note("c4 e4 g4").off(1/8, x => x.add(note(12))).jux(rev).every(4, x => x.fast(2))',
  'let melody = n("0 1 2 3")\nmelody = melody.scale("C:minor")\nmel: melody.swingBy(1/3, 4)',
  'stack(s("bd sd"), note("c2 g2")).slow(2)',
  'arrange([4, s("bd*4")], [4, s("hh*8")])',
  'const xs = [0, 2, 4]\nn(xs[0]).scale("C:major")',
  'mel: note(`c4 e4\n g4 b4`)',
];
const bad = [
  "Bun.file('/etc/passwd')", "process.env", "await import('node:fs')", "globalThis.fetch", "fetch('http://x')", "this", "(function(){ return this })()",
  "(()=>{}).constructor('x')", "(()=>{})['constructor']('x')", "(()=>{})['con'+'structor']", "const k = 'constructor'; s('bd')", "const {constructor: c} = s; c", "x.__proto__", "x[`a`]", "x[y]", "({[k]: 1})",
  "Reflect.get(f, k)", "Object.getOwnPropertyDescriptors(f)", "eval('1')", "new Function('x')", "setTimeout(() => {}, 0)", "import.meta.url", "note = 5", "note++", "register('note', () => silence)",
  "evaluate('1')", "x.prototype.y = 1", "class A {}", "String.raw`x`", "/a/.exec('a')", "s('con\\x73tructor')", "s(`${'constr'}uctor`)", "new Worker('x')", "require('fs')", "`${'proto'}type`",
];
for (const c of legit) { const d = lintStrict(c); console.log(d.length ? "FALSE-POSITIVE " + JSON.stringify(d) : "ok  ", JSON.stringify(c.slice(0, 50))); }
for (const c of bad) { const d = lintStrict(c); console.log(d.length ? "blocked  " : "MISSED   ", JSON.stringify(c), "->", [...new Set(d.map((x) => x.rule))].join(",")); }

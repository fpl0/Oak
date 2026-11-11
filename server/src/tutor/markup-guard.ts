// "Tutor markdown is rendered without raw HTML" (contracts §10.7), enforced on the text itself.
//
// One small state machine splits tutor markdown into prose and code. In prose every `<` that
// could start an HTML tag, comment or declaration becomes `&lt;`, so no markdown renderer can turn
// it into a node. Code is left as it is, because Strudel's mini-notation uses angle brackets
// (`"<c3 e3>"`) and a renderer never treats the inside of code as HTML.
//
// Deciding what is code errs towards prose, never the other way:
//  - a fenced block counts as code only when its fence starts in column 0. An indented fence may
//    sit inside a list item, which can end without a closing fence;
//  - an inline code span must close on the line it opens on, and a span containing `|` is treated
//    as prose, since a table cell boundary can cut a span in two.
// The cost of erring is cosmetic: `&lt;` shown inside such code.
//
// The machine is incremental (push/flush) so the same code guards streamed deltas and whole texts.
// Pure; safe to use in the browser.

export type Piece =
  | { k: "text"; s: string }
  | { k: "code"; ticks: number; s: string }
  | { k: "fence_open"; s: string }
  | { k: "fence_body"; s: string; raw: boolean }
  | { k: "fence_close"; s: string };

/** A code span candidate longer than this without closing is treated as prose. */
const MAX_INLINE = 400;

type State =
  | { t: "normal" }
  | { t: "inline"; ticks: number }
  | { t: "fence"; ch: string; len: number; raw: boolean; midLine: boolean };

/** `<` followed by a letter, `/`, `!` or `?` is how every HTML construct in markdown starts. */
export function escapeTags(s: string): string {
  return s.replace(/<(?=[A-Za-z/!?])/g, "&lt;");
}

export function serializePiece(p: Piece): string {
  switch (p.k) {
    case "text":
    case "fence_open":
    case "fence_close":
      return p.s;
    case "code": {
      const ticks = "`".repeat(p.ticks);
      return ticks + (p.s.includes("|") ? escapeTags(p.s) : p.s) + ticks;
    }
    case "fence_body":
      // Every "<", not only tag-like ones: a body arrives in chunks, and a "<" at the end of one
      // chunk cannot wait for the next to be judged.
      return p.raw ? p.s : p.s.replace(/</g, "&lt;");
  }
}

export class HtmlGuard {
  #buf = "";
  #state: State = { t: "normal" };
  #lineStart = true;
  #heldCr = false;

  /** Feed a chunk; returns the text that is safe to forward now. Some input may be held back. */
  push(chunk: string): string {
    return this.pieces(chunk, false).map(serializePiece).join("");
  }

  /** End of text: release whatever was held back. */
  flush(): string {
    return this.pieces("", true).map(serializePiece).join("");
  }

  pieces(chunk: string, final: boolean): Piece[] {
    // Every line ending becomes "\n" first: a fence that "\r" would close must close here too.
    // A trailing "\r" waits for the next chunk, in case it is the first half of "\r\n".
    let input = (this.#heldCr ? "\r" : "") + chunk;
    this.#heldCr = !final && input.endsWith("\r");
    if (this.#heldCr) input = input.slice(0, -1);
    this.#buf += input.replace(/\r\n?/g, "\n");
    const out: Piece[] = [];
    while (this.#buf.length > 0 && this.#step(out, final)) {
      // #step consumes input until it needs more
    }
    if (final && this.#state.t === "inline") {
      // The text ended right after an opening backtick run: it was literal.
      out.push({ k: "text", s: "`".repeat(this.#state.ticks) });
      this.#state = { t: "normal" };
    }
    return out;
  }

  /** Returns false when it must wait for more input. */
  #step(out: Piece[], final: boolean): boolean {
    const st = this.#state;
    if (st.t === "fence") return this.#fence(st, out, final);
    if (st.t === "inline") return this.#inline(st, out, final);
    const buf = this.#buf;

    if (this.#lineStart) {
      const m = /^( {0,3})(`{3,}|~{3,})/.exec(buf);
      if (m) {
        const nl = buf.indexOf("\n");
        if (nl < 0 && !final) return false; // need the whole opener line
        const line = nl < 0 ? buf : buf.slice(0, nl + 1);
        const run = m[2] as string;
        // A backtick fence whose info string holds a backtick is not a fence but inline code.
        if (!(run.startsWith("`") && line.slice(m[0].length).includes("`"))) {
          out.push({ k: "fence_open", s: line.replace(/</g, "&lt;") });
          this.#buf = buf.slice(line.length);
          this.#state = { t: "fence", ch: run.charAt(0), len: run.length, raw: m[1] === "", midLine: false };
          return true;
        }
      } else if (!final && /^ {0,3}(?:`{0,2}|~{0,2})$/.test(buf)) {
        return false; // could still become a fence
      }
    }

    const c = buf.charAt(0);
    if (c === "`") {
      let k = 1;
      while (buf.charAt(k) === "`") k++;
      if (k === buf.length && !final) return false; // the run may continue
      this.#buf = buf.slice(k);
      this.#state = { t: "inline", ticks: k };
      this.#lineStart = false;
      return true;
    }
    if (c === "\\") {
      // A backslash escape: the next character is literal, so "\`" opens no code span.
      if (buf.length === 1 && !final) return false;
      // Before a newline the backslash is a hard break, and the newline still starts a line.
      const take = buf.charAt(1) === "\n" ? 1 : 2;
      out.push({ k: "text", s: escapeTags(buf.slice(0, take)) });
      this.#buf = buf.slice(take);
      this.#lineStart = false;
      return true;
    }
    if (c === "<") {
      if (buf.length === 1 && !final) return false; // need the next character to judge
      out.push({ k: "text", s: /^<[A-Za-z/!?]/.test(buf) ? "&lt;" : "<" });
      this.#buf = buf.slice(1);
      this.#lineStart = false;
      return true;
    }
    if (c === "\n") {
      out.push({ k: "text", s: "\n" });
      this.#buf = buf.slice(1);
      this.#lineStart = true;
      return true;
    }
    const next = buf.slice(1).search(/[`\\<\n]/);
    const end = next < 0 ? buf.length : next + 1;
    out.push({ k: "text", s: buf.slice(0, end) });
    this.#buf = buf.slice(end);
    this.#lineStart = false;
    return true;
  }

  #inline(st: { ticks: number }, out: Piece[], final: boolean): boolean {
    const buf = this.#buf;
    const nl = buf.indexOf("\n");
    const lineEnd = nl < 0 ? buf.length : nl;
    // Look for a closing run of exactly `ticks` backticks that starts on this line, within
    // MAX_INLINE characters. The bound is on the text, not on what has arrived, so the result
    // does not depend on how the text was chunked.
    const limit = Math.min(lineEnd, MAX_INLINE);
    let i = 0;
    while (i < limit) {
      if (buf.charAt(i) !== "`") {
        i++;
        continue;
      }
      let k = i;
      while (k < lineEnd && buf.charAt(k) === "`") k++;
      if (k === buf.length && !final) return false; // the run may continue in the next chunk
      if (k - i === st.ticks) {
        out.push({ k: "code", ticks: st.ticks, s: buf.slice(0, i) });
        this.#buf = buf.slice(k);
        this.#state = { t: "normal" };
        return true;
      }
      i = k;
    }
    if (nl < 0 && !final && buf.length <= MAX_INLINE) return false;
    // No closer on this line: the opener was literal text. Re-read what follows as prose.
    out.push({ k: "text", s: "`".repeat(st.ticks) });
    this.#state = { t: "normal" };
    return true;
  }

  #fence(st: Extract<State, { t: "fence" }>, out: Piece[], final: boolean): boolean {
    const buf = this.#buf;
    const nl = buf.indexOf("\n");
    if (st.midLine) {
      const end = nl < 0 ? buf.length : nl + 1;
      out.push({ k: "fence_body", s: buf.slice(0, end), raw: st.raw });
      this.#buf = buf.slice(end);
      st.midLine = nl < 0;
      return true;
    }
    if (nl < 0 && !final) {
      // A partial line is held only while it could still be the closing fence.
      if (/^ {0,3}[`~]*[ \t]*$/.test(buf)) return false;
      out.push({ k: "fence_body", s: buf, raw: st.raw });
      this.#buf = "";
      st.midLine = true;
      return true;
    }
    const line = nl < 0 ? buf : buf.slice(0, nl + 1);
    this.#buf = buf.slice(line.length);
    const m = /^ {0,3}(`+|~+)[ \t]*\n?$/.exec(line);
    if (m && (m[1] as string).charAt(0) === st.ch && (m[1] as string).length >= st.len) {
      out.push({ k: "fence_close", s: line });
      this.#state = { t: "normal" };
      this.#lineStart = true;
      return true;
    }
    out.push({ k: "fence_body", s: line, raw: st.raw });
    return true;
  }
}

/** Split a complete text into prose and code pieces. */
export function splitMarkdown(text: string): Piece[] {
  return new HtmlGuard().pieces(text, true);
}

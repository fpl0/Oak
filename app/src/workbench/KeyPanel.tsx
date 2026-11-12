// The key-signature panel (tb.feature.keysig, unlocked at U03.L06; ux §3.4 panels): the key the piece is in
// (the bar that plays, for a patterned `.scale()`), its signature on a small staff with the scale written under
// it (the signature covers every sharp or flat, so none is written again), the scale spelled with its degrees,
// and its neighbours on the circle: a fifth up, a fifth down, the relative and the parallel key. A neighbour can
// be heard in place (the same code in that key; the editor is untouched).
import type { KeySpec } from "@oak/content-kit";
import { renderStaff } from "@oak/notation/render";
import { keySignature, signatureOf } from "@oak/theory";
import { useEffect, useRef } from "react";
import { glyph, keyName, neighbours, sameKey, signatureText, spelledScale } from "./key-tools.ts";
import { degreeStyle, themeOf } from "./palette.ts";
import type { KeyPreview } from "./use-key-preview.ts";

/** ABC of the key's signature and its scale, one octave up from the tonic, written as the signature implies. */
export function signatureAbc(k: KeySpec): string {
  const sig = signatureOf(k);
  const altered = new Map<string, string>();
  for (const s of sig.sharps) altered.set(s[0] as string, "#");
  for (const f of sig.flats) altered.set(f[0] as string, "b");
  const names = spelledScale(k).map((n) => n.name.replace("♯", "#").replace("♭", "b"));
  const letters = "CDEFGAB";
  const start = letters.indexOf((names[0] ?? "C")[0] as string);
  const octave = start >= 5 ? 3 : 4;
  const notes = [...names, names[0] as string].map((n, i) => {
    const letter = n[0] as string;
    const acc = n.slice(1);
    const want = altered.get(letter) ?? "";
    const mark =
      acc === want
        ? ""
        : acc === "#"
          ? "^"
          : acc === "##"
            ? "^^"
            : acc === "b"
              ? "_"
              : acc === "bb"
                ? "__"
                : "=";
    const o = octave + Math.floor((start + i) / 7);
    const abcLetter = o >= 5 ? letter.toLowerCase() + "'".repeat(o - 5) : letter + ",".repeat(4 - o);
    return `${mark}${abcLetter}`;
  });
  return `X:1\nM:none\nL:1/4\nK:${keySignature(k).abcK} clef=treble\n${notes.join(" ")} |]\n`;
}

function SignatureStaff({ k }: { k: KeySpec }) {
  const host = useRef<HTMLDivElement>(null);
  const abc = signatureAbc(k);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    void renderStaff(el, abc, {
      params: { staffwidth: 300, scale: 0.85, paddingtop: 0, paddingbottom: 0 } as never,
    })
      .then(() => {
        if (live) el.dataset.ready = "1";
      })
      .catch(() => {
        if (live) el.textContent = signatureText(k);
      });
    return () => {
      live = false;
      el.replaceChildren();
    };
  }, [abc, k]);
  return (
    <div
      ref={host}
      className="oak-keysig-staff"
      role="img"
      aria-label={`${keyName(k)}: ${signatureText(k)}, then its scale from ${glyph(k.tonic)}`}
      data-testid="keysig-staff"
    />
  );
}

export interface KeyPanelProps {
  /** The key now (the playing bar's, else the piece's first). */
  current: KeySpec | null;
  /** Every key of the piece, in order. */
  keys: readonly KeySpec[];
  preview: KeyPreview | null;
}

export function KeyPanel({ current, keys, preview }: KeyPanelProps) {
  const theme = themeOf(typeof document === "undefined" ? null : document.documentElement);
  if (!current)
    return (
      <section className="oak-wb-panel" aria-label="Key signature" data-testid="key-panel">
        <h3 className="oak-wb-panel-title">Key signature</h3>
        <p className="oak-muted">
          No key yet. Write the notes as degrees with <code>n("0 2 4").scale("D4:major")</code> and the panel
          shows that key's signature.
        </p>
      </section>
    );
  const sig = signatureOf(current);
  const order = sig.sharps.length ? "F C G D A E B" : sig.flats.length ? "B E A D G C F" : null;
  return (
    <section
      className="oak-wb-panel"
      aria-label="Key signature"
      data-testid="key-panel"
      data-key={keyName(current)}
    >
      <h3 className="oak-wb-panel-title">
        <span className="oak-muted">Key</span> <span data-testid="key-panel-name">{keyName(current)}</span>
      </h3>
      {keys.length > 1 ? (
        <p className="oak-muted oak-wb-panel-note">
          This piece moves through {keys.map(keyName).join(" → ")}; the panel follows the bar that plays.
        </p>
      ) : null}
      <SignatureStaff k={current} />
      <p data-testid="key-panel-signature">
        {signatureText(current).replace(/^./, (c) => c.toUpperCase())}
        {order ? <span className="oak-muted"> · always written in the order {order}</span> : null}
      </p>
      <ol className="oak-scale-row" aria-label={`${keyName(current)} scale`} data-testid="key-panel-scale">
        {spelledScale(current).map((n) => {
          const st = degreeStyle(String(n.degree), theme);
          return (
            <li key={n.degree}>
              <span className="oak-scale-deg" style={{ background: st.fill, color: st.label }} aria-hidden>
                {n.degree}
              </span>
              <span>{n.name}</span>
              <span className="sr-only">, degree {n.degree}</span>
            </li>
          );
        })}
      </ol>
      <ul className="oak-neighbours" aria-label="Neighbouring keys">
        {neighbours(current).map((nb) => {
          const on = preview?.playing && sameKey(preview.playing, nb.key);
          const can = preview?.movable && nb.key.mode === current.mode;
          return (
            <li key={nb.label}>
              <span className="oak-muted">{nb.label}</span>{" "}
              {can && preview ? (
                <button
                  type="button"
                  className="oak-link-button"
                  aria-pressed={on ? true : undefined}
                  onClick={() => (on ? preview.stop() : preview.preview(nb.key))}
                  title={on ? "Stop" : `Hear this code in ${keyName(nb.key)}`}
                >
                  {keyName(nb.key)}
                  {preview.pending && sameKey(preview.pending, nb.key) ? " …" : on ? " ■" : " ▶"}
                </button>
              ) : (
                <strong>{keyName(nb.key)}</strong>
              )}{" "}
              <span className="oak-muted">({nb.hint})</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

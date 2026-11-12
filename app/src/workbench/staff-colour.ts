// Degree colours on the staff's noteheads (Wave 3, tb.feature.degree-labels: "degree labels and colours on roll
// and staff"). Marks each notehead of an engraved note with `data-oak-deg="1…7"`; workbench.css paints it in the
// theme's degree colour (ux §7.3, the same Okabe–Ito swatches as the roll), with a dark edge so a light swatch
// still reads on the page. A chord's heads take their members' degrees, low to high. DOM only.

/** One engraved note `n` and the base degree (1–7) of each of its pitches, low to high. */
export interface HeadDegrees {
  n: number;
  degrees: number[];
}

export function colourHeads(host: ParentNode, notes: readonly HeadDegrees[], prefix = "oak-e"): void {
  for (const old of host.querySelectorAll("[data-oak-deg]")) old.removeAttribute("data-oak-deg");
  for (const { n, degrees } of notes) {
    if (degrees.length === 0) continue;
    const heads: Element[] = [];
    for (const el of host.querySelectorAll(`.${prefix}${n}`)) {
      if (el.classList.contains("abcjs-notehead")) heads.push(el);
      for (const h of el.querySelectorAll(".abcjs-notehead")) heads.push(h);
    }
    const unique = [...new Set(heads)];
    // Low to high: the lowest head sits lowest on the page.
    const ordered =
      unique.length === degrees.length && unique.length > 1
        ? [...unique].sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)
        : unique;
    ordered.forEach((h, i) => {
      const d = degrees.length === ordered.length ? degrees[i] : degrees[0];
      if (d) h.setAttribute("data-oak-deg", String(d));
    });
  }
}

// Print a puzzle (prepared, off: see js/features.js): a paper layout like the book's pages, printed
// through the browser's dialog, where "Save as PDF" makes the PDF. Variant B has the statements in
// the cards; variant A lists them in an index below the grid, to be read only after solving a card.
// The book's final typesetting template does not exist yet; this layout follows the same structure.

import { h } from "./dom.js";

export function printPuzzle(puzzle) {
  const g = puzzle.grid;
  const cell = i => h("td", { class: i === puzzle.start ? "start" : "" },
    h("span", { class: "c" }, g.label(i)), i === puzzle.star ? h("span", { class: "s" }, "★") : null,
    h("strong", {}, puzzle.names[i]), h("em", {}, puzzle.roles[i]),
    i === puzzle.start ? h("b", {}, puzzle.theme[puzzle.sol[i] ? "marked" : "clear"].sg) : null,
    puzzle.variant === "B" && puzzle.texts[i] ? h("p", {}, puzzle.texts[i]) : null);
  const rows = Array.from({ length: g.rows }, (_, r) => h("tr", {}, Array.from({ length: g.cols }, (_, c) => cell(g.cell(`${String.fromCharCode(65 + c)}${r + 1}`)))));
  const index = puzzle.variant === "A"
    ? h("section", { class: "index" }, h("h2", {}, "Výpovědi – čti až po vyřešení karty"),
        h("ol", {}, puzzle.texts.map((t, i) => [i, t]).filter(([, t]) => t)
          .sort(([a], [b]) => g.label(a).localeCompare(g.label(b), "cs", { numeric: true }))   // A1, A2, … B1, …
          .map(([i, t]) => h("li", {}, h("b", {}, `${g.label(i)} `), t))))
    : null;
  const sheet = h("div", { id: "print-sheet" },
    h("h1", {}, puzzle.title, h("small", {}, ` · ${puzzle.theme.title} · ${g.cols}×${g.rows} ${puzzle.variant}`)),
    h("table", { class: "print-grid" }, rows),
    index,
    h("p", { class: "foot" }, "Tedective"));
  document.getElementById("print-sheet")?.remove();
  document.body.append(sheet);
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); sheet.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

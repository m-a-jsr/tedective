// Collection (plan 3.11): every character with the quotes this profile has already seen on solved cards,
// unseen ones covered; and the collecting page for the numbers from ★ cards (98 squares, puzzles 3–100).
// Both are derived from the profile's progress, so a reset or a book puzzle counts the same way as play.

import { czechCompare } from "../logic/czech.js";
import { avatar, fill, h, icon } from "./dom.js";

/** Quotes seen by the current profile: Map(character name -> Set(text)) and a Set of general quotes. */
export function seenQuotes(app) {
  const own = new Map(app.content.cast.map(c => [c.name, new Set(c.quotes)]));
  const byName = new Map(), general = new Set();
  for (const p of app.content.puzzles) {
    const pr = app.progress[p.id];
    if (!pr?.known) continue;
    for (const [i] of pr.known) {
      const q = p.quotes[i];
      if (!q) continue;
      const name = p.names[i];
      if (own.get(name)?.has(q)) {
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name).add(q);
      } else general.add(q);
    }
  }
  return { byName, general };
}

function bar(who, title) {
  return h("header", { class: "bar" },
    h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
    h("h1", {}, title, h("small", { class: "who" }, who)));
}

export function renderCollection(root, app) {
  const { cast, quotes, photos } = app.content;
  const { byName, general } = seenQuotes(app);
  const withOwn = cast.filter(c => c.quotes.length).sort((a, b) => czechCompare(a.name, b.name));
  const total = withOwn.reduce((n, c) => n + c.quotes.length, 0);
  const seen = withOwn.reduce((n, c) => n + (byName.get(c.name)?.size ?? 0), 0);
  const detail = h("div", { class: "panel detail", hidden: true });

  const open = c => {
    const got = byName.get(c.name) ?? new Set();
    fill(detail,
      h("div", { class: "who-row" }, avatar(c.name, photos), h("h2", {}, c.name, h("span", { class: "group" }, c.group))),
      h("ul", { class: "own-quotes" }, c.quotes.map(q => got.has(q)
        ? h("li", {}, `„${q}“`)
        : h("li", { class: "locked" }, icon("lock", 14), " zatím neviděná"))));
    detail.hidden = false;
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const tiles = withOwn.map(c => {
    const n = byName.get(c.name)?.size ?? 0;
    return h("button", { class: `tile ${n === c.quotes.length ? "full" : n ? "some" : ""}`, onclick: () => open(c) },
      avatar(c.name, photos), h("span", { class: "name" }, c.name), h("span", { class: "count" }, `${n}/${c.quotes.length}`));
  });

  const seenGeneral = quotes.filter(q => general.has(q.text));
  root.replaceChildren(
    bar(app.profiles[app.profile]?.name, "Sbírka"),
    h("main", { class: "collection" },
      h("p", { class: "note" }, `Vlastní hlášky postav: ${seen}/${total}. Hláška se odemkne, když ji uvidíš na vyřešené kartě.`),
      detail,
      h("div", { class: "tiles" }, tiles),
      h("section", { class: "panel" },
        h("h2", {}, `Obecné hlášky ${seenGeneral.length}/${quotes.length}`),
        seenGeneral.length
          ? h("ul", { class: "general-seen" }, seenGeneral.map(q => h("li", {}, q.text)))
          : h("p", { class: "note" }, "Zatím žádná."))));
}

/** The collecting page: one square per puzzle 3–100; the ★ number appears once the puzzle is solved. */
export function renderNumbers(root, app) {
  const book = app.content.puzzles.filter(p => p.number != null).sort((a, b) => a.no - b.no);
  const done = book.filter(p => app.progress[p.id]?.solvedAt);
  root.replaceChildren(
    bar(app.profiles[app.profile]?.name, "Čísla z ★ karet"),
    h("main", { class: "numbers" },
      h("p", { class: "note" }, `Zapsáno ${done.length}/${book.length}. Číslo se zapíše samo po vyřešení hádanky.`),
      h("ol", { class: "number-grid" }, book.map(p => {
        const solved = !!app.progress[p.id]?.solvedAt;
        return h("li", { class: solved ? "got" : "" },
          h("a", { href: `#/hra/${p.id}`, "aria-label": `Hádanka ${p.no}${solved ? `, číslo ${p.number}` : ""}` },
            h("span", { class: "no" }, p.no), h("span", { class: "num" }, solved ? p.number : "")));
      }))));
}

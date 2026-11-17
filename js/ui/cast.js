// Character bank (plan 3.6): all characters with photo, group, rules and quotes, and the general quotes.
// Viewing is always open; editing unlocks together with the generator (a later step).

import { SECTIONS } from "../data/content.js";
import { THEMES, czechCompare } from "../logic/czech.js";
import { avatar, fill, h, icon } from "./dom.js";

const QUOTE_CATS = { filip: "Od autora", zajimavosti: "Zajímavosti", hiragana: "Hiragana", "anglictina-c2": "Angličtina C2" };
const sides = side => Object.values(THEMES).map(t => t[side].sg).join(" / ");

/** The character's rules in words (hidden rules are allowed to be seen; nothing about the password exists here). */
function rules(c) {
  const out = [];
  if (c.fixed === 0) out.push(`Vždy ${sides("clear")}.`);
  if (c.fixed === 1) out.push(`Vždy ${sides("marked")}.`);
  if (c.section) out.push(`Objevuje se jen v sekci ${SECTIONS.find(s => s.key === c.section)?.title ?? c.section}.`);
  if (c.alwaysQuote) out.push("Když má na kartě hlášku, je vždy jeho vlastní.");
  return out;
}

export function renderCast(root, app) {
  const { cast, quotes, photos } = app.content;
  let tab = "postavy", query = "", filter = "";
  const list = h("div", { class: "cast-list" });
  const search = h("input", { type: "search", placeholder: "Hledat", "aria-label": "Hledat" });
  const select = h("select", { "aria-label": "Filtr" });
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const plain = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const drawTabs = () => fill(tabs, [["postavy", `Postavy (${cast.length})`], ["hlasky", `Obecné hlášky (${quotes.length})`]].map(([k, label]) =>
    h("button", { role: "tab", class: k === tab ? "on" : "", "aria-selected": String(k === tab),
      onclick: () => { tab = k; filter = ""; drawFilter(); drawTabs(); draw(); } }, label)));

  const drawFilter = () => {
    const opts = tab === "postavy"
      ? [...new Set(cast.map(c => c.group))].sort(czechCompare).map(g => [g, g])
      : Object.entries(QUOTE_CATS).filter(([k]) => quotes.some(q => q.category === k));
    fill(select, h("option", { value: "" }, tab === "postavy" ? "Všechny skupiny" : "Všechny druhy"),
      opts.map(([v, label]) => h("option", { value: v }, label)));
    select.value = filter;
  };

  const draw = () => {
    const q = plain(query);
    if (tab === "postavy") {
      const shown = cast.filter(c => (!filter || c.group === filter)
        && (!q || plain([c.name, c.group, ...c.quotes].join(" ")).includes(q)))
        .sort((a, b) => czechCompare(a.name, b.name));
      fill(list, shown.length ? shown.map(c => h("article", { class: "panel person" },
        avatar(c.name, photos),
        h("div", {},
          h("h3", {}, c.name, h("span", { class: "group" }, c.group)),
          rules(c).map(r => h("p", { class: "rule" }, r)),
          c.quotes.length ? h("ul", { class: "own-quotes" }, c.quotes.map(t => h("li", {}, `„${t}“`))) : null)))
        : h("p", { class: "note" }, "Nic nenalezeno."));
    } else {
      const shown = quotes.filter(x => (!filter || x.category === filter) && (!q || plain(x.text).includes(q)));
      fill(list, h("ul", { class: "panel general" }, shown.length
        ? shown.map(x => h("li", {}, x.text, h("span", { class: "cat" }, QUOTE_CATS[x.category] ?? "")))
        : h("li", { class: "note" }, "Nic nenalezeno.")));
    }
  };

  search.addEventListener("input", () => { query = search.value; draw(); });
  select.addEventListener("change", () => { filter = select.value; draw(); });
  drawTabs(); drawFilter(); draw();

  root.replaceChildren(
    h("header", { class: "bar" },
      h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
      h("h1", {}, "Postavy a hlášky")),
    h("main", { class: "cast" },
      tabs,
      h("div", { class: "filters" }, search, select),
      h("p", { class: "note lock" }, icon("lock", 16),
        " Úpravy postav a hlášek se odemknou spolu s tvorbou vlastních hádanek (level 17 nebo všech 100 hádanek z knihy)."),
      list));
}

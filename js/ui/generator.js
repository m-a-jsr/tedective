// Generator screen (plan 3.7): new puzzles from the character bank, generated in a web worker.
// Locked until all book puzzles are solved (level 17 joins as a second way in with the XP step).

import { GENERATOR_LEVEL } from "../game/progression.js";
import { THEMES, czechCompare, customTheme } from "../logic/czech.js";
import { fill, h, icon, toast } from "./dom.js";

const SIZES = [[3, 3], [4, 5], [5, 6], [6, 9]];
const DEFAULT_CANDIDATES = { "3x3": 5, "4x5": 10, "5x6": 6, "6x9": 3 };   // more candidates = a harder pick
const LEVELS = [["intro", "Lehká", "Každý krok vyplyne z jedné výpovědi."],
  ["mid", "Střední", "Někdy je potřeba spojit dvě výpovědi."],
  ["hard", "Těžká", "Až tři výpovědi najednou, jako ve většině knihy."]];
const KIND_GROUPS = [
  ["Počty v okolí, řádku, sloupci…", ["count_neigh", "count_row", "count_col", "count_edge", "count_corner", "count_all", "count_between", "count_common"]],
  ["Počty podle skupiny", ["count_role"]], ["Počty podle písmen", ["count_letter"]], ["Jmenovitě", ["named_in"]],
  ["Průniky", ["intersect"]], ["Porovnání", ["compare_gt", "compare_eq"]], ["Souvislá řada", ["connected"]],
  ["Nejvíc", ["most"]], ["Jen v jedné", ["only"]], ["Lichý počet", ["odd"]]];
const ROLE = { "": "náhodně", pool: "vybraná", must: "povinná", no: "zakázaná" };
const MOBILE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

export const encodeCode = params => btoa(unescape(encodeURIComponent(JSON.stringify(params))))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function decodeCode(code) {
  try {
    const b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return p && p.cols && p.rows && p.tier ? p : null;
  } catch { return null; }
}

/** Unlocked at level 17 or once every book puzzle is solved by this profile, whichever comes first. */
export function generatorUnlocked(app) {
  const book = app.content.puzzles;
  const solved = book.filter(p => app.progress[p.id]?.solvedAt).length;
  return { open: solved === book.length || app.level.level >= GENERATOR_LEVEL, solved, total: book.length };
}

export function renderGenerator(root, app) {
  const header = h("header", { class: "bar" },
    h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
    h("h1", {}, "Nová hádanka"));
  const lock = generatorUnlocked(app);
  if (!lock.open) {
    root.replaceChildren(header, h("main", { class: "generator" }, h("section", { class: "panel locked-panel" },
      icon("lock", 28), h("h2", {}, "Zatím zamčeno"),
      h("p", {}, `Tvorba vlastních hádanek se odemkne na levelu ${GENERATOR_LEVEL}, nebo po vyřešení všech hádanek z knihy – podle toho, co přijde dřív.`),
      h("p", { class: "note" }, `Level ${app.level.level}/${GENERATOR_LEVEL} · vyřešeno ${lock.solved}/${lock.total}.`))));
    return;
  }

  const st = { size: "4x5", theme: "zlocin", marked: "", clear: "", variant: "A", tier: "hard", candidates: 10,
    roles: {}, kinds: new Set(KIND_GROUPS.flatMap(([, k]) => k)) };
  let worker = null;

  const form = h("form", { class: "generator", onsubmit: e => { e.preventDefault(); start(); } });
  const progress = h("section", { class: "panel progress", hidden: true });

  const radio = (name, value, label, checked, onchange, note = null) => h("label", { class: "opt" },
    h("input", { type: "radio", name, value, checked, onchange }), h("span", {}, label, note ? h("small", {}, note) : null));

  const themeHint = h("p", { class: "note" });
  const custom = h("div", { class: "custom-theme", hidden: true },
    h("input", { placeholder: "např. veselý", "aria-label": "Stav 1", oninput: e => { st.marked = e.target.value; drawThemeHint(); } }),
    h("span", {}, ", nebo"),
    h("input", { placeholder: "smutný", "aria-label": "Stav 2", oninput: e => { st.clear = e.target.value; drawThemeHint(); } }),
    themeHint);
  const drawThemeHint = () => {
    const t = customTheme(st.marked, st.clear);
    themeHint.textContent = t
      ? `Nadpis „${t.title}“ – například „jsou právě 2 ${t.marked.pl}“, „je právě 5 ${t.clear.gen}“.`
      : "Dvě různá přídavná jména zakončená na -ý nebo -í (veselý, smutný, cizí…).";
  };
  drawThemeHint();

  const candInput = h("input", { type: "number", min: 1, max: 40, value: st.candidates, "aria-label": "Počet kandidátů",
    onchange: e => { st.candidates = Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1)); } });

  // characters: random / preferred pool / required / excluded
  const castRows = [...app.content.cast].sort((a, b) => czechCompare(a.name, b.name)).map(c => {
    const sel = h("select", { "aria-label": c.name, onchange: e => { if (e.target.value) st.roles[c.name] = e.target.value; else delete st.roles[c.name]; } },
      Object.entries(ROLE).map(([v, label]) => h("option", { value: v }, label)));
    return { c, sel, el: h("li", {}, h("span", {}, c.name, h("small", {}, ` ${c.group}`)), sel) };
  });
  const castFilter = h("input", { type: "search", placeholder: "Hledat postavu", oninput: e => {
    const q = e.target.value.toLowerCase();
    castRows.forEach(r => { r.el.hidden = q && !r.c.name.toLowerCase().includes(q); });
  } });

  const kindBoxes = KIND_GROUPS.map(([label, kinds]) => h("label", { class: "opt check" },
    h("input", { type: "checkbox", checked: true, onchange: e => kinds.forEach(k => (e.target.checked ? st.kinds.add(k) : st.kinds.delete(k))) }),
    h("span", {}, label)));

  const codeInput = h("input", { placeholder: "Kód hádanky", "aria-label": "Kód hádanky" });

  fill(form,
    h("section", { class: "panel" }, h("h2", {}, "Velikost"),
      h("div", { class: "opts" }, SIZES.filter(([c]) => c < 6 || !MOBILE).map(([c, r]) =>
        radio("size", `${c}x${r}`, `${c}×${r}`, st.size === `${c}x${r}`, () => {
          st.size = `${c}x${r}`; st.candidates = DEFAULT_CANDIDATES[st.size]; candInput.value = st.candidates;
        }, c === 6 ? "jen na PC" : null)))),
    h("section", { class: "panel" }, h("h2", {}, "Téma"),
      h("div", { class: "opts" },
        Object.values(THEMES).map(t => radio("theme", t.key, t.title, st.theme === t.key, () => { st.theme = t.key; custom.hidden = true; })),
        radio("theme", "vlastni", "Vlastní dvojice slov", false, () => { st.theme = "vlastni"; custom.hidden = false; })),
      custom),
    h("section", { class: "panel" }, h("h2", {}, "Varianta"),
      h("div", { class: "opts" },
        radio("variant", "A", "A", true, () => { st.variant = "A"; }, "výpověď se ukáže až po vyřešení karty"),
        radio("variant", "B", "B", false, () => { st.variant = "B"; }, "všechny výpovědi vidět od začátku"))),
    h("section", { class: "panel" }, h("h2", {}, "Obtížnost"),
      h("div", { class: "opts" }, LEVELS.map(([v, label, note]) => radio("tier", v, label, st.tier === v, () => { st.tier = v; }, note)))),
    h("details", { class: "panel advanced" }, h("summary", {}, "Pokročilé"),
      h("h3", {}, "Postavy"),
      h("p", { class: "note" }, "Povinná je v hádance vždy, zakázaná nikdy. Když označíš některé jako vybrané, ostatní se doberou jen z nich."),
      castFilter, h("ul", { class: "cast-pick" }, castRows.map(r => r.el)),
      h("h3", {}, "Typy výpovědí"), h("div", { class: "opts" }, kindBoxes),
      h("h3", {}, "Kandidátů"),
      h("p", { class: "note" }, "Kolik hádanek se zkusí sestavit; nechá se ta nejtěžší."), candInput,
    ),
    h("button", { class: "primary big", type: "submit" }, "Vytvořit hádanku"),
    h("section", { class: "panel from-code" },
      h("h2", {}, "Nebo: hádanka z kódu"),
      h("p", { class: "note" }, "Kód nese všechna nastavení hádanky, ze které pochází. Volby výše (velikost, téma, obtížnost, postavy…) se pro ni nepoužijí – vznikne přesně tatáž hádanka."),
      h("div", { class: "row" }, codeInput, h("button", { type: "button", onclick: () => {
        const p = decodeCode(codeInput.value);
        if (!p) return toast("Kód nejde přečíst.");
        run(p);
      } }, "Vytvořit z kódu"))),
    progress);

  function params() {
    const [cols, rows] = st.size.split("x").map(Number);
    let theme = st.theme;
    if (theme === "vlastni") {
      const t = customTheme(st.marked, st.clear);
      if (!t) { toast("Vlastní téma potřebuje dvě přídavná jména na -ý nebo -í."); return null; }
      theme = t.custom;
    }
    const by = role => Object.entries(st.roles).filter(([, r]) => r === role).map(([n]) => n);
    if (!st.kinds.size) { toast("Zapni aspoň jeden typ výpovědí."); return null; }
    const all = KIND_GROUPS.flatMap(([, k]) => k);
    return { v: 1, cols, rows, variant: st.variant, tier: st.tier, theme, candidates: st.candidates,
      seed: (Math.random() * 2 ** 32) >>> 0, include: by("must"), exclude: by("no"), pool: by("pool"),
      kinds: st.kinds.size === all.length ? null : [...st.kinds] };
  }

  function start() { const p = params(); if (p) run(p); }

  function run(p) {
    worker?.terminate();
    worker = new Worker(new URL("../logic/gen-worker.js", import.meta.url), { type: "module" });
    const status = h("p", {}, "Připravuji…");
    progress.hidden = false;
    fill(progress, h("h2", {}, "Sestavuji hádanku"), status,
      h("button", { type: "button", onclick: () => { worker?.terminate(); worker = null; progress.hidden = true; toast("Zrušeno."); } }, "Zrušit"));
    progress.scrollIntoView({ behavior: "smooth", block: "nearest" });
    worker.onmessage = async ({ data }) => {
      if (data.progress) {
        const { done, of, tries } = data.progress;
        status.textContent = `Hotovo ${done}/${of} kandidátů (pokusů ${tries}).`;
      } else if (data.error) {
        worker.terminate(); worker = null;
        fill(progress, h("h2", {}, "Nepovedlo se"), h("p", {}, data.error),
          h("button", { type: "button", onclick: () => { progress.hidden = true; } }, "Zavřít"));
      } else if (data.result) {
        worker.terminate(); worker = null;
        const id = await app.saveGenerated({ ...data.result, code: encodeCode(p) });
        app.go(`#/hra/${id}`);
      }
    };
    worker.onerror = e => { fill(progress, h("p", { class: "err" }, e.message || "Chyba generátoru.")); };
    const cast = app.content.cast.map(({ name, group, fixed, section, quotes, alwaysQuote }) => ({ name, group, fixed, section, quotes, alwaysQuote }));
    worker.postMessage({ params: p, cast, quotes: app.content.quotes });
  }

  root.replaceChildren(header, form);
  return () => worker?.terminate();
}

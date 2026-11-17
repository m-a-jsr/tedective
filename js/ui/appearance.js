// Vzhled (plan 3.10): every category with its options; locked ones show their condition and lead to
// the challenge. A choice applies at once, and the sample cards at the top show it.

import * as store from "../data/store.js";
import { CATEGORIES, EMBLEM_LEVEL } from "../game/progression.js";
import { avatar, fill, h, icon, toast } from "./dom.js";
import { EDGES, LOOK, PAUSE_EXTRA, chosen, emblemColours, optionState, saveLook, shrinkImage } from "./look.js";
import { meadow, play } from "./sound.js";
import { levelBadge } from "./stats.js";

const IMG = id => `img/pozadi/${id}.${id.startsWith("D") ? "svg" : "jpg"}`;
const BG_CATS = new Set(["pozadi-hry", "pozadi-menu"]);

function sample() {
  const card = (cls, name, role, extra) => h("div", { class: `card ${cls}` },
    h("span", { class: "coord" }, "A1"), avatar(name, null, role), h("span", { class: "name" }, name), h("span", { class: "role" }, role), extra);
  return h("div", { class: "grid sample", style: "--cols:3" },
    card("hidden", "Ukázka", "skupina", h("span", { class: "text statement" }, "Výpověď")),
    card("good", "Vzor", "skupina", h("span", { class: "verdict" }, "nevinný")),
    card("bad", "Příklad", "skupina", h("span", { class: "verdict" }, "zločinec")));
}

export function renderAppearance(root, app) {
  const level = app.level.level;
  const main = h("main", { class: "appearance" });

  const pick = async (cat, opt) => {
    const st = optionState(app, cat, opt);
    if (!st.open) {
      if (st.challenge) { app.go(`#/vyzvy/${cat}`); return; }
      return toast(`Zamčeno: ${st.why}.`);
    }
    await saveLook(app, { [cat]: opt.id });
    if (cat === "zvuky") { play(opt.id, "ok"); meadow(false); }
    draw();
  };

  const upload = (key, max) => h("label", { class: "button upload" }, icon("plus"), "Vybrat fotku",
    h("input", { type: "file", accept: "image/*", hidden: true, onchange: async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        await store.putRaw(`cache/look/${key}`, { data: await shrinkImage(f, max) });
        await saveLook(app, {});
        toast("Fotka uložena (jen v tomto zařízení).");
      } catch (err) { toast(err.message, "bad"); }
    } }));

  function extras(cat, c) {
    const cu = c.custom;
    const setCustom = async patch => { await saveLook(app, { custom: { ...cu, ...patch } }); };
    if (cat === "barvy" && c.barvy === "vlastni") {
      const color = (key, label, def) => h("label", { class: "color" }, h("input", { type: "color", value: cu[key] ?? def,
        onchange: e => setCustom({ [key]: e.target.value }) }), label);
      return h("div", { class: "extras" }, color("good", "dobrý stav", "#e1f5ee"), color("goodLine", "jeho okraj", "#1d9e75"),
        color("bad", "špatný stav", "#faece7"), color("badLine", "jeho okraj", "#d85a30"));
    }
    if (cat === "tvar" && c.tvar === "vlastni") {
      return h("div", { class: "extras" },
        h("label", {}, "Zaoblení ", h("input", { type: "range", min: 0, max: 40, value: cu.radius ?? 10, oninput: e => setCustom({ radius: +e.target.value }) })),
        h("label", {}, "Poměr stran ", h("input", { type: "range", min: 0.7, max: 1.6, step: 0.05, value: cu.ratio ?? 1, oninput: e => setCustom({ ratio: +e.target.value }) })));
    }
    if (cat === "pismo" && c.pismo === "slavnostni") {
      return h("div", { class: "extras" },
        h("label", {}, "Velikost ", h("input", { type: "range", min: 0.85, max: 1.3, step: 0.05, value: cu.fontScale ?? 1, oninput: e => setCustom({ fontScale: +e.target.value }) })),
        h("label", {}, "Řez ", h("select", { onchange: e => setCustom({ fontWeight: +e.target.value }) },
          [[300, "tenký"], [400, "normální"], [500, "střední"], [600, "tučný"]].map(([v, l]) => h("option", { value: v, selected: (cu.fontWeight ?? 400) === v }, l)))));
    }
    if (cat === "rub" && c.rub === "foto") return h("div", { class: "extras" }, upload("rub", 600));
    if (cat === "pozadi-hry" && c["pozadi-hry"] === "vlastni") return h("div", { class: "extras" }, upload("pozadi-hry", 1600));
    if (cat === "pozadi-menu" && c["pozadi-menu"] === "vlastni") return h("div", { class: "extras" }, upload("pozadi-menu", 1600));
    if (cat === "zvuky" && c.zvuky !== "ticho") {
      return h("div", { class: "extras" },
        h("button", { onclick: () => play(c.zvuky, "ok") }, "Správně"), h("button", { onclick: () => play(c.zvuky, "wrong") }, "Chyba"),
        h("button", { onclick: () => play(c.zvuky, "solved") }, "Vyřešeno"),
        c.zvuky === "louka" ? h("button", { onclick: () => { meadow(true); setTimeout(() => meadow(false), 8000); } }, "Kulisa (8 s)") : null);
    }
    return null;
  }

  function category(cat, i) {
    const meta = CATEGORIES.find(x => x.key === cat);
    const c = chosen(app);
    if (level < i + 1) {
      return h("section", { class: "panel look-cat locked" }, h("h2", {}, icon("lock", 16), meta.title), h("p", { class: "note" }, `Otevře se na levelu ${i + 1}.`));
    }
    const opts = LOOK[cat].map(opt => {
      const st = optionState(app, cat, opt);
      const on = c[cat] === opt.id;
      const thumb = BG_CATS.has(cat) && !["doba", "zive", "vlastni"].includes(opt.id) ? h("img", { src: IMG(opt.id), alt: "", loading: "lazy" }) : null;
      return h("button", { class: `look-opt${on ? " on" : ""}${st.open ? "" : " locked"}${thumb ? " thumb" : ""}`, onclick: () => pick(cat, opt) },
        thumb, h("span", {}, st.open ? null : icon("lock", 13), opt.label), st.open ? null : h("small", {}, st.why));
    });
    return h("section", { class: "panel look-cat" },
      h("h2", {}, meta.title, h("small", {}, ` · výzvy: ${meta.theme}`)),
      h("div", { class: `look-opts${BG_CATS.has(cat) ? " bgs" : ""}` }, opts),
      extras(cat, c),
      cat === "pozadi-hry" ? pausePicker(c) : null);
  }

  function pausePicker(c) {
    const ids = [...LOOK["pozadi-hry"].filter(o => /^[DH]\d$/.test(o.id) && optionState(app, "pozadi-hry", o).open).map(o => o.id), ...PAUSE_EXTRA];
    return h("div", { class: "pause-pick" }, h("h3", {}, "Obrázek pauzy"),
      h("div", { class: "look-opts bgs" }, ids.map(id => h("button", { class: `look-opt thumb${c.pause === id ? " on" : ""}`,
        onclick: async () => { await saveLook(app, { pause: id }); draw(); } }, h("img", { src: IMG(id), alt: "", loading: "lazy" }), h("span", {}, id)))));
  }

  function edges(c) {
    return h("section", { class: "panel look-cat" }, h("h2", {}, "Výjimečné okraje karet", h("small", {}, " · levely 10, 20, 50, 100")),
      h("div", { class: "look-opts" }, EDGES.map(e => {
        const open = level >= e.level;
        return h("button", { class: `look-opt${c.edge === e.id ? " on" : ""}${open ? "" : " locked"}`,
          onclick: async () => { if (!open) return toast(`Zamčeno: level ${e.level}.`); await saveLook(app, { edge: e.id }); draw(); } },
          h("span", {}, open ? null : icon("lock", 13), e.label), open ? null : h("small", {}, `Level ${e.level}`));
      })));
  }

  function emblem(c) {
    if (level < EMBLEM_LEVEL) return h("section", { class: "panel look-cat locked" }, h("h2", {}, icon("lock", 16), "Emblém"), h("p", { class: "note" }, `Na levelu ${EMBLEM_LEVEL}.`));
    const [bgs, fgs] = emblemColours(level);
    const sw = (list, key, cur) => h("div", { class: "swatches" }, list.map(x => h("button", { class: `swatch${cur === x.id ? " on" : ""}`,
      style: `background:${x.colour}`, "aria-label": x.id, onclick: async () => { await saveLook(app, { [key]: x.id }); draw(); } })));
    return h("section", { class: "panel look-cat" }, h("h2", {}, "Emblém"), levelBadge(app, { big: true }),
      h("h3", {}, "Barva emblému"), sw(bgs, "emblemBg", c.emblemBg), h("h3", {}, "Barva čísla"), sw(fgs, "emblemFg", c.emblemFg),
      h("p", { class: "note" }, "Nové barvy přibývají s levely: do 30 každý level, do 50 každé 2, do 100 každých 5, pak každých 10."));
  }

  function draw() {
    const c = chosen(app);
    fill(main,
      h("div", { class: "panel sample-wrap" }, sample()),
      Object.keys(LOOK).map((cat, i) => category(cat, i)),
      edges(c), emblem(c),
      h("p", { class: "note" }, "Vlastní fotky (pozadí, rub karty) zůstávají jen v tomto zařízení."));
  }

  draw();
  root.replaceChildren(
    h("header", { class: "bar" }, h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")), h("h1", {}, "Vzhled"), levelBadge(app)),
    main);
}

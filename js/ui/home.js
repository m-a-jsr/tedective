// Home screen: the book's puzzles by section, with their state, and a jump by number.

import { SECTIONS } from "../data/content.js";
import { Session } from "../game/session.js";
import { askDialog, fill, h, icon, toast } from "./dom.js";
import { SYNC_TEXT } from "./settings.js";

export function renderHome(root, app) {
  const jump = h("input", { type: "number", min: 1, max: app.content.puzzles.length, placeholder: "č.", inputmode: "numeric",
    "aria-label": "Číslo hádanky z knihy" });
  const go = () => {
    const no = parseInt(jump.value, 10);
    if (app.content.puzzles.some(p => p.no === no)) app.go(`#/hra/kniha-${no}`);
    else toast("Takové číslo v knize není.");
  };
  jump.addEventListener("keydown", e => { if (e.key === "Enter") go(); });

  // marking puzzles from the paper book: several as solved there, or one as in progress there
  const picked = new Set();
  const selecting = () => document.body.classList.contains("selecting");
  const bookBar = h("div", { class: "book-bar panel", hidden: true });
  const drawBar = () => {
    bookBar.hidden = !selecting();
    const n = picked.size;
    fill(bookBar,
      h("p", {}, n ? `Vybráno: ${n}` : "Ťukni na hádanky, které máš v knize vyřešené nebo rozdělané."),
      h("div", { class: "actions row" },
        h("button", { onclick: () => toggleSelect(false) }, "Zrušit"),
        n === 1 ? h("button", { onclick: inProgress }, "Rozdělaná v knize") : null,
        h("button", { class: "primary", disabled: !n, onclick: solvedInBook }, "Vyřešeno v knize")));
  };
  const toggleSelect = on => {
    document.body.classList.toggle("selecting", on);
    picked.clear();
    root.querySelectorAll(".puzzles a.picked").forEach(a => a.classList.remove("picked"));
    drawBar();
  };
  const onPick = (e, p, a) => {
    if (!selecting()) return;
    e.preventDefault();
    if (app.progress[p.id]?.solvedAt) return toast("Tahle je už vyřešená.");
    if (picked.has(p)) picked.delete(p); else picked.add(p);
    a.classList.toggle("picked", picked.has(p));
    drawBar();
  };
  const solvedInBook = async () => {
    const list = [...picked];
    const used = await askDialog("Použila jsi v knize nápovědu?",
      `${list.length === 1 ? "Hádanka se počítá" : "Hádanky se počítají"} do XP, ale ne do výzev na čas.`,
      [{ label: list.length > 1 ? "Ano, u všech" : "Ano", value: true }, { label: list.length > 1 ? "Ne, u žádné" : "Ne", value: false, primary: true }]);
    if (used == null) return;
    for (const p of list) {
      const s = new Session(p, app.progress[p.id]);
      s.markSolvedInBook(used);
      await app.saveProgress(p.id, s.save());
    }
    toast(list.length === 1 ? "Označeno jako vyřešené v knize." : `Označeno ${list.length} hádanek jako vyřešené v knize.`);
    document.body.classList.remove("selecting");
    renderHome(root, app);
  };
  const inProgress = () => {
    const [p] = picked;
    const pr = app.progress[p.id];
    if (pr && (pr.known?.length > 1 || pr.mistakes || pr.fromBook)) return toast("Tuhle už máš rozehranou v aplikaci.");
    document.body.classList.remove("selecting");
    app.go(`#/hra/${p.id}?kniha`);
  };

  const sections = SECTIONS.map(sec => {
    const items = app.content.puzzles.filter(p => p.section === sec.key);
    const solved = items.filter(p => app.progress[p.id]?.solvedAt).length;
    return h("section", { class: "panel section" },
      h("h2", {}, icon(sec.icon), sec.title, h("span", { class: "count" }, `${solved}/${items.length}`)),
      h("ul", { class: "puzzles" }, items.map(p => puzzleRow(p, app, onPick))));
  });

  root.replaceChildren(
    h("header", { class: "bar" },
      h("h1", {}, "Tedective"),
      h("div", { class: "jump" }, jump, h("button", { onclick: go }, "Hrát")),
      h("button", { class: "book-btn", title: "Označit hádanky z knihy", "aria-label": "Označit hádanky z knihy",
        onclick: () => toggleSelect(!selecting()) }, icon("book")),
      syncBadge(app),
      h("a", { class: "back", href: "#/nastaveni", "aria-label": "Nastavení" }, icon("gear"))),
    h("main", { class: "home" }, sections), bookBar);
  document.body.classList.remove("selecting");
}

function puzzleRow(p, app, onPick) {
  const pr = app.progress[p.id];
  let state = h("span", { class: "pill" }, "nové");
  if (pr?.solvedAt) state = h("span", { class: "pill done" }, icon("check", 14),
    pr.solvedInBook ? "v knize" : pr.mistakes ? `chyby ${pr.mistakes}` : "bez chyby");
  else if (pr?.known?.length > 1) state = h("span", { class: "pill doing" }, `${pr.known.length}/${p.grid.n}`);
  return h("li", {},
    h("a", { href: `#/hra/${p.id}`, onclick: e => onPick(e, p, e.currentTarget) },
      h("span", { class: "no" }, p.no),
      h("span", { class: "meta" }, `${p.grid.cols}×${p.grid.rows}`, p.variant === "B" ? h("span", { class: "tag" }, "B") : null),
      state));
}

const SYNC_ICON = { syncing: "cloud", ok: "cloudCheck", offline: "cloudOff", conflict: "alert", error: "alert" };

/** Sync state in the bar (hidden when not connected); a tap syncs now. */
function syncBadge(app) {
  const el = h("button", { class: "sync-badge", onclick: () => app.sync.run() });
  const draw = status => {
    if (drawn && !el.isConnected) return stop();
    drawn = true;
    el.hidden = status === "off";
    el.dataset.status = status;
    el.title = SYNC_TEXT[status] + (app.sync.message ? ` – ${app.sync.message}` : "");
    el.setAttribute("aria-label", el.title);
    fill(el, icon(SYNC_ICON[status] ?? "cloud"));
  };
  let drawn = false;
  const stop = app.sync.onStatus(draw);
  draw(app.sync.status);
  return el;
}

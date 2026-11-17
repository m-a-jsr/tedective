// Home screen: the book's puzzles by section, with their state, and a jump by number.

import { SECTIONS } from "../data/content.js";
import { fill, h, icon, toast } from "./dom.js";
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

  const sections = SECTIONS.map(sec => {
    const items = app.content.puzzles.filter(p => p.section === sec.key);
    const solved = items.filter(p => app.progress[p.id]?.solvedAt).length;
    return h("section", { class: "panel section" },
      h("h2", {}, icon(sec.icon), sec.title, h("span", { class: "count" }, `${solved}/${items.length}`)),
      h("ul", { class: "puzzles" }, items.map(p => puzzleRow(p, app))));
  });

  root.replaceChildren(
    h("header", { class: "bar" },
      h("h1", {}, "Tedective"),
      h("div", { class: "jump" }, jump, h("button", { onclick: go }, "Hrát")),
      syncBadge(app),
      h("a", { class: "back", href: "#/nastaveni", "aria-label": "Nastavení" }, icon("gear"))),
    h("main", { class: "home" }, sections));
}

function puzzleRow(p, app) {
  const pr = app.progress[p.id];
  let state = h("span", { class: "pill" }, "nové");
  if (pr?.solvedAt) state = h("span", { class: "pill done" }, icon("check", 14), pr.mistakes ? `chyby ${pr.mistakes}` : "bez chyby");
  else if (pr?.known?.length > 1) state = h("span", { class: "pill doing" }, `${pr.known.length}/${p.grid.n}`);
  return h("li", {},
    h("a", { href: `#/hra/${p.id}` },
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

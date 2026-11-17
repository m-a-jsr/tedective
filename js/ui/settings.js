// Settings screen: sync with GitHub and reset of puzzles. Profiles come in a later step.

import * as store from "../data/store.js";
import { confirmDialog, fill, h, icon, toast } from "./dom.js";
import { tokenForm } from "./setup.js";

export const SYNC_TEXT = {
  off: "Nepřipojeno", syncing: "Synchronizuji…", ok: "Synchronizováno", offline: "Čeká na připojení",
  conflict: "Konflikt – vyber verzi", error: "Chyba synchronizace",
};

export function renderSettings(root, app) {
  const resetAll = async () => {
    const ok = await confirmDialog("Resetovat všechny hádanky?",
      "Smaže se postup ve všech hádankách a jejich chyby, nápovědy a časy. XP, level, výzvy a odměny zůstanou.",
      { ok: "Resetovat vše", typeWord: "RESET" });
    if (!ok) return;
    await app.resetAll();
    toast("Všechny hádanky jsou zase nové.");
  };

  const sync = h("section", { class: "panel" });
  const drawSync = async () => {
    const token = await store.getCfg("token");
    const last = await store.getCfg("lastSync");
    const status = h("p", {}, SYNC_TEXT[app.sync.status], app.sync.message ? ` – ${app.sync.message}` : "",
      last ? h("span", { class: "note" }, ` (naposledy ${new Date(last).toLocaleString("cs-CZ")})`) : "");
    if (!token) {
      return fill(sync, h("h2", {}, "Synchronizace"), status,
        h("p", { class: "note" }, "Vlož přístupový token k soukromému úložišti dat."),
        tokenForm({ connect: () => app.connect(), onDone: () => { toast("Připojeno."); drawSync(); } }));
    }
    const change = () => fill(sync, h("h2", {}, "Nový token"),
      tokenForm({ connect: () => app.connect(), onDone: () => { toast("Token změněn."); drawSync(); }, cancel: drawSync }));
    const disconnect = async () => {
      const ok = await confirmDialog("Odpojit od GitHubu?",
        "Token se z tohoto zařízení smaže. Hádanky a postup tu zůstanou, jen se přestanou synchronizovat.", { ok: "Odpojit" });
      if (!ok) return;
      await store.setCfg("token", undefined);
      app.sync.set("off");
      drawSync();
    };
    fill(sync, h("h2", {}, "Synchronizace"), status,
      h("div", { class: "actions row" },
        h("button", { class: "primary", onclick: async () => { await app.sync.run(); drawSync(); } }, "Synchronizovat teď"),
        h("button", { onclick: change }, "Změnit token"),
        h("button", { onclick: disconnect }, "Odpojit")));
  };
  // redraw on status changes, but never under a token being typed
  const stop = app.sync.onStatus(() => { if (!document.body.contains(sync)) stop(); else if (!sync.querySelector("form")) drawSync(); });
  drawSync();

  root.replaceChildren(
    h("header", { class: "bar" },
      h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
      h("h1", {}, "Nastavení")),
    h("main", { class: "settings" },
      sync,
      h("section", { class: "panel" },
        h("h2", {}, "Hádanky"),
        h("button", { class: "danger", onclick: resetAll }, "Resetovat všechny hádanky")),
      h("p", { class: "note" }, `Verze dat ${app.content.version}`)));
}

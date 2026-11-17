// Conflict dialog of the sync: for each record changed on both sides, show both versions and let the
// player keep the one from this device or the one from GitHub (one by one, or all at once).

import { h } from "./dom.js";

function when(ms) {
  const d = new Date(ms), now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - day) / 86400000);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return diff === 0 ? `dnes ${time}` : diff === 1 ? `včera ${time}` : `${d.getDate()}. ${d.getMonth() + 1}. ${time}`;
}

/** Short description of one version of a record, e.g. "12/20 karet, včera 21:40". */
function describe(app, key, rec) {
  if (!rec) return "nic";
  const t = when(rec.updatedAt);
  if (rec.deleted) return `smazáno, ${t}`;
  if (key.startsWith("profiles/")) return `„${rec.name}“, ${t}`;
  const id = key.split("/").pop();
  const p = app.content.puzzles.find(x => x.id === id);
  if (key.startsWith("progress/") && p) {
    const state = rec.solvedAt ? "vyřešeno" : `${rec.known?.length ?? 0}/${p.grid.n} karet`;
    return `${state}, chyby ${rec.mistakes ?? 0}, ${t}`;
  }
  return t;
}

function title(app, key) {
  if (key.startsWith("profiles/")) return "Jméno profilu";
  const id = key.split("/").pop();
  const p = app.content.puzzles.find(x => x.id === id);
  if (!p) return key;
  const owner = app.profiles[key.split("/")[1]]?.name;
  return `Hádanka ${p.no}${owner && Object.keys(app.profiles).length > 1 ? ` (${owner})` : ""}`;
}

/** Resolves to { key: "local" | "remote" }, or null when the player postpones the decision. */
export function resolveConflicts(app, conflicts) {
  return new Promise(resolve => {
    const choice = {};
    const done = h("button", { class: "primary", disabled: true, onclick: () => close(choice) }, "Hotovo");
    const rows = conflicts.map(c => {
      const pick = side => {
        choice[c.key] = side;
        mine.classList.toggle("on", side === "local");
        theirs.classList.toggle("on", side === "remote");
        done.disabled = Object.keys(choice).length < conflicts.length;
      };
      const mine = h("button", { class: "side", onclick: () => pick("local") },
        h("strong", {}, "Toto zařízení"), h("span", {}, describe(app, c.key, c.local)));
      const theirs = h("button", { class: "side", onclick: () => pick("remote") },
        h("strong", {}, "GitHub"), h("span", {}, describe(app, c.key, c.remote)));
      return { pick, el: h("li", {}, h("p", {}, title(app, c.key)), h("div", { class: "sides" }, mine, theirs)) };
    });
    const all = side => rows.forEach(r => r.pick(side));
    const dlg = h("dialog", { class: "panel dialog conflicts" },
      h("h2", {}, "Konflikt"),
      h("p", {}, "Tyhle záznamy se změnily tady i na jiném zařízení. Vyber, kterou verzi nechat."),
      h("div", { class: "actions all" },
        h("button", { onclick: () => all("local") }, "Vše z tohoto zařízení"),
        h("button", { onclick: () => all("remote") }, "Vše z GitHubu")),
      h("ul", {}, rows.map(r => r.el)),
      h("div", { class: "actions" }, h("button", { onclick: () => close(null) }, "Později"), done));
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

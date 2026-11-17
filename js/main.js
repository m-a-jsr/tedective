// App start and hash router.

import { obtainContent, parseContent } from "./data/content.js";
import * as store from "./data/store.js";
import { Sync } from "./data/sync.js";
import { resolveConflicts } from "./ui/conflicts.js";
import { h, toast } from "./ui/dom.js";
import { renderGame } from "./ui/game.js";
import { renderHome } from "./ui/home.js";
import { renderSettings } from "./ui/settings.js";
import { renderSetup } from "./ui/setup.js";

const root = document.getElementById("app");
const PROFILE = "p1";   // profiles come in a later step

const app = {
  content: null,
  progress: {},
  sync: null,
  go(hash) { location.hash = hash; },
  async saveProgress(id, data) {
    this.progress[id] = data;
    await store.put(`progress/${PROFILE}/${id}`, data);
  },
  // reset removes a puzzle's progress and its per-puzzle statistics; XP, levels and rewards live elsewhere
  async resetProgress(id) {
    delete this.progress[id];
    await store.del(`progress/${PROFILE}/${id}`);
  },
  async resetAll() {
    for (const id of Object.keys(this.progress)) await this.resetProgress(id);
  },
  async loadProgress() {
    this.progress = {};
    for (const [key, value] of await store.entries(`progress/${PROFILE}/`)) this.progress[key.split("/").pop()] = value;
  },
  /** Download the content with the token just entered (setup and settings). */
  async connect() {
    const raw = await obtainContent();
    if (!raw) throw new Error("Data se nepodařilo stáhnout.");
    if (this.content && raw.version !== this.content.version) this.content = parseContent(raw);
    await this.sync.run();
  },
};

let leave = null;
function route() {
  leave?.();
  leave = null;
  const m = location.hash.match(/^#\/hra\/(.+)$/);
  const puzzle = m && app.content.puzzles.find(p => p.id === m[1]);
  document.body.dataset.screen = puzzle ? "game" : "menu";
  if (puzzle) leave = renderGame(root, app, puzzle);
  else if (location.hash === "#/nastaveni") renderSettings(root, app);
  else renderHome(root, app);
  window.scrollTo(0, 0);
}

function showError(err) {
  root.replaceChildren(h("main", { class: "panel error" }, h("h1", {}, "Data se nepodařilo načíst"), h("p", {}, err.message || String(err))));
}

async function start() {
  app.sync = new Sync({
    resolve: conflicts => resolveConflicts(app, conflicts),
    onApplied: async () => {
      await app.loadProgress();
      if (document.body.dataset.screen === "menu" && !location.hash.startsWith("#/nastaveni")) route();
    },
  });

  let raw;
  try {
    raw = await obtainContent({ refresh: false });          // the copy in the device: starts offline and fast
    if (!raw && await store.getCfg("token")) raw = await obtainContent();
  } catch (err) { return showError(err); }
  if (!raw) {
    return renderSetup(root, {
      connect: async () => { if (!await obtainContent()) throw new Error("Data se nepodařilo stáhnout."); },
      onDone: () => location.reload(),
    });
  }

  app.content = parseContent(raw);
  await app.loadProgress();
  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", () => leave?.());
  route();

  // in the background: newer puzzles from GitHub (used from the next start) and the sync
  if (await store.getCfg("token")) {
    obtainContent().then(fresh => {
      if (fresh && fresh.version !== app.content.version) toast("Stažena nová verze hádanek, projeví se po dalším spuštění.");
    }).catch(() => {});
    app.sync.run();
  }
}

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
start();

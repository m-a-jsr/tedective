// App start and hash router.

import { generatedPuzzle, obtainContent, parseContent } from "./data/content.js";
import * as store from "./data/store.js";
import { Sync } from "./data/sync.js";
import { resolveConflicts } from "./ui/conflicts.js";
import { h, toast } from "./ui/dom.js";
import { renderCast } from "./ui/cast.js";
import { renderCollection, renderNumbers } from "./ui/collection.js";
import { renderGame } from "./ui/game.js";
import { renderGenerator } from "./ui/generator.js";
import { renderHome } from "./ui/home.js";
import { renderSettings } from "./ui/settings.js";
import { renderSetup } from "./ui/setup.js";

const root = document.getElementById("app");
const app = {
  content: null,
  progress: {},
  sync: null,
  profile: "p1",          // id of the profile playing on this device (cfg/profile); records live under progress/<id>/
  profiles: {},           // id -> { name } (synced records profiles/<id>)
  generated: [],          // ready-to-play generated puzzles (synced records generated/<id>, shared by all profiles)
  allPuzzles() { return [...this.content.puzzles, ...this.generated]; },
  async loadGenerated() {
    this.generated = [];
    for (const [, rec] of await store.entries("generated/")) {
      try { this.generated.push(generatedPuzzle(rec)); } catch (e) { console.warn("bad generated puzzle", rec.id, e); }
    }
    this.generated.sort((a, b) => a.created - b.created);
  },
  async saveGenerated(rec) {
    const num = Math.max(0, ...this.generated.map(p => p.num ?? 0)) + 1;
    const id = `gen-${Date.now().toString(36)}`;
    const full = { ...rec, id, num, title: `Vlastní ${num}`, created: Date.now() };
    await store.put(`generated/${id}`, full);
    const p = generatedPuzzle(full);
    p.num = num;
    this.generated.push(p);
    return id;
  },
  async deleteGenerated(id) {
    await store.del(`generated/${id}`);
    for (const pid of Object.keys(this.profiles)) if (await store.get(`progress/${pid}/${id}`)) await store.del(`progress/${pid}/${id}`);
    delete this.progress[id];
    this.generated = this.generated.filter(p => p.id !== id);
  },
  go(hash) { location.hash = hash; },
  async saveProgress(id, data) {
    this.progress[id] = data;
    await store.put(`progress/${this.profile}/${id}`, data);
  },
  // reset removes a puzzle's progress and its per-puzzle statistics; XP, levels and rewards live elsewhere
  async resetProgress(id) {
    delete this.progress[id];
    await store.del(`progress/${this.profile}/${id}`);
  },
  async resetAll() {
    for (const id of Object.keys(this.progress)) await this.resetProgress(id);
  },
  async loadProgress() {
    this.progress = {};
    for (const [key, value] of await store.entries(`progress/${this.profile}/`)) this.progress[key.split("/").pop()] = value;
  },
  async loadProfiles() {
    this.profiles = Object.fromEntries((await store.entries("profiles/")).map(([k, v]) => [k.split("/").pop(), v]));
    // default profile kept only in memory until renamed, so a new device never conflicts with the synced one
    if (!Object.keys(this.profiles).length) this.profiles = { p1: { name: "Profil 1", unsaved: true } };
    const chosen = await store.getCfg("profile");
    this.profile = this.profiles[chosen] ? chosen : Object.keys(this.profiles).sort()[0];
  },
  async saveProfile(id, { unsaved, ...data }) {
    this.profiles[id] = await store.put(`profiles/${id}`, data);
  },
  async addProfile(name) {
    // the default profile becomes a real record once there are two, so it cannot get lost
    for (const [id, p] of Object.entries(this.profiles)) if (p.unsaved) await this.saveProfile(id, { name: p.name });
    const id = `p${Date.now().toString(36)}`;
    await this.saveProfile(id, { name });
    return id;
  },
  async switchProfile(id) {
    this.profile = id;
    await store.setCfg("profile", id);
    await this.loadProgress();
  },
  /** Delete a profile with all its progress (the last one cannot go). */
  async deleteProfile(id) {
    for (const [key] of await store.entries(`progress/${id}/`)) await store.del(key);
    await store.del(`profiles/${id}`);
    delete this.profiles[id];
    if (this.profile === id) await this.switchProfile(Object.keys(this.profiles).sort()[0]);
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
  const m = location.hash.match(/^#\/hra\/([^?]+)(\?kniha)?$/);
  const puzzle = m && app.allPuzzles().find(p => p.id === m[1]);
  document.body.dataset.screen = puzzle ? "game" : "menu";
  if (puzzle) {
    leave = renderGame(root, app, puzzle, { fromBook: !!m[2] });
    if (m[2]) history.replaceState(null, "", `#/hra/${puzzle.id}`);   // only once, not again on reload
  }
  else if (location.hash === "#/nastaveni") renderSettings(root, app);
  else if (location.hash === "#/postavy") renderCast(root, app);
  else if (location.hash === "#/nova") leave = renderGenerator(root, app);
  else if (location.hash === "#/sbirka") renderCollection(root, app);
  else if (location.hash === "#/cisla") renderNumbers(root, app);
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
      await app.loadProfiles();
      await app.loadProgress();
      await app.loadGenerated();
      if (document.body.dataset.screen === "menu" && !["#/nastaveni", "#/postavy"].includes(location.hash)) route();
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
  await app.loadProfiles();
  await app.loadProgress();
  await app.loadGenerated();
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

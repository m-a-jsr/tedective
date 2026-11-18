// App start and hash router.

import { generatedPuzzle, obtainContent, parseContent } from "./data/content.js";
import * as store from "./data/store.js";
import { Sync } from "./data/sync.js";
import { resolveConflicts } from "./ui/conflicts.js";
import { h, toast } from "./ui/dom.js";
import { CHALLENGES, isActive, levelOf, solveEvent } from "./game/progression.js";
import { FEATURES } from "./features.js";
import { buildDaily, dailyTitle, dayKey } from "./game/daily.js";
import { renderAppearance } from "./ui/appearance.js";
import { applyLook } from "./ui/look.js";
import { renderCast } from "./ui/cast.js";
import { renderChallenges } from "./ui/challenges.js";
import { renderStats } from "./ui/stats.js";
import { renderCollection, renderNumbers, seenQuotes } from "./ui/collection.js";
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
    const num = rec.daily ? null : Math.max(0, ...this.generated.map(p => p.num ?? 0)) + 1;
    const id = rec.daily ? `den-${rec.daily}` : `gen-${Date.now().toString(36)}`;   // one record per day on every device
    const full = { ...rec, id, num, title: rec.daily ? dailyTitle(rec.daily) : `Vlastní ${num}`, created: Date.now() };
    await store.put(`generated/${id}`, full);
    const p = generatedPuzzle(full);
    p.num = num;
    this.generated.push(p);
    return id;
  },
  /** Today's daily puzzle: open it, or build it first (prepared, see features.js). */
  async openDaily(onProgress) {
    if (!FEATURES.daily) return;
    const key = dayKey();
    let p = this.generated.find(x => x.daily === key);
    if (!p) {
      const rec = await buildDaily(this, key, onProgress);
      await this.saveGenerated({ ...rec, daily: key });
      p = this.generated.find(x => x.daily === key);
    }
    this.go(`#/hra/${p.id}`);
  },
  async deleteGenerated(id) {
    await store.del(`generated/${id}`);
    for (const pid of Object.keys(this.profiles)) if (await store.get(`progress/${pid}/${id}`)) await store.del(`progress/${pid}/${id}`);
    delete this.progress[id];
    this.generated = this.generated.filter(p => p.id !== id);
  },
  go(hash) { location.hash = hash; },
  history: [],            // solve and challenge events of this profile (xp/<profile>/…), oldest first
  done: new Set(),        // completed challenge ids (done/<profile>/…)
  /** Save a puzzle's progress; when it has just become solved, award XP and check the challenges.
   *  Returns { event, challenges, levelBefore, levelAfter } then, else null. */
  async saveProgress(id, data) {
    const wasSolved = !!this.progress[id]?.solvedAt;
    this.progress[id] = data;
    await store.put(`progress/${this.profile}/${id}`, data);
    if (wasSolved || !data.solvedAt) return null;
    const p = this.allPuzzles().find(x => x.id === id);
    return p ? this.award(p, data) : null;
  },
  get xp() { return this.history.reduce((n, e) => n + (e.xp ?? 0), 0); },
  get level() { return levelOf(this.xp); },
  look: {},              // chosen look of this profile (look/<profile>)
  async loadLook() {
    this.look = (await store.get(`look/${this.profile}`)) ?? {};
    await applyLook(this);
  },
  async loadHistory() {
    this.history = (await store.entries(`xp/${this.profile}/`)).map(([, v]) => v).sort((a, b) => a.at - b.at);
    this.done = new Set((await store.entries(`done/${this.profile}/`)).map(([k]) => k.split("/").pop()));
  },
  async addEvent(key, event) {
    const rec = await store.put(`xp/${this.profile}/${key}`, event);
    this.history.push(rec);
  },
  async award(p, data, quiet = false) {
    const levelBefore = this.level.level;
    const replay = this.history.some(e => e.kind === "solve" && e.puzzle === p.id);
    const event = solveEvent(p, data, replay);
    await this.addEvent(replay ? `${p.id}-${Date.now().toString(36)}` : `${p.id}-1`, event);
    const challenges = await this.evaluate();
    if (!quiet && (this.level.level !== levelBefore || challenges.length)) await applyLook(this);
    return quiet ? null : { event, challenges, levelBefore, levelAfter: this.level.level };
  },
  /** Facts the challenges are checked against. */
  challengeContext() {
    const { byName, general } = seenQuotes(this);
    const cast = this.content.cast;
    const groups = {};
    for (const c of cast) if (c.quotes.length) {
      const g = (groups[c.group] ??= { have: 0, need: 0 });
      g.need += c.quotes.length;
      g.have += byName.get(c.name)?.size ?? 0;
    }
    const bestGroup = Object.values(groups).sort((a, b) => b.have / b.need - a.have / a.need || a.need - b.need)[0] ?? { have: 0, need: 1 };
    const met = new Set();
    for (const p of this.allPuzzles()) if (this.progress[p.id]?.solvedAt) p.names.forEach(n => met.add(n));
    return {
      solves: this.history.filter(e => e.kind === "solve"), progress: this.progress, book: this.content.puzzles,
      quotesSeen: [...byName.values()].reduce((n, s) => n + s.size, 0) + general.size, bestGroup,
      met: cast.filter(c => met.has(c.name)).length, castSize: cast.length, done: this.done,
    };
  },
  /** Complete every active challenge whose condition holds (repeatedly: a reward can raise the level). Returns the new ones. */
  async evaluate() {
    const out = [];
    for (let round = 0; round < 5; round++) {
      const ctx = this.challengeContext(), level = this.level.level, fresh = [];
      for (const ch of CHALLENGES) {
        if (this.done.has(ch.id) || !isActive(ch, level) || !ch.check(ctx).done) continue;
        this.done.add(ch.id);
        await store.put(`done/${this.profile}/${ch.id}`, { at: Date.now() });
        if (ch.xp) await this.addEvent(`ch-${ch.id}`, { kind: "challenge", id: ch.id, xp: ch.xp, at: Date.now() });
        fresh.push(ch);
      }
      out.push(...fresh);
      if (!fresh.length) break;
    }
    return out;
  },
  /** Puzzles solved before XP existed (or solved on a device that has not synced yet) get their XP once. */
  async backfill() {
    for (const p of this.allPuzzles()) {
      const r = this.progress[p.id];
      if (r?.solvedAt && !this.history.some(e => e.kind === "solve" && e.puzzle === p.id)) await this.award(p, r, true);
    }
    await this.evaluate();
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
    await this.loadHistory();
    await this.backfill();
    await this.loadLook();
  },
  /** Delete a profile with all its progress (the last one cannot go). */
  async deleteProfile(id) {
    for (const pre of ["progress", "xp", "done"]) for (const [key] of await store.entries(`${pre}/${id}/`)) await store.del(key);
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
  else if (location.hash === "#/statistiky") renderStats(root, app);
  else if (location.hash === "#/vzhled") renderAppearance(root, app);
  else if (location.hash.startsWith("#/vyzvy")) renderChallenges(root, app);
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
      await app.loadHistory();
      await app.loadLook();
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
  await app.loadHistory();
  await app.backfill();
  await app.loadLook();
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

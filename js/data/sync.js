// Sync of the stamped records with the private GitHub repository (plan, chapter 2.3).
// All records live in one file there. Each device remembers the stamps it last synced (the base):
// a record changed only on one side since then is taken over, one changed on both sides is a conflict
// the player decides. The write is checked against the file's sha, so a parallel write is never lost.

import * as gh from "./github.js";
import * as store from "./store.js";

const STATE_FILE = "state/zaznamy.json";
const DELAY = 4000;              // push this long after the last change

const EVENT = /^(xp|done)\//;

export const stamp = r => (r ? `${r.updatedAt}:${r.device}` : null);

/** Three-way merge of { key: record } maps against base { key: stamp }.
 *  Returns merged records, keys to take from remote, and conflicts { key, local, remote }. */
export function merge(local, remote, base) {
  const merged = {}, toLocal = [], conflicts = [];
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const L = local[key], R = remote[key], B = base[key] ?? null;
    if (stamp(L) === stamp(R)) { merged[key] = L; continue; }
    const localChanged = stamp(L) !== B, remoteChanged = stamp(R) !== B;
    if (!remoteChanged) { if (L) merged[key] = L; }
    else if (!localChanged) { if (R) { merged[key] = R; toLocal.push(key); } }
    else if (EVENT.test(key) && L && R && !L.deleted && !R.deleted) {
      // XP and challenge records never change after they are written; the same one written on two
      // devices (e.g. the first solve of a puzzle) is the same fact, so keep the older copy silently
      const keepLocal = L.updatedAt <= R.updatedAt;
      merged[key] = keepLocal ? L : R;
      if (!keepLocal) toLocal.push(key);
    }
    else if (key.startsWith("seen/") && L && R) {
      // "Novinky read up to": both devices just moved it forward, the later point wins
      const keepLocal = (L.upto ?? 0) >= (R.upto ?? 0);
      merged[key] = keepLocal ? L : R;
      if (!keepLocal) toLocal.push(key);
    }
    else conflicts.push({ key, local: L, remote: R });
  }
  return { merged, toLocal, conflicts };
}

/** Status: off (no token) | syncing | ok | offline | conflict | error. */
export class Sync {
  /** resolve(conflicts) -> Promise<{ key: "local" | "remote" } | null>; onApplied(keys) after remote changes came in. */
  constructor({ resolve, onApplied }) {
    this.resolve = resolve;
    this.onApplied = onApplied;
    this.status = "off";
    this.message = "";
    this.listeners = new Set();
    this.running = null;
    this.again = false;
    this.timer = null;
    store.onChange(() => this.schedule());
    window.addEventListener("online", () => this.run());
    // push pending changes when the app goes to the background; fetch others' changes when it comes back
    document.addEventListener("visibilitychange", () => { if (document.hidden ? this.timer : true) this.run(); });
    setInterval(() => { if (!document.hidden && this.status !== "conflict") this.run(); }, 60000);
  }

  onStatus(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(status, message = "") {
    this.status = status;
    this.message = message;
    this.listeners.forEach(fn => fn(status, message));
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), DELAY);
  }

  /** Sync now. Concurrent calls share one run and trigger one more afterwards. */
  run() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.running) { this.again = true; return this.running; }
    this.running = this.once().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; this.run(); }
    });
    return this.running;
  }

  async once() {
    const token = await store.getCfg("token");
    if (!token) return this.set("off");
    if (!navigator.onLine) return this.set("offline", "Čeká na připojení.");
    this.set("syncing");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await this.attempt(token)) return;
      }
      this.set("error", "Data se pořád mění na jiném zařízení, zkus to za chvíli.");
    } catch (e) {
      if (e.status === 0) this.set("offline", "Čeká na připojení.");
      else this.set("error", e.message);
    }
  }

  /** One read-merge-write round; false if GitHub changed in the meantime (then it is repeated). */
  async attempt(token) {
    const { json, sha } = await gh.readJson(token, STATE_FILE);
    const remote = json?.records ?? {};
    const local = Object.fromEntries((await store.rawEntries()).filter(([k]) => !store.isLocal(k)));
    const base = (await store.getCfg("syncBase")) ?? {};
    const { merged, toLocal, conflicts } = merge(local, remote, base);

    if (conflicts.length) {
      this.set("conflict", `${conflicts.length} ${conflicts.length === 1 ? "záznam se liší" : "záznamy se liší"}.`);
      const choice = await this.resolve(conflicts);
      if (!choice) return true;                       // left for later; status stays "conflict"
      this.set("syncing");
      for (const c of conflicts) {
        const pick = choice[c.key] === "remote" ? c.remote : c.local;
        if (pick) merged[c.key] = pick;
        if (choice[c.key] === "remote" && c.remote) toLocal.push(c.key);
      }
    }

    // take over remote changes, unless the record changed here again meanwhile (then it goes up next time)
    const applied = [];
    for (const key of toLocal) {
      const now = (await store.rawEntries(key)).find(([k]) => k === key)?.[1];
      if (stamp(now) !== stamp(local[key])) continue;
      await store.putRaw(key, merged[key]);
      applied.push(key);
    }

    const changed = Object.keys(merged).some(k => stamp(merged[k]) !== stamp(remote[k]));
    if (changed) {
      try {
        await gh.writeJson(token, STATE_FILE, { records: merged }, sha, `sync ${store.deviceId}`);
      } catch (e) {
        if (e.status === 409 || e.status === 422) return false;
        throw e;
      }
    }
    await store.setCfg("syncBase", Object.fromEntries(Object.entries(merged).map(([k, r]) => [k, stamp(r)])));
    await store.setCfg("lastSync", Date.now());
    if (applied.length) this.onApplied(applied);
    if (this.status !== "conflict") this.set("ok");
    return true;
  }
}

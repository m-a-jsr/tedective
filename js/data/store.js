// Local storage of the app (IndexedDB): one key-value table.
// Every record carries updatedAt and device, which the GitHub sync uses to merge. A deleted record
// stays as a tombstone ({ deleted: true } with a stamp) so the deletion reaches the other devices.
// Keys under cfg/ (token, sync bookkeeping) and cache/ (downloaded content) are local only and unstamped.

const DB = "tedective";
const TABLE = "kv";

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(TABLE, mode);
    const res = fn(t.objectStore(TABLE));
    t.oncomplete = () => resolve(res && "result" in res ? res.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const deviceId = (() => {
  try {
    let id = localStorage.getItem("tedective-device");
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem("tedective-device", id); }
    return id;
  } catch { return "local"; }
})();

export const isLocal = key => key.startsWith("cfg/") || key.startsWith("cache/");

export async function get(key) {
  const v = await tx("readonly", s => s.get(key));
  return v?.deleted ? undefined : v;
}

/** Delete a record: a stamped tombstone, so sync can pass the deletion on. */
export async function del(key) {
  if (isLocal(key)) return tx("readwrite", s => s.delete(key));
  await put(key, { deleted: true });
}

/** All [key, value] pairs whose key starts with `prefix`, without tombstones. */
export async function entries(prefix = "") {
  return (await rawEntries(prefix)).filter(([, v]) => !v?.deleted);
}

/** All [key, record] pairs whose key starts with `prefix`, tombstones included, in one transaction. */
export async function rawEntries(prefix = "") {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out = [];
    const range = IDBKeyRange.bound(prefix, prefix + "￿");
    const req = d.transaction(TABLE, "readonly").objectStore(TABLE).openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      out.push([c.key, c.value]);
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function keys(prefix = "") {
  const all = await tx("readonly", s => s.getAllKeys());
  return all.filter(k => k.startsWith(prefix));
}

const listeners = new Set();
/** Called with the key after every stamped change (the sync uses it to push soon). */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Store a record, stamping it for sync. */
export async function put(key, value) {
  const rec = { ...value, updatedAt: Date.now(), device: deviceId };
  await tx("readwrite", s => s.put(rec, key));
  listeners.forEach(fn => fn(key));
  return rec;
}

/** Store a record exactly as given (sync applying a remote version). */
export async function putRaw(key, rec) { return tx("readwrite", s => s.put(rec, key)); }

/** Local-only settings (not stamped, never synced). */
export const getCfg = key => tx("readonly", s => s.get(`cfg/${key}`));
export const setCfg = (key, value) => tx("readwrite", s => (value === undefined ? s.delete(`cfg/${key}`) : s.put(value, `cfg/${key}`)));

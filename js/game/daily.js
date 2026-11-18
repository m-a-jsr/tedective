// Daily puzzle (prepared, off: see js/features.js). The date alone decides the generator settings and
// the seed, so every device builds the same puzzle for the same day. It is stored like any generated
// puzzle (generated/<id>) with the field `daily` = "YYYY-MM-DD"; the streak of days comes from the
// solve history.

const THEMES = ["zlocin", "mastny", "liny", "pavouk"];

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function hash(text) {
  let h = 0x811c9dc5;   // FNV-1a
  for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Generator params for a date: 4×5 on weekdays, 5×6 at the weekend, variant B on Sundays, themes in turn. */
export function dailyParams(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.getDay();                       // 0 Sunday
  const index = Math.round(date.getTime() / 86400000);
  const big = weekday === 0 || weekday === 6;
  return { v: 1, cols: big ? 5 : 4, rows: big ? 6 : 5, variant: weekday === 0 ? "B" : "A", tier: "hard",
    theme: THEMES[((index % 4) + 4) % 4], candidates: big ? 4 : 6, seed: hash(`tedective-${key}`),
    include: [], exclude: [], pool: [], kinds: null };
}

export const dailyTitle = key => { const [, m, d] = key.split("-").map(Number); return `Denní ${d}. ${m}.`; };

/** Build the day's puzzle in the generator worker. Resolves to the generator's result record. */
export function buildDaily(app, key, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../logic/gen-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.progress) return onProgress(data.progress);
      worker.terminate();
      if (data.error) reject(new Error(data.error)); else resolve(data.result);
    };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || "Chyba generátoru.")); };
    const cast = app.content.cast.map(({ name, group, fixed, section, quotes, alwaysQuote }) => ({ name, group, fixed, section, quotes, alwaysQuote }));
    worker.postMessage({ params: dailyParams(key), cast, quotes: app.content.quotes });
  });
}

/** Days in a row with a solved daily puzzle, ending today (or yesterday, if today is not solved yet). */
export function dailyStreak(app) {
  const solvedDays = new Set(app.generated.filter(p => p.daily && app.progress[p.id]?.solvedAt).map(p => p.daily));
  const d = new Date();
  if (!solvedDays.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (solvedDays.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

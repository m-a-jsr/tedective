// Web worker for the generator screen: tries candidates in the background and returns the hardest.
// Message in: { params, cast, quotes }. Messages out: { progress: { done, of, tries } }, then { result } or { error }.
// The same params (they include the seed) always give the same puzzle for the same cast, which makes
// the share code work.

import { clueToDict } from "./clues.js";
import { czechCompare, themeOf } from "./czech.js";
import { Rng, generate } from "./generate.js";

const MAX_TRIES_PER_CANDIDATE = 25;

/** Characters for one candidate, seated in Czech alphabetical order (like gen/cast.py sample_cast). */
function pickCast(cast, params, theme, rng) {
  const n = params.cols * params.rows;
  const exclude = new Set(params.exclude ?? []);
  const pool = params.pool?.length ? new Set(params.pool) : null;
  const must = cast.filter(c => (params.include ?? []).includes(c.name));
  // a character bound to a book section only appears with that section's theme
  const free = cast.filter(c => !exclude.has(c.name) && !must.includes(c) && (!pool || pool.has(c.name))
    && (!c.section || c.section === theme.key));
  if (must.length > n) throw new Error(`Povinných postav je ${must.length}, ale karet jen ${n}.`);
  if (must.length + free.length < n) throw new Error(`Na ${n} karet je k dispozici jen ${must.length + free.length} postav.`);
  return [...must, ...rng.sample(free, n - must.length)].sort((a, b) => czechCompare(a.name, b.name));
}

function quotesFor(pick, statements, general, rng) {
  return pick.map((c, i) => {
    if (statements.has(i)) return null;
    if (c.quotes.length && (c.alwaysQuote || rng.random() < 0.5)) return rng.choice(c.quotes);
    return general.length ? rng.choice(general) : null;
  });
}

self.onmessage = ({ data: { params, cast, quotes } }) => {
  try {
    const theme = themeOf(params.theme);
    const kinds = params.kinds?.length ? new Set(params.kinds) : null;
    let best = null, done = 0, tries = 0;
    for (let k = 0; done < params.candidates; k++) {
      if (tries >= params.candidates * MAX_TRIES_PER_CANDIDATE) break;
      tries++;
      const seed = (params.seed + k * 7919) >>> 0;
      const rng = new Rng(seed ^ 0x9e3779b9);
      const pick = pickCast(cast, params, theme, rng);
      const fixed = new Map(pick.flatMap((c, i) => (c.fixed == null ? [] : [[i, c.fixed]])));
      let p = null;
      try {
        p = generate({ cols: params.cols, rows: params.rows, variant: params.variant, seed, tier: params.tier,
          names: pick.map(c => c.name), roles: pick.map(c => c.group), fixed, kinds });
      } catch { p = null; }   // a rare dead end of this seed; the next one is tried

      self.postMessage({ progress: { done: done + (p ? 1 : 0), of: params.candidates, tries } });
      if (!p) continue;
      done++;
      if (!best || p.score > best.p.score) best = { p, pick, rng };
    }
    if (!best) throw new Error("Z těchto nastavení se nepodařilo hádanku sestavit. Zkus povolit víc typů nápověd nebo méně omezení postav.");
    const { p, pick, rng } = best;
    self.postMessage({ result: {
      cols: p.cols, rows: p.rows, variant: p.variant, tier: p.tier, theme: params.theme,
      names: pick.map(c => c.name), roles: pick.map(c => c.group), sol: p.sol, start: p.start, star: p.star,
      clues: [...p.statements].map(([cell, c]) => [cell, clueToDict(c)]),
      quotes: quotesFor(pick, p.statements, quotes.map(q => q.text), rng),
      steps: p.steps, levels: p.levels, score: Math.round(p.score * 10) / 10,
    } });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};

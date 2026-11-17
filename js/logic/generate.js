// Puzzle generator (port of build_pool in gen/clues.py and generate in gen/generate.py).
//
// Variant A: a card's statement is revealed only after the card is solved.
// Variant B: every statement is visible from the start.
// Pick a random solution, simulate the bounded player; whenever it gets stuck, give some card a new
// true statement that unblocks it. Finally drop every statement the puzzle can do without.

import { Compare, Connected, Count, Intersect, Is, Most, NamedIn, Odd, Only, cnt, group } from "./clues.js";
import { initial } from "./czech.js";
import { Grid } from "./grid.js";
import { Player, activeStatements } from "./player.js";

// Relative frequency of clue kinds; most clues are local and count-based, global ones are seasoning.
export const KIND_WEIGHTS = {
  count_neigh: 3.0, count_row: 1.0, count_col: 1.0, count_edge: 0.3, count_corner: 0.3,
  count_all: 0.4, count_between: 0.7, count_common: 0.8, count_role: 2.0, count_letter: 1.2,
  named_in: 1.2, intersect: 1.5, compare_gt: 1.2, compare_eq: 0.8,
  connected: 1.0, most: 0.7, only: 0.5, odd: 0.6, is: 0.15,
};

// max statements combined per step, preference for combination-only statements
export const TIERS = { intro: [1, false], mid: [2, true], veryhard: [3, true], hard: [3, true], max: [3, true] };

/** Seeded PRNG (mulberry32) with the helpers the generator needs. */
export class Rng {
  constructor(seed) { this.a = seed >>> 0; }
  random() {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a, b) { return a + (b - a) * this.random(); }
  randrange(n) { return Math.floor(this.random() * n); }
  choice(arr) { return arr[this.randrange(arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.randrange(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  sample(arr, k) { return this.shuffle([...arr]).slice(0, k); }
  weighted(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let x = this.random() * total;
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
    return weights.length - 1;
  }
}

/** All clue instances that are true for the given solution.
 *  `names` and `roles` (one per cell) enable clues about shared roles and initials. */
export function buildPool(grid, sol, rng, { maxPairs = 400, names = null, roles = null, kinds = null } = {}) {
  const rows = [...Array(grid.rows).keys()].map(r => group("row", grid.row(r), r));
  const cols = [...Array(grid.cols).keys()].map(c => group("col", grid.col(c), c));
  const neigh = [...Array(grid.n).keys()].map(p => group("neigh", grid.neighbors[p], p));
  const groups = [...rows, ...cols, ...neigh, group("edge", grid.edge), group("corner", grid.corners),
    group("all", [...Array(grid.n).keys()])];
  const roleGroups = [];
  for (const [attr, kind] of [[roles, "role"], [names ? names.map(initial) : null, "letter"]]) {
    if (!attr) continue;
    for (const v of [...new Set(attr)].sort()) {
      const cells = [...Array(grid.n).keys()].filter(i => attr[i] === v);
      if (cells.length >= 2 && cells.length < grid.n) {
        const g = group(kind, cells, -1, -1, v);
        groups.push(g);
        if (kind === "role") roleGroups.push(g);
      }
    }
  }
  const pairs = [];
  for (let a = 0; a < grid.n; a++) for (let b = a + 1; b < grid.n; b++) pairs.push([a, b]);
  rng.shuffle(pairs);
  for (const [a, b] of pairs.slice(0, maxPairs)) {
    const bt = grid.between(a, b);
    if (bt && bt.length) groups.push(group("between", bt, a, b));
    const cm = grid.commonNeighbors(a, b);
    if (cm.length >= 2) groups.push(group("common", cm, a, b));
  }

  const out = [];
  for (const s of [0, 1]) {
    for (const g of groups) {
      const c = cnt(g.cells, s, sol);
      out.push(new Count(g, s, c));
      if (c >= 1 && c < g.cells.length && ["neigh", "row", "col", "common"].includes(g.kind))
        out.push(new Count(g, s, Math.max(1, c - 1), true));
      if (["row", "col", "neigh"].includes(g.kind) && c % 2 === 1) out.push(new Odd(g, s));
    }
    for (const g of [...neigh, ...roleGroups]) {
      const c = cnt(g.cells, s, sol);
      for (const q of g.cells) if (sol[q] === s) out.push(new NamedIn(g, q, s, c));
      if (g.kind === "neigh") {
        for (const h of [...rows, ...cols]) {
          const hs = new Set(h.cells);
          const inter = g.cells.filter(i => hs.has(i));
          if (inter.length >= 2 && inter.length < g.cells.length) out.push(new Intersect(g, h, s, c, cnt(inter, s, sol)));
        }
      }
    }
    for (const line of [...rows, ...cols]) {
      const cn = new Connected(line, s);
      if (cn.holds(sol)) out.push(cn);
    }
    for (const lines of [rows, cols, roleGroups]) {
      for (const g of lines) {
        const others = lines.filter(o => o !== g);
        if (!others.length) continue;
        const m = new Most(g, others, s);
        if (m.holds(sol)) out.push(m);
        const o = new Only(g, others, s, cnt(g.cells, s, sol));
        if (g.kind !== "role" && o.holds(sol)) out.push(o);
      }
    }
    for (const [p, q] of pairs.slice(0, maxPairs)) {
      const np = new Set(grid.neighbors[p]);
      if (grid.neighbors[q].some(i => np.has(i)) || Math.abs(p - q) <= grid.cols * 2) {
        for (const [a, b] of [[p, q], [q, p]]) {
          const cmp = new Compare(a, b, neigh[a], neigh[b], s, "gt");
          if (cmp.holds(sol)) out.push(cmp);
        }
        const eq = new Compare(p, q, neigh[p], neigh[q], s, "eq");
        if (eq.holds(sol)) out.push(eq);
      }
    }
  }
  for (let q = 0; q < grid.n; q++) out.push(new Is(q, sol[q]));

  const pool = kinds ? out.filter(c => kinds.has(c.kind) || c.kind === "is") : out;
  // weight per kind, split among its instances, so kinds with many instances don't crowd out the rest
  const perKind = {};
  for (const c of pool) perKind[c.kind] = (perKind[c.kind] ?? 0) + 1;
  for (const c of pool) c.weight = (KIND_WEIGHTS[c.kind] ?? 1.0) / perKind[c.kind];
  if (!pool.every(c => c.holds(sol))) throw new Error("pool contains a false clue");
  return pool;
}

export function score(p) {
  const avgWidth = (p.cols * p.rows - 1) / Math.max(1, p.steps.length);
  return p.steps.length + p.levels.reduce((s, lv) => s + ({ 1: 0, 2: 2, 3: 5 })[lv], 0) - avgWidth;
}

/** One puzzle, or null when this seed does not work out.
 *  `fixed` (Map cell -> state) pins cells (rules from the cast); `kinds` limits the clue kinds. */
export function generate({ cols, rows, variant, seed, tier = "hard", names = null, roles = null, fixed = null, kinds = null }) {
  const rng = new Rng(seed);
  const [maxK, preferCombo] = TIERS[tier];
  const grid = new Grid(cols, rows);
  const n = grid.n;
  const density = rng.uniform(0.3, 0.6);
  const sol = Array.from({ length: n }, () => (rng.random() < density ? 1 : 0));
  for (const [i, v] of fixed ?? []) sol[i] = v;
  const pool = buildPool(grid, sol, rng, { names, roles, kinds }).filter(c => c.kind !== "is" || tier === "intro");
  const pl = new Player(grid, pool, maxK);
  const weights = pool.map(c => c.weight);

  const start = rng.randrange(n);
  let statements = new Map();
  const known = new Map([[start, sol[start]]]);
  const order = [start];
  const used = new Set();
  const kindUsed = {};

  while (known.size < n) {
    const active = activeStatements(variant, statements, known);
    const [, f] = pl.step(active, known);
    if (f.size) {
      for (const [i, v] of f) known.set(i, v);
      order.push(...rng.shuffle([...f.keys()].sort((a, b) => a - b)));
      continue;
    }
    // stuck: hand a new statement to a card that has none yet
    let slots;
    if (variant === "A") {
      slots = order.filter(c => !statements.has(c));
      if (slots.length && rng.random() < 0.6) slots = slots.slice(-3);   // favour recently solved cards
    } else {
      slots = [...Array(n).keys()].filter(c => !statements.has(c));
    }
    if (!slots.length) return null;
    const slot = rng.choice(slots);
    // vary the clue kinds: each use of a kind makes it less likely next time
    const w = weights.map((wt, j) => wt / (1 + 1.5 * (kindUsed[pool[j].kind] ?? 0)));
    const useful = [];
    for (let t = 0; t < 80; t++) {
      const j = rng.weighted(w);
      if (used.has(j)) continue;
      const [lvJ, fJ] = pl.step([...active, j], known, j);
      if (fJ.size) {
        useful.push([j, lvJ, fJ.size]);
        if (useful.length >= (preferCombo ? 8 : 3)) break;
      }
    }
    if (!useful.length) return null;
    let j;
    if (preferCombo) {
      // prefer statements that only bite in combination, and unlock little at once
      const keyed = useful.map(u => [u, rng.random()]);
      keyed.sort((x, y) => y[0][1] - x[0][1] || x[0][2] - y[0][2] || y[1] - x[1]);
      j = keyed[0][0][0];
    } else {
      j = rng.choice(useful)[0];
    }
    used.add(j);
    kindUsed[pool[j].kind] = (kindUsed[pool[j].kind] ?? 0) + 1;
    statements.set(slot, j);
  }

  // prune statements the puzzle can do without
  for (const cell of rng.shuffle([...statements.keys()].sort((a, b) => a - b))) {
    if (cell === start && variant === "A") continue;
    const trial = new Map([...statements].filter(([k]) => k !== cell));
    if (pl.simulate(variant, trial, start, sol).solved) statements = trial;
  }

  const sim = pl.simulate(variant, statements, start, sol);
  if (!sim.solved || !pl.r.isUnique([...statements.values()].map(j => pool[j]), new Map([[start, sol[start]]])))
    throw new Error("generated puzzle is not uniquely solvable");

  // ★ card: a cell that only becomes provable in the very last step, preferably without a statement
  const last = [...sim.steps[sim.steps.length - 1].keys()].filter(c => c !== start);
  let star = null;
  if (last.length) {
    const quiet = last.filter(c => !statements.has(c));
    star = rng.choice(quiet.length ? quiet : last);
    if (!pl.simulate(variant, statements, start, sol, star).solved) star = null;
  }
  if (tier !== "intro" && star === null) return null;

  const p = {
    cols, rows, variant, seed, tier, sol, start, star,
    statements: new Map([...statements].map(([c, j]) => [c, pool[j]])),
    steps: sim.steps.map(f => [...f.keys()].sort((a, b) => a - b)),
    levels: sim.levels,
  };
  p.score = score(p);
  return p;
}

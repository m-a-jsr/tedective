// Bounded human player (port of Player in gen/generate.py).
// A step may combine at most `maxK` statements; the easiest available level is taken first.

import { Reasoner } from "./solver.js";

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield [...acc]; return; }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

export class Player {
  /** `pool` is an array of clues; statements refer to them by index. */
  constructor(grid, pool, maxK) {
    this.grid = grid;
    this.pool = pool;
    this.r = new Reasoner(grid);
    this.scope = pool.map(c => c.scope());
    this.maxK = maxK;
  }

  *subsets(active, k, must) {
    if (must == null) { yield* combinations(active, k); return; }
    for (const rest of combinations(active.filter(j => j !== must), k - 1)) yield [must, ...rest];
  }

  /** Cells forced by some k-subset of the active statements (containing `must` if given).
   *  `hold` is a cell the player deliberately leaves for last (never reported). */
  forcedAt(active, known, k, must = null, hold = null) {
    const out = new Map();
    for (const sub of this.subsets(active, k, must)) {
      const scopes = sub.map(j => this.scope[j]);
      // statements that share no cells cannot help each other
      if (k > 1 && scopes.some((s, a) => ![...s].some(i => scopes.some((t, b) => b !== a && t.has(i))))) continue;
      const cells = [];
      const seen = new Set();
      for (const s of scopes) for (const i of s)
        if (!seen.has(i) && !known.has(i) && i !== hold && !out.has(i)) { seen.add(i); cells.push(i); }
      if (cells.length) {
        cells.sort((a, b) => a - b);
        for (const [i, v] of this.r.forced(sub.map(j => this.pool[j]), known, cells)) out.set(i, v);
      }
    }
    return out;
  }

  /** Easiest available step: [level, forced cells], or [0, empty] when stuck. */
  step(active, known, must = null, hold = null) {
    for (let k = 1; k <= Math.min(this.maxK, Math.max(1, active.length)); k++) {
      const f = this.forcedAt(active, known, k, must, hold);
      if (f.size) return [k, f];
    }
    return [0, new Map()];
  }

  /** statements: Map cell -> pool index. With `hold`, that cell is solved only once everything else is known. */
  simulate(variant, statements, start, sol, hold = null) {
    const known = new Map([[start, sol[start]]]);
    const steps = [], levels = [];
    while (known.size < this.grid.n) {
      const active = activeStatements(variant, statements, known);
      const [lv, f] = this.step(active, known, null, known.size < this.grid.n - 1 ? hold : null);
      if (!f.size) return { steps, levels, solved: false };
      steps.push(f);
      levels.push(lv);
      for (const [i, v] of f) known.set(i, v);
    }
    return { steps, levels, solved: true };
  }
}

export function activeStatements(variant, statements, known) {
  if (variant === "B") return [...statements.values()];
  return [...known.keys()].filter(c => statements.has(c)).map(c => statements.get(c));
}

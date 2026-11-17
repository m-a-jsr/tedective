// Reasoning: which cells are forced by a set of clues (port of gen/solver.py).
//
// Two solvers behind one interface:
//  - Search: backtracking over cell values with count propagation. Very fast for the usual small
//    queries, but some clue combinations (several "most" clues) make it explode, so it runs with a
//    node budget.
//  - SAT (sat.js), used when the search runs out of budget: every clue is encoded once behind an
//    enable literal; queries pass the active clues and known cells as assumptions. Counts use
//    sequential unary counters shared between clues that count the same set of cells.

import { Sat } from "./sat.js";

const BUDGET = 3000;        // search nodes per solve before falling back to SAT
const OUT_OF_BUDGET = undefined;
const OUT = new Error("search budget exceeded");

/** One search problem: the primitives of some clues over n cells. */
class Problem {
  constructor(n, prims) {
    this.n = n;
    // in a comparison the cells both sides share cancel out, so compare only the disjoint parts
    this.prims = prims.map(p => {
      if (p.t !== "cmp") return p;
      const a = new Set(p.a), b = new Set(p.b);
      return { ...p, a: p.a.filter(i => !b.has(i)), b: p.b.filter(i => !a.has(i)) };
    });
    this.byCell = Array.from({ length: n }, () => []);
    this.prims.forEach((p, j) => {
      const cells = p.t === "cmp" ? [...p.a, ...p.b] : p.cells;
      for (const i of new Set(cells)) this.byCell[i].push(j);
    });
    // branch on the most constrained cells first
    this.order = [...Array(n).keys()].filter(i => this.byCell[i].length)
      .sort((a, b) => this.byCell[b].length - this.byCell[a].length);
  }

  /** A full assignment satisfying all primitives and the fixed cells, null if there is none,
   *  OUT_OF_BUDGET if the search gave up. */
  solve(fixed) {
    const val = new Int8Array(this.n).fill(-1);
    const trail = [];
    const queue = [], queued = new Uint8Array(this.prims.length);
    const push = j => { if (!queued[j]) { queued[j] = 1; queue.push(j); } };
    const set = (i, v) => {
      if (val[i] === v) return true;
      if (val[i] !== -1) return false;
      val[i] = v;
      trail.push(i);
      for (const j of this.byCell[i]) push(j);
      return true;
    };
    const propagate = () => {
      while (queue.length) {
        const j = queue.pop();
        queued[j] = 0;
        if (!this.check(this.prims[j], val, set)) {
          for (const k of queue) queued[k] = 0;
          queue.length = 0;
          return false;
        }
      }
      return true;
    };
    for (const [i, v] of fixed) if (!set(i, v)) return null;
    this.prims.forEach((_, j) => push(j));
    if (!propagate()) return null;

    let nodes = 0;
    const search = () => {
      let i = -1;
      for (const c of this.order) if (val[c] === -1) { i = c; break; }
      if (i === -1) return true;
      if (++nodes > BUDGET) throw OUT;
      for (const v of [0, 1]) {
        const mark = trail.length;
        if (set(i, v) && propagate() && search()) return true;
        while (trail.length > mark) val[trail.pop()] = -1;
      }
      return false;
    };
    try {
      if (!search()) return null;
    } catch (e) {
      if (e === OUT) return OUT_OF_BUDGET;
      throw e;
    }
    return Array.from(val, v => (v === 1 ? 1 : 0));
  }

  /** Is the primitive still satisfiable? Assigns cells it forces through `set`. */
  check(p, val, set) {
    switch (p.t) {
      case "card": {
        let m = 0, u = 0;
        for (const i of p.cells) { if (val[i] === 1) m++; else if (val[i] === -1) u++; }
        if (m > p.hi || m + u < p.lo) return false;
        if (u && (m === p.hi || m + u === p.lo)) {
          const v = m === p.hi ? 0 : 1;
          for (const i of p.cells) if (val[i] === -1 && !set(i, v)) return false;
        }
        return true;
      }
      case "neq": {
        let m = 0, u = 0, free = -1;
        for (const i of p.cells) { if (val[i] === 1) m++; else if (val[i] === -1) { u++; free = i; } }
        if (u === 0) return m !== p.v;
        if (u === 1) {
          if (m === p.v) return set(free, 1);
          if (m + 1 === p.v) return set(free, 0);
        }
        return true;
      }
      case "cmp": {
        const range = cells => {
          let m = 0, u = 0;
          for (const i of cells) { if (val[i] === 1) m++; else if (val[i] === -1) u++; }
          return p.s ? [m, m + u] : [cells.length - m - u, cells.length - m];
        };
        const [aLo, aHi] = range(p.a), [bLo, bHi] = range(p.b);
        // a and b are disjoint here; at the tightest point every open cell is decided
        const all = (cells, v) => cells.every(i => val[i] !== -1 || set(i, v));
        const s = p.s, o = 1 - p.s;
        if (p.op === "gt") {
          if (aHi <= bLo) return false;
          if (aHi === bLo + 1) return all(p.a, s) && all(p.b, o);
          return true;
        }
        if (aHi < bLo || bHi < aLo) return false;
        if (aHi === bLo && !(all(p.a, s) && all(p.b, o))) return false;
        if (bHi === aLo && !(all(p.b, s) && all(p.a, o))) return false;
        return true;
      }
      case "odd": {
        let c = 0, u = 0, free = -1;
        for (const i of p.cells) { if (val[i] === p.s) c++; else if (val[i] === -1) { u++; free = i; } }
        if (u === 0) return c % 2 === 1;
        if (u === 1) return set(free, c % 2 === 1 ? 1 - p.s : p.s);
        return true;
      }
      case "conn": {
        let first = -1, last = -1, open = false;
        p.cells.forEach((i, j) => {
          if (val[i] === p.s) { if (first === -1) first = j; last = j; }
          if (val[i] !== 1 - p.s) open = true;
        });
        if (first === -1) return open;
        for (let j = first + 1; j < last; j++) {
          const i = p.cells[j];
          if (val[i] === 1 - p.s) return false;
          if (val[i] === -1 && !set(i, p.s)) return false;
        }
        return true;
      }
    }
    throw new Error(p.t);
  }
}


export class Encoder {
  constructor(nCells, sat) {
    this.s = sat;
    for (let i = 0; i < nCells; i++) sat.newVar();
    this.T = this.newVar();
    this.add([this.T]);
    this.counters = new Map();
  }

  newVar() { return this.s.newVar(); }
  add(clause) { this.s.addClause(clause); }

  /** Literal 'cell i is in `state`'. */
  cell(i, state) { return state ? i + 1 : -(i + 1); }

  /** o[t] <-> (number of marked cells) >= t, for t = 0..cells.length. */
  counter(cells) {
    const key = [...cells].sort((a, b) => a - b);
    const id = key.join(",");
    if (this.counters.has(id)) return this.counters.get(id);
    const T = this.T, F = -this.T;
    let prev = [T];
    key.forEach((i, j0) => {
      const j = j0 + 1, x = i + 1, cur = [T];
      for (let t = 1; t <= j; t++) {
        const a = t < prev.length ? prev[t] : F;      // already >= t without x
        const b = prev[t - 1];                         // >= t-1 and x marked
        const c = this.newVar();
        this.add([-a, c]);
        this.add([-x, -b, c]);
        this.add([-c, a, x]);
        this.add([-c, a, b]);
        cur.push(c);
      }
      prev = cur;
    });
    this.counters.set(id, prev);
    return prev;
  }

  /** Literal 'at least k cells of `cells` are in `state`'. */
  ge(cells, state, k) {
    const n = cells.length;
    if (state === 0) return -this.ge(cells, 1, n - k + 1);   // #state0 >= k <=> not #marked >= n-k+1
    if (k <= 0) return this.T;
    if (k > n) return -this.T;
    return this.counter(cells)[k];
  }

  // constraints guarded by enable literal e
  require(e, l) { this.add([-e, l]); }
  eq(e, cells, state, k) { this.require(e, this.ge(cells, state, k)); this.require(e, -this.ge(cells, state, k + 1)); }
  neq(e, cells, state, k) { this.add([-e, -this.ge(cells, state, k), this.ge(cells, state, k + 1)]); }
  /** #a > #b. */
  gt(e, a, b, state) {
    for (let t = 0; t <= b.length; t++) this.add([-e, -this.ge(b, state, t), this.ge(a, state, t + 1)]);
  }
  same(e, a, b, state) {
    for (let t = 1; t <= Math.max(a.length, b.length); t++) {
      this.add([-e, -this.ge(b, state, t), this.ge(a, state, t)]);
      this.add([-e, -this.ge(a, state, t), this.ge(b, state, t)]);
    }
  }
  odd(e, cells, state) {
    const zs = [];
    for (let k = 1; k <= cells.length; k += 2) {
      const z = this.newVar();
      this.add([-z, this.ge(cells, state, k)]);
      this.add([-z, -this.ge(cells, state, k + 1)]);
      zs.push(z);
    }
    this.add([-e, ...zs]);
  }
}

export class Reasoner {
  constructor(grid) {
    this.n = grid.n;
    this.sat = null;                // created on the first fallback
    this.lits = new WeakMap();      // clue -> enable literal (encoded on first use)
    this.calls = 0;
    this.fallbacks = 0;
  }

  lit(clue) {
    if (!this.sat) { this.sat = new Sat(); this.enc = new Encoder(this.n, this.sat); }
    let e = this.lits.get(clue);
    if (e === undefined) {
      e = this.enc.newVar();
      clue.cnf(this.enc, e);
      this.lits.set(clue, e);
    }
    return e;
  }

  /** A solve function (fixed cells -> solution | null) for the active clues: search first, SAT if it gives up. */
  solver(active) {
    const pr = new Problem(this.n, active.flatMap(c => c.prims()));
    let useSat = false;
    return fixed => {
      this.calls++;
      if (!useSat) {
        const r = pr.solve(fixed);
        if (r !== OUT_OF_BUDGET) return r;
        useSat = true;
        this.fallbacks++;
      }
      const a = active.map(c => this.lit(c));
      for (const [i, v] of fixed) a.push(this.enc.cell(i, v));
      if (!this.sat.solve(a)) return null;
      const m = this.sat.model;
      return Array.from({ length: this.n }, (_, i) => (m[i + 1] === 1 ? 1 : 0));
    };
  }

  /** Unknown cells (optionally restricted to `cells`) whose value is the same in every
   *  solution consistent with the active clues and known cells (a Map cell -> value). */
  forced(active, known, cells = null) {
    const solve = this.solver(active);
    const fixed = [...known];
    const base = solve(fixed);
    if (!base) throw new Error("inconsistent clues");
    const todo = (cells ?? [...Array(this.n).keys()]).filter(i => !known.has(i));
    const undecided = new Set(todo);
    const out = new Map();
    for (const i of todo) {
      if (!undecided.has(i)) continue;
      const other = solve([...fixed, [i, 1 - base[i]]]);
      if (!other) out.set(i, base[i]);
      else for (const j of [...undecided]) if (other[j] !== base[j]) undecided.delete(j);
      undecided.delete(i);
    }
    return out;
  }

  /** Exactly one solution is consistent with the active clues and known cells. */
  isUnique(active, known) {
    return this.forced(active, known).size === this.n - known.size;
  }

  /** Is the given (unknown) cell forced to `value`? */
  isForced(active, known, cell, value) {
    const solve = this.solver(active);
    return solve([...known, [cell, value]]) !== null && solve([...known, [cell, 1 - value]]) === null;
  }
}

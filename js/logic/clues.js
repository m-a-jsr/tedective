// Clue templates: truth check, constraint forms (search primitives and CNF, see solver.js) and Czech text
// (port of gen/clues.py).
// A solution is an array of 0/1 per cell; 1 is the theme's marked state.

import { COL_LETTERS } from "./grid.js";
import { countPhrase, shortCount, words } from "./czech.js";

// ---------- groups ----------

export const group = (kind, cells, a = -1, b = -1, label = "") => ({ kind, cells: [...cells], a, b, label });

/** Locative phrase used as the sentence opener ('V řádku 3'). */
function loc(g, ctx, speaker = null) {
  const nm = ctx.names;
  switch (g.kind) {
    case "row": return `V řádku ${g.a + 1}`;
    case "col": return `Ve sloupci ${COL_LETTERS[g.a]}`;
    case "neigh": return speaker === g.a ? "Mezi mými sousedy" : `Mezi sousedy, které má ${nm[g.a]},`;
    case "edge": return "Na okraji mřížky";
    case "corner": return "V rozích mřížky";
    case "all": return "V celé mřížce";
    case "between": return `Mezi poli ${ctx.grid.label(g.a)} (${nm[g.a]}) a ${ctx.grid.label(g.b)} (${nm[g.b]})`;
    case "common": return `Mezi společnými sousedy, které mají ${nm[g.a]} a ${nm[g.b]},`;
    case "role": return `Ve skupině „${g.label}“`;
    case "letter": return `Mezi postavami, jejichž jméno začíná na ${g.label},`;
  }
  throw new Error(g.kind);
}

const short = g => ({ row: `v řádku ${g.a + 1}`, col: `ve sloupci ${COL_LETTERS[g.a]}` })[g.kind];

export function cnt(cells, state, sol) {
  let s = 0;
  for (const i of cells) s += sol[i];
  return state ? s : cells.length - s;
}

// ---------- primitives (fast search in solver.js) ----------
// card: lo <= #marked(cells) <= hi;  neq: #marked != v;  cmp: count_s(a) >|= count_s(b);
// odd: count_s(cells) is odd;  conn: state-s cells of the (ordered) line form one non-empty run.

function countPrim(cells, state, k, atLeast = false) {
  const n = cells.length;
  if (state) return { t: "card", cells, lo: k, hi: atLeast ? n : k };
  return { t: "card", cells, lo: atLeast ? 0 : n - k, hi: n - k };   // count of state 0 = n - #marked
}
const fixPrim = (q, state) => ({ t: "card", cells: [q], lo: state, hi: state });

// ---------- clue classes ----------

class Clue {
  prims() { return this._prims ??= this.makePrims(); }
}

export class Count extends Clue {
  constructor(g, state, k, atLeast = false) { super(); Object.assign(this, { g, state, k, atLeast }); this.kind = `count_${g.kind}`; }
  holds(sol) { const c = cnt(this.g.cells, this.state, sol); return this.atLeast ? c >= this.k : c === this.k; }
  makePrims() { return [countPrim(this.g.cells, this.state, this.k, this.atLeast)]; }
  cnf(enc, e) {
    if (this.atLeast) enc.require(e, enc.ge(this.g.cells, this.state, this.k));
    else enc.eq(e, this.g.cells, this.state, this.k);
  }
  text(ctx, speaker = null) {
    return `${loc(this.g, ctx, speaker)} ${countPhrase(words(ctx.theme, this.state), this.k, this.atLeast)}.`;
  }
  scope() { return new Set(this.g.cells); }
}

/** Person q is one of exactly k state-cells of g. */
export class NamedIn extends Clue {
  constructor(g, q, state, k) { super(); Object.assign(this, { g, q, state, k }); this.kind = "named_in"; }
  holds(sol) { return sol[this.q] === this.state && cnt(this.g.cells, this.state, sol) === this.k; }
  makePrims() { return [fixPrim(this.q, this.state), countPrim(this.g.cells, this.state, this.k)]; }
  cnf(enc, e) { enc.require(e, enc.cell(this.q, this.state)); enc.eq(e, this.g.cells, this.state, this.k); }
  text(ctx, speaker = null) {
    const w = words(ctx.theme, this.state), who = ctx.names[this.q];
    if (this.k === 1) return `${loc(this.g, ctx, speaker)} ${countPhrase(w, 1)}, a to ${who}.`;
    return `${loc(this.g, ctx, speaker)} ${countPhrase(w, this.k)} a jedním z nich je ${who}.`;
  }
  scope() { return new Set(this.g.cells); }
}

/** Exactly k state-cells in g, of which exactly m lie in line h. */
export class Intersect extends Clue {
  constructor(g, h, state, k, m) { super(); Object.assign(this, { g, h, state, k, m }); this.kind = "intersect"; }
  inter() { const hs = new Set(this.h.cells); return this.g.cells.filter(i => hs.has(i)); }
  holds(sol) { return cnt(this.g.cells, this.state, sol) === this.k && cnt(this.inter(), this.state, sol) === this.m; }
  makePrims() { return [countPrim(this.g.cells, this.state, this.k), countPrim(this.inter(), this.state, this.m)]; }
  cnf(enc, e) { enc.eq(e, this.g.cells, this.state, this.k); enc.eq(e, this.inter(), this.state, this.m); }
  text(ctx, speaker = null) {
    const w = words(ctx.theme, this.state);
    return `${loc(this.g, ctx, speaker)} ${countPhrase(w, this.k)}, z toho ${shortCount(w, this.m)} ${short(this.h)}.`;
  }
  scope() { return new Set(this.g.cells); }
}

/** Neighbour counts of p and q: p has more (gt) or the same number (eq). */
export class Compare extends Clue {
  constructor(p, q, gp, gq, state, op) { super(); Object.assign(this, { p, q, gp, gq, state, op }); this.kind = `compare_${op}`; }
  holds(sol) {
    const a = cnt(this.gp.cells, this.state, sol), b = cnt(this.gq.cells, this.state, sol);
    return this.op === "gt" ? a > b : a === b;
  }
  makePrims() { return [{ t: "cmp", a: this.gp.cells, b: this.gq.cells, s: this.state, op: this.op }]; }
  cnf(enc, e) {
    if (this.op === "gt") enc.gt(e, this.gp.cells, this.gq.cells, this.state);
    else enc.same(e, this.gp.cells, this.gq.cells, this.state);
  }
  text(ctx, speaker = null) {
    const w = words(ctx.theme, this.state), nm = ctx.names;
    if (this.op === "gt") {
      if (speaker === this.p) return `Mám mezi sousedy víc ${w.gen} než ${nm[this.q]}.`;
      if (speaker === this.q) return `${nm[this.p]} má mezi sousedy víc ${w.gen} než já.`;
      return `${nm[this.p]} má mezi sousedy víc ${w.gen} než ${nm[this.q]}.`;
    }
    if (speaker === this.p || speaker === this.q) {
      const other = speaker === this.p ? this.q : this.p;
      return `${nm[other]} a já máme mezi sousedy stejný počet ${w.gen}.`;
    }
    return `${nm[this.p]} a ${nm[this.q]} mají mezi sousedy stejný počet ${w.gen}.`;
  }
  scope() { return new Set([...this.gp.cells, ...this.gq.cells]); }
}

/** All state-cells of a line form one contiguous run (and there is at least one). */
export class Connected extends Clue {
  constructor(g, state) { super(); Object.assign(this, { g, state }); this.kind = "connected"; }
  holds(sol) {
    const hits = [];
    this.g.cells.forEach((i, j) => { if (sol[i] === this.state) hits.push(j); });
    return hits.length > 0 && hits[hits.length - 1] - hits[0] + 1 === hits.length;
  }
  makePrims() { return [{ t: "conn", cells: this.g.cells, s: this.state }]; }
  cnf(enc, e) {
    const y = this.g.cells.map(i => enc.cell(i, this.state));
    enc.add([-e, ...y]);
    for (let a = 0; a < y.length; a++)
      for (let b = a + 1; b < y.length; b++)
        for (let c = b + 1; c < y.length; c++) enc.add([-e, -y[a], -y[c], y[b]]);
  }
  text(ctx) { return `${loc(this.g, ctx)} tvoří ${words(ctx.theme, this.state).all} jeden souvislý úsek.`; }
  scope() { return new Set(this.g.cells); }
}

/** Group g has strictly more state-cells than every other group of its kind. */
export class Most extends Clue {
  constructor(g, others, state) { super(); Object.assign(this, { g, others, state }); this.kind = "most"; }
  holds(sol) { const a = cnt(this.g.cells, this.state, sol); return this.others.every(o => a > cnt(o.cells, this.state, sol)); }
  makePrims() { return this.others.map(o => ({ t: "cmp", a: this.g.cells, b: o.cells, s: this.state, op: "gt" })); }
  cnf(enc, e) { for (const o of this.others) enc.gt(e, this.g.cells, o.cells, this.state); }
  text(ctx) {
    const gen = words(ctx.theme, this.state).gen;
    if (this.g.kind === "role") return `${loc(this.g, ctx)} je víc ${gen} než v kterékoli jiné skupině.`;
    const kind = this.g.kind === "row" ? "řádku" : "sloupci";
    return `${loc(this.g, ctx)} je víc ${gen} než v kterémkoli jiném ${kind}.`;
  }
  scope() { const s = new Set(this.g.cells); for (const o of this.others) for (const i of o.cells) s.add(i); return s; }
}

/** Line g is the only line of its kind with exactly k state-cells. */
export class Only extends Clue {
  constructor(g, others, state, k) { super(); Object.assign(this, { g, others, state, k }); this.kind = "only"; }
  holds(sol) {
    return cnt(this.g.cells, this.state, sol) === this.k && this.others.every(o => cnt(o.cells, this.state, sol) !== this.k);
  }
  makePrims() {
    return [countPrim(this.g.cells, this.state, this.k),
      ...this.others.map(o => ({ t: "neq", cells: o.cells, v: this.state ? this.k : o.cells.length - this.k }))];
  }
  cnf(enc, e) {
    enc.eq(e, this.g.cells, this.state, this.k);
    for (const o of this.others) enc.neq(e, o.cells, this.state, this.k);
  }
  text(ctx) {
    const w = words(ctx.theme, this.state);
    const head = this.g.kind === "row"
      ? `Řádek ${this.g.a + 1} je jediný řádek, ve kterém`
      : `Sloupec ${COL_LETTERS[this.g.a]} je jediný sloupec, ve kterém`;
    return `${head} ${countPhrase(w, this.k)}.`;
  }
  scope() { const s = new Set(this.g.cells); for (const o of this.others) for (const i of o.cells) s.add(i); return s; }
}

export class Odd extends Clue {
  constructor(g, state) { super(); Object.assign(this, { g, state }); this.kind = "odd"; }
  holds(sol) { return cnt(this.g.cells, this.state, sol) % 2 === 1; }
  makePrims() { return [{ t: "odd", cells: this.g.cells, s: this.state }]; }
  cnf(enc, e) { enc.odd(e, this.g.cells, this.state); }
  text(ctx, speaker = null) {
    const w = words(ctx.theme, this.state);
    if (this.g.kind === "neigh") {
      if (speaker === this.g.a) return `Mám mezi sousedy lichý počet ${w.gen}.`;
      return `${ctx.names[this.g.a]} má mezi sousedy lichý počet ${w.gen}.`;
    }
    return `${loc(this.g, ctx)} je lichý počet ${w.gen}.`;
  }
  scope() { return new Set(this.g.cells); }
}

export class Is extends Clue {
  constructor(q, state) { super(); Object.assign(this, { q, state }); this.kind = "is"; }
  holds(sol) { return sol[this.q] === this.state; }
  makePrims() { return [fixPrim(this.q, this.state)]; }
  cnf(enc, e) { enc.require(e, enc.cell(this.q, this.state)); }
  text(ctx) { return `${ctx.names[this.q]} patří mezi ${words(ctx.theme, this.state).acc}.`; }
  scope() { return new Set([this.q]); }
}

/** Rebuild a clue from the machine-readable form written by gen/build_book.py (clue_dict). */
export function clueFromDict(d) {
  const G = x => group(x.kind, x.cells, x.a, x.b, x.label);
  switch (d.type) {
    case "Count": return new Count(G(d.g), d.state, d.k, d.at_least);
    case "NamedIn": return new NamedIn(G(d.g), d.q, d.state, d.k);
    case "Intersect": return new Intersect(G(d.g), G(d.h), d.state, d.k, d.m);
    case "Compare": return new Compare(d.p, d.q, G(d.gp), G(d.gq), d.state, d.op);
    case "Connected": return new Connected(G(d.g), d.state);
    case "Most": return new Most(G(d.g), d.others.map(G), d.state);
    case "Only": return new Only(G(d.g), d.others.map(G), d.state, d.k);
    case "Odd": return new Odd(G(d.g), d.state);
    case "Is": return new Is(d.q, d.state);
  }
  throw new Error(`unknown clue type ${d.type}`);
}

/** Inverse of clueFromDict (same field names as the Python build), for storing generated puzzles. */
export function clueToDict(c) {
  const G = g => ({ kind: g.kind, cells: [...g.cells], a: g.a, b: g.b, label: g.label });
  if (c instanceof Count) return { type: "Count", g: G(c.g), state: c.state, k: c.k, at_least: c.atLeast };
  if (c instanceof NamedIn) return { type: "NamedIn", g: G(c.g), q: c.q, state: c.state, k: c.k };
  if (c instanceof Intersect) return { type: "Intersect", g: G(c.g), h: G(c.h), state: c.state, k: c.k, m: c.m };
  if (c instanceof Compare) return { type: "Compare", p: c.p, q: c.q, gp: G(c.gp), gq: G(c.gq), state: c.state, op: c.op };
  if (c instanceof Connected) return { type: "Connected", g: G(c.g), state: c.state };
  if (c instanceof Most) return { type: "Most", g: G(c.g), others: c.others.map(G), state: c.state };
  if (c instanceof Only) return { type: "Only", g: G(c.g), others: c.others.map(G), state: c.state, k: c.k };
  if (c instanceof Odd) return { type: "Odd", g: G(c.g), state: c.state };
  if (c instanceof Is) return { type: "Is", q: c.q, state: c.state };
  throw new Error("unknown clue");
}

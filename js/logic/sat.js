// A small CDCL SAT solver (MiniSat style): two watched literals, first-UIP learning,
// VSIDS with a binary heap, phase saving, Luby restarts, learnt clause reduction, assumptions.
// Clauses use DIMACS-style integers (+v / -v, variables from 1) at the interface.

const lit = x => (x > 0 ? 2 * x : -2 * x + 1);   // DIMACS int -> internal literal
const neg = l => l ^ 1;
const vr = l => l >> 1;

export class Sat {
  constructor() {
    this.nVars = 0;
    this.ok = true;
    this.watches = [[], []];
    this.assign = [0];          // per var: 0 unassigned, 1 true, -1 false
    this.level = [0];
    this.reason = [null];
    this.activity = [0];
    this.phase = [0];           // saved polarity: 1 true, 0 false
    this.seen = [0];
    this.trail = [];
    this.trailLim = [];
    this.qhead = 0;
    this.varInc = 1;
    this.claInc = 1;
    this.learnts = [];
    this.maxLearnts = 4000;
    this.heap = [];
    this.heapPos = [-1];
    this.model = null;
  }

  newVar() {
    const v = ++this.nVars;
    this.watches.push([], []);
    this.assign.push(0); this.level.push(0); this.reason.push(null);
    this.activity.push(0); this.phase.push(0); this.seen.push(0); this.heapPos.push(-1);
    this.heapInsert(v);
    return v;
  }

  valueLit(l) { const a = this.assign[l >> 1]; return l & 1 ? -a : a; }

  /** Add a clause (DIMACS ints) at the root level. */
  addClause(ints) {
    if (!this.ok) return;
    if (this.trailLim.length) this.cancelUntil(0);
    const lits = [];
    for (const x of ints) {
      const l = lit(x);
      const v = this.valueLit(l);
      if (v === 1 || lits.includes(neg(l))) return;      // satisfied or tautology
      if (v === 0 && !lits.includes(l)) lits.push(l);
    }
    if (!lits.length) { this.ok = false; return; }
    if (lits.length === 1) {
      this.enqueue(lits[0], null);
      if (this.propagate()) this.ok = false;
      return;
    }
    this.attach(lits);
  }

  attach(c) {
    this.watches[c[0]].push(c);
    this.watches[c[1]].push(c);
  }

  enqueue(l, from) {
    const v = l >> 1;
    this.assign[v] = l & 1 ? -1 : 1;
    this.level[v] = this.trailLim.length;
    this.reason[v] = from;
    this.trail.push(l);
  }

  /** Unit propagation; returns a conflicting clause or null. */
  propagate() {
    while (this.qhead < this.trail.length) {
      const p = this.trail[this.qhead++];
      const falseLit = neg(p);
      const ws = this.watches[falseLit];
      let i = 0, j = 0;
      while (i < ws.length) {
        const c = ws[i++];
        if (c.deleted) continue;
        if (c[0] === falseLit) { c[0] = c[1]; c[1] = falseLit; }
        if (this.valueLit(c[0]) === 1) { ws[j++] = c; continue; }
        let moved = false;
        for (let k = 2; k < c.length; k++) {
          if (this.valueLit(c[k]) !== -1) {
            c[1] = c[k]; c[k] = falseLit;
            this.watches[c[1]].push(c);
            moved = true;
            break;
          }
        }
        if (moved) continue;
        ws[j++] = c;
        if (this.valueLit(c[0]) === -1) {
          while (i < ws.length) ws[j++] = ws[i++];
          ws.length = j;
          this.qhead = this.trail.length;
          return c;
        }
        this.enqueue(c[0], c);
      }
      ws.length = j;
    }
    return null;
  }

  analyze(confl) {
    const learnt = [0];
    let pathC = 0, p = -1, idx = this.trail.length - 1;
    const dl = this.trailLim.length;
    do {
      if (confl.learnt) this.bumpClause(confl);
      for (let k = p === -1 ? 0 : 1; k < confl.length; k++) {
        const q = confl[k], v = q >> 1;
        if (!this.seen[v] && this.level[v] > 0) {
          this.bumpVar(v);
          this.seen[v] = 1;
          if (this.level[v] >= dl) pathC++;
          else learnt.push(q);
        }
      }
      while (!this.seen[this.trail[idx] >> 1]) idx--;
      p = this.trail[idx--];
      confl = this.reason[p >> 1];
      this.seen[p >> 1] = 0;
      pathC--;
    } while (pathC > 0);
    learnt[0] = neg(p);
    let bt = 0, at = 1;
    for (let k = 1; k < learnt.length; k++) {
      const lv = this.level[learnt[k] >> 1];
      if (lv > bt) { bt = lv; at = k; }
    }
    if (learnt.length > 1) [learnt[1], learnt[at]] = [learnt[at], learnt[1]];
    for (const q of learnt) this.seen[q >> 1] = 0;
    return [learnt, bt];
  }

  cancelUntil(lv) {
    if (this.trailLim.length <= lv) return;
    const stop = this.trailLim[lv];
    for (let k = this.trail.length - 1; k >= stop; k--) {
      const v = this.trail[k] >> 1;
      this.phase[v] = this.assign[v] === 1 ? 1 : 0;
      this.assign[v] = 0;
      this.reason[v] = null;
      if (this.heapPos[v] < 0) this.heapInsert(v);
    }
    this.trail.length = stop;
    this.trailLim.length = lv;
    this.qhead = stop;
  }

  // ----- VSIDS heap -----
  bumpVar(v) {
    if ((this.activity[v] += this.varInc) > 1e100) {
      for (let k = 1; k <= this.nVars; k++) this.activity[k] *= 1e-100;
      this.varInc *= 1e-100;
    }
    if (this.heapPos[v] >= 0) this.heapUp(this.heapPos[v]);
  }
  bumpClause(c) {
    if ((c.act = (c.act || 0) + this.claInc) > 1e20) {
      for (const d of this.learnts) d.act *= 1e-20;
      this.claInc *= 1e-20;
    }
  }
  heapInsert(v) { this.heapPos[v] = this.heap.length; this.heap.push(v); this.heapUp(this.heap.length - 1); }
  heapUp(i) {
    const h = this.heap, a = this.activity, v = h[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[h[p]] >= a[v]) break;
      h[i] = h[p]; this.heapPos[h[i]] = i; i = p;
    }
    h[i] = v; this.heapPos[v] = i;
  }
  heapPop() {
    const h = this.heap, a = this.activity, top = h[0], last = h.pop();
    this.heapPos[top] = -1;
    if (h.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        if (l >= h.length) break;
        const c = r < h.length && a[h[r]] > a[h[l]] ? r : l;
        if (a[h[c]] <= a[last]) break;
        h[i] = h[c]; this.heapPos[h[i]] = i; i = c;
      }
      h[i] = last; this.heapPos[last] = i;
    }
    return top;
  }

  reduceLearnts() {
    this.learnts.sort((x, y) => (x.length <= 2) - (y.length <= 2) || x.act - y.act);
    const half = this.learnts.length >> 1;
    for (let k = 0; k < half; k++) if (this.learnts[k].length > 2) this.learnts[k].deleted = true;
    this.learnts = this.learnts.filter(c => !c.deleted);
    for (const ws of this.watches) {
      let j = 0;
      for (let i = 0; i < ws.length; i++) if (!ws[i].deleted) ws[j++] = ws[i];
      ws.length = j;
    }
  }

  /** Solve under assumptions (DIMACS ints). True when satisfiable; the model is then in this.model. */
  solve(assumptionInts = []) {
    this.model = null;
    if (!this.ok) return false;
    this.cancelUntil(0);
    if (this.propagate()) { this.ok = false; return false; }
    const assumptions = assumptionInts.map(lit);
    let restart = 0;
    for (;;) {
      const budget = 100 * luby(restart++);
      const r = this.search(budget, assumptions);
      if (r !== null) { this.cancelUntil(0); return r; }
      if (this.learnts.length > this.maxLearnts) { this.reduceLearnts(); this.maxLearnts *= 1.1; }
    }
  }

  search(budget, assumptions) {
    let conflicts = 0;
    for (;;) {
      const confl = this.propagate();
      if (confl) {
        conflicts++;
        if (this.trailLim.length === 0) { this.ok = false; return false; }
        const [learnt, bt] = this.analyze(confl);
        this.cancelUntil(bt);
        if (learnt.length === 1) this.enqueue(learnt[0], null);
        else {
          learnt.learnt = true;
          learnt.act = 0;
          this.bumpClause(learnt);
          this.attach(learnt);
          this.learnts.push(learnt);
          this.enqueue(learnt[0], learnt);
        }
        this.varInc /= 0.95;
        this.claInc /= 0.999;
        continue;
      }
      if (conflicts >= budget) { this.cancelUntil(0); return null; }
      let next = -1;
      while (this.trailLim.length < assumptions.length) {
        const a = assumptions[this.trailLim.length];
        const v = this.valueLit(a);
        if (v === 1) { this.trailLim.push(this.trail.length); continue; }   // already true: dummy level
        if (v === -1) return false;                                       // conflicts with assumptions
        next = a;
        break;
      }
      if (next === -1) {
        let v = 0;
        while (this.heap.length) {
          const c = this.heapPop();
          if (this.assign[c] === 0) { v = c; break; }
        }
        if (!v) {
          this.model = Int8Array.from(this.assign);
          return true;
        }
        next = this.phase[v] ? 2 * v : 2 * v + 1;
      }
      this.trailLim.push(this.trail.length);
      this.enqueue(next, null);
    }
  }
}

function luby(i) {
  let size = 1, seq = 0;
  while (size < i + 1) { seq++; size = 2 * size + 1; }
  let x = i;
  while (size - 1 !== x) { size = (size - 1) >> 1; seq--; x %= size; }
  return 2 ** seq;
}

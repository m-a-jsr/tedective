// State of one puzzle being played: solved cards, marks, mistakes, hints, time.
// Verdicts are checked like the original game: a move must be provable from the statements
// revealed so far (all of them together, not the bounded player of the generator).

import { Reasoner } from "../logic/solver.js";

export const VERDICT = { OK: "ok", NOT_YET: "not-yet", WRONG: "wrong" };

export class Session {
  constructor(puzzle, saved = null) {
    this.p = puzzle;
    this.r = new Reasoner(puzzle.grid);
    this.known = new Map(saved?.known ?? [[puzzle.start, puzzle.sol[puzzle.start]]]);
    this.marks = new Map(saved?.marks ?? []);          // cell -> "g" | "r"
    this.mistakes = saved?.mistakes ?? 0;
    this.hints = saved?.hints ?? [0, 0];                // uses of hint stage 1 and stage 2
    this.elapsed = saved?.elapsed ?? 0;                 // ms spent before this sitting
    this.solvedAt = saved?.solvedAt ?? null;
    // Book: puzzles continued from the paper book or marked as solved there count for XP, but their
    // time only covers the app (or nothing) and they never count for time-based challenges.
    this.fromBook = saved?.fromBook ?? false;          // continued from the paper book
    this.solvedInBook = saved?.solvedInBook ?? false;  // marked as solved in the book
    this.bookHint = saved?.bookHint ?? null;           // answer to "did you use a hint in the book?"
    this.since = Date.now();                            // null while paused
    this.history = [];                                  // undo stack: marks and cards filled in from the book
  }

  get solved() { return this.known.size === this.p.grid.n; }
  time() { return this.elapsed + (this.solvedAt || this.since == null ? 0 : Date.now() - this.since); }
  get paused() { return this.since == null; }
  pause() { if (!this.paused && !this.solvedAt) { this.elapsed = this.time(); this.since = null; } }
  resume() { if (this.paused) this.since = Date.now(); }
  /** Time-based challenges only take puzzles played start to finish in the app. */
  get timed() { return !this.fromBook; }

  /** Statements the player can read now. */
  active() {
    const st = this.p.statements;
    if (this.p.variant === "B") return [...st.values()];
    return [...this.known.keys()].filter(c => st.has(c)).map(c => st.get(c));
  }

  /** Statement cells visible now (variant B: all of them). */
  visible(cell) {
    return this.p.variant === "B" ? this.p.statements.has(cell) : this.known.has(cell) && this.p.statements.has(cell);
  }

  verdict(cell, value) {
    if (this.known.has(cell)) return null;
    const active = this.active();
    const provable = this.r.isForced(active, this.known, cell, value);
    if (provable) {
      this.known.set(cell, value);
      this.marks.delete(cell);
      this.checkSolved();
      return VERDICT.OK;
    }
    if (this.r.isForced(active, this.known, cell, 1 - value)) {
      this.mistakes++;
      return VERDICT.WRONG;
    }
    return VERDICT.NOT_YET;
  }

  cycleMark(cell) {
    const prev = this.marks.get(cell);
    const next = { undefined: "g", g: "r", r: undefined }[prev];
    if (next) this.marks.set(cell, next); else this.marks.delete(cell);
    this.history.push({ type: "mark", cell, prev });
  }

  clearMarks() {
    if (!this.marks.size) return;
    this.history.push({ type: "marks", prev: [...this.marks] });
    this.marks.clear();
  }

  /** Book continuation, step 1: reveal every card the stored solving order reaches
   *  up to and including the step that solves `cell`. */
  continueFromBook(cell, usedHint) {
    this.fromBook = true;
    this.bookHint = usedHint;
    this.elapsed = 0;                                   // time counts from here, in the app
    this.since = Date.now();
    const k = this.p.steps.findIndex(st => st.includes(cell));
    if (k < 0) return 0;
    let n = 0;
    for (const st of this.p.steps.slice(0, k + 1))
      for (const i of st) if (!this.known.has(i)) { this.known.set(i, this.p.sol[i]); this.marks.delete(i); n++; }
    this.checkSolved();
    return n;
  }

  /** Book continuation, step 2: a card already solved in the book; only checked against the solution. */
  fillFromBook(cell, value) {
    if (this.known.has(cell) || this.p.sol[cell] !== value) return false;
    this.known.set(cell, value);
    this.history.push({ type: "fill", cell, mark: this.marks.get(cell) });
    this.marks.delete(cell);
    this.checkSolved();
    return true;
  }

  markSolvedInBook(usedHint) {
    this.fromBook = true;
    this.solvedInBook = true;
    this.bookHint = usedHint;
    for (let i = 0; i < this.p.grid.n; i++) this.known.set(i, this.p.sol[i]);
    this.marks.clear();
    this.elapsed = 0;
    this.solvedAt = Date.now();
  }

  checkSolved() {
    if (this.solved && !this.solvedAt) { this.elapsed = this.time(); this.solvedAt = Date.now(); }
  }

  undo() {
    const a = this.history.pop();
    if (!a) return false;
    if (a.type === "mark") { if (a.prev) this.marks.set(a.cell, a.prev); else this.marks.delete(a.cell); }
    else if (a.type === "marks") this.marks = new Map(a.prev);
    else if (a.type === "fill") { this.known.delete(a.cell); if (a.mark) this.marks.set(a.cell, a.mark); }
    return true;
  }

  /** Easiest next deduction: the fewest revealed statements that settle some card.
   *  Returns { statementCells, cell } or null. */
  hint() {
    const st = this.p.statements;
    const cells = this.p.variant === "B" ? [...st.keys()] : [...this.known.keys()].filter(c => st.has(c));
    const scope = new Map(cells.map(c => [c, st.get(c).scope()]));
    for (let k = 1; k <= Math.min(3, cells.length); k++) {
      for (const sub of combinations(cells, k)) {
        const scopes = sub.map(c => scope.get(c));
        // statements that share no cells cannot help each other (same rule as the generator's player)
        if (k > 1 && scopes.some((s, a) => ![...s].some(i => scopes.some((t, b) => b !== a && t.has(i))))) continue;
        const open = [...new Set(scopes.flatMap(s => [...s]))].filter(i => !this.known.has(i));
        if (!open.length) continue;
        const forced = this.r.forced(sub.map(c => st.get(c)), this.known, open);
        if (forced.size) return { statementCells: sub, cell: Math.min(...forced.keys()) };
      }
    }
    const all = this.r.forced(cells.map(c => st.get(c)), this.known);
    return all.size ? { statementCells: cells, cell: Math.min(...all.keys()) } : null;
  }

  save() {
    return {
      known: [...this.known], marks: [...this.marks], mistakes: this.mistakes, hints: this.hints,
      elapsed: this.solvedAt ? this.elapsed : this.time(), solvedAt: this.solvedAt,
      fromBook: this.fromBook, solvedInBook: this.solvedInBook, bookHint: this.bookHint,
    };
  }
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield [...acc]; return; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); yield* combinations(arr, k, i + 1, acc); acc.pop(); }
}

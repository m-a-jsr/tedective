// Grid geometry: cells are indexed row-major, i = row * cols + col (port of gen/grid.py).

export const COL_LETTERS = "ABCDEFGHIJ";

export class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.n = cols * rows;
    this.neighbors = [];
    for (let i = 0; i < this.n; i++) {
      const [c, r] = this.pos(i);
      const out = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if ((dc || dr) && c + dc >= 0 && c + dc < cols && r + dr >= 0 && r + dr < rows) out.push(this.idx(c + dc, r + dr));
      this.neighbors.push(out);
    }
    this.edge = [];
    for (let i = 0; i < this.n; i++) {
      const [c, r] = this.pos(i);
      if (c === 0 || c === cols - 1 || r === 0 || r === rows - 1) this.edge.push(i);
    }
    this.corners = [...new Set([this.idx(0, 0), this.idx(cols - 1, 0), this.idx(0, rows - 1), this.idx(cols - 1, rows - 1)])]
      .sort((a, b) => a - b);
  }

  idx(c, r) { return r * this.cols + c; }
  pos(i) { return [i % this.cols, Math.floor(i / this.cols)]; }
  label(i) { const [c, r] = this.pos(i); return `${COL_LETTERS[c]}${r + 1}`; }
  cell(label) { return this.idx(COL_LETTERS.indexOf(label[0]), parseInt(label.slice(1), 10) - 1); }
  row(r) { return Array.from({ length: this.cols }, (_, c) => this.idx(c, r)); }
  col(c) { return Array.from({ length: this.rows }, (_, r) => this.idx(c, r)); }

  /** Cells strictly between a and b on a shared row or column, or null. */
  between(a, b) {
    const [ca, ra] = this.pos(a), [cb, rb] = this.pos(b);
    if (ra === rb && Math.abs(ca - cb) > 1) {
      const lo = Math.min(ca, cb), hi = Math.max(ca, cb), out = [];
      for (let c = lo + 1; c < hi; c++) out.push(this.idx(c, ra));
      return out;
    }
    if (ca === cb && Math.abs(ra - rb) > 1) {
      const lo = Math.min(ra, rb), hi = Math.max(ra, rb), out = [];
      for (let r = lo + 1; r < hi; r++) out.push(this.idx(ca, r));
      return out;
    }
    return null;
  }

  commonNeighbors(a, b) {
    const nb = new Set(this.neighbors[b]);
    return this.neighbors[a].filter(i => nb.has(i) && i !== a && i !== b).sort((x, y) => x - y);
  }
}

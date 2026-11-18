// Content of the app: book puzzles, cast and general quotes.
// Downloaded from the private GitHub repository (during development: ../data/ next to the app),
// kept in the device for offline play and turned into ready-to-play puzzle objects.

import { clueFromDict } from "../logic/clues.js";
import { THEMES, shownName, themeOf } from "../logic/czech.js";
import { Grid } from "../logic/grid.js";
import { decode } from "./codec.js";
import * as gh from "./github.js";
import * as store from "./store.js";

export const SECTIONS = [
  { key: "vyuka", title: "Výuka", icon: "school" },
  { key: "mastny", title: "Mastný, nebo čistý?", icon: "droplet" },
  { key: "liny", title: "Líný, nebo akční?", icon: "bolt" },
  { key: "pavouk", title: "Skrytý pavouk, nebo v duši kůzle?", icon: "spider" },
  { key: "finale", title: "Finále", icon: "trophy" },
];

const SECTION_TIER = { vyuka: "intro", mastny: "veryhard", liny: "veryhard", pavouk: "hard", finale: "max" };

/** A ready-to-play puzzle from a book record. */
export function bookPuzzle(rec) {
  const grid = new Grid(rec.cols, rec.rows);
  const names = rec.cells.map(c => c.name);
  const statements = new Map();
  rec.cells.forEach((c, i) => { if (c.clue) statements.set(i, clueFromDict(c.clue)); });
  return {
    id: `kniha-${rec.no}`,
    no: rec.no,
    book: true,
    title: `č. ${rec.no}`,
    section: rec.section,
    theme: THEMES[rec.theme],
    variant: rec.variant,
    tier: SECTION_TIER[rec.section],
    grid,
    names,
    ctx: { grid, names: names.map(shownName), theme: THEMES[rec.theme] },
    roles: rec.cells.map(c => c.role),
    sol: rec.solution,
    start: grid.cell(rec.start),
    star: rec.star ? grid.cell(rec.star) : null,
    number: rec.number ?? null,
    statements,
    texts: rec.cells.map(c => c.statement),
    quotes: rec.cells.map(c => c.quote),
    steps: rec.steps.map(s => s.map(l => grid.cell(l))),
    levels: rec.levels,
  };
}

/** A ready-to-play puzzle from a generated record (generated/<id>, see ui/generator.js). */
export function generatedPuzzle(rec) {
  const grid = new Grid(rec.cols, rec.rows);
  const theme = themeOf(rec.theme);
  const ctx = { grid, names: rec.names.map(shownName), theme };
  const statements = new Map(rec.clues.map(([cell, d]) => [cell, clueFromDict(d)]));
  return {
    id: rec.id, no: null, book: false, title: rec.title, section: null, theme, variant: rec.variant, tier: rec.tier,
    grid, names: rec.names, ctx, roles: rec.roles, sol: rec.sol, start: rec.start, star: rec.star, number: null,
    statements, texts: rec.names.map((_, i) => statements.get(i)?.text(ctx, i) ?? null), quotes: rec.quotes,
    steps: rec.steps, levels: rec.levels, created: rec.created, code: rec.code, score: rec.score, num: rec.num, daily: rec.daily ?? null,
  };
}

const FILES = ["kniha.dat", "postavy.dat", "hlasky.dat", "fotky.dat"];
/** Development: served from localhost with the data folder next to the app. */
export const DEV = ["localhost", "127.0.0.1"].includes(location.hostname);

/** Raw content { version, files: { name: text } }: from the private repository when a token is set
 *  (downloaded only when its version changed), else the copy kept in the device, else (development)
 *  the local data folder. null if there is none: the app then asks for the token. */
export async function obtainContent({ refresh = true } = {}) {
  const token = await store.getCfg("token");
  const cached = await store.get("cache/content");
  if (token && refresh) {
    try {
      const manifest = JSON.parse(await gh.readText(token, "content/manifest.json"));
      if (cached?.version === manifest.version) return cached;
      const files = {};
      for (const f of FILES) files[f] = await gh.readText(token, `content/${f}`);
      const raw = { version: manifest.version, files };
      await store.putRaw("cache/content", raw);
      return raw;
    } catch (e) {
      if (cached && e.status !== 401 && e.status !== 403) return cached;   // offline: play from the device
      throw e;
    }
  }
  if (cached) return cached;
  if (DEV) {
    const get = async name => {
      const r = await fetch("../data/" + name, { cache: "no-cache" });
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      return r.text();
    };
    const manifest = JSON.parse(await get("manifest.json"));
    const files = {};
    for (const f of FILES) files[f] = await get(f);
    return { version: manifest.version, files };
  }
  return null;
}

/** Ready-to-play content from the raw files. */
export function parseContent(raw) {
  const [kniha, postavy, hlasky, fotky] = FILES.map(f => (raw.files[f] ? decode(raw.files[f]) : {}));
  const photos = new Map(Object.entries(fotky).map(([name, b64]) => [name, `data:image/jpeg;base64,${b64}`]));
  return { version: raw.version, puzzles: kniha.map(bookPuzzle), cast: postavy, quotes: hlasky, photos };
}

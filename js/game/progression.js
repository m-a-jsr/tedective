// XP, levels and challenges (plan, chapters 5 and 6).
//
// XP and completed challenges must survive a puzzle reset, so they live in append-only records:
//   xp/<profile>/<id>    one per solved puzzle or rewarded challenge (the solve history)
//   done/<profile>/<id>  one per completed challenge
// Everything else (level, statistics, which rewards are unlocked) is derived from these and the progress.

// ---------- XP ----------

const BOOK_BASE = { vyuka: 10, mastny: 30, liny: 50, pavouk: 60, finale: 120 };
const GEN_BASE = {
  "3x3": { intro: 10, mid: 10, hard: 10 },
  "4x5": { intro: 20, mid: 30, hard: 50 },
  "5x6": { intro: 35, mid: 45, hard: 60 },
  "6x9": { intro: 70, mid: 90, hard: 120 },
};
export const REPLAY_SHARE = 0.25;

export const sizeOf = p => `${p.grid.cols}x${p.grid.rows}`;
export const baseXp = p => (p.book ? BOOK_BASE[p.section] : GEN_BASE[sizeOf(p)]?.[p.tier] ?? 30);

/** Hints for XP and "without hint" challenges: the app's two stages, plus "yes" to the book question as one stage-1 hint. */
const hintCount = r => (r.hints?.[0] ?? 0) + (r.hints?.[1] ?? 0) + (r.bookHint ? 1 : 0);

export function solveXp(p, r, replay) {
  const mistakes = Math.max(0.3, 1 - 0.1 * (r.mistakes ?? 0));
  const hints = Math.max(0.3, 1 - 0.1 * ((r.hints?.[0] ?? 0) + (r.bookHint ? 1 : 0)) - 0.2 * (r.hints?.[1] ?? 0));
  const bonus = !r.mistakes && !hintCount(r) ? 1.2 : 1;
  return Math.round(baseXp(p) * mistakes * hints * bonus * (replay ? REPLAY_SHARE : 1));
}

/** Total XP needed to reach level L: 20·L·(L−1) up to 20, then 600 per level. */
export function xpForLevel(L) {
  return L <= 20 ? 20 * L * (L - 1) : 7600 + 600 * (L - 20);
}

export function levelOf(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  return { level: L, xp, from: xpForLevel(L), to: xpForLevel(L + 1) };
}

/** History event for a puzzle that just became solved. */
export function solveEvent(p, r, replay) {
  return {
    kind: "solve", puzzle: p.id, book: !!p.book, section: p.section ?? null, size: sizeOf(p), variant: p.variant,
    tier: p.tier, mistakes: r.mistakes ?? 0, hints: r.hints ?? [0, 0], bookHint: !!r.bookHint,
    fromBook: !!r.fromBook, solvedInBook: !!r.solvedInBook, time: r.solvedInBook ? null : r.elapsed ?? null,
    timed: !r.fromBook, replay, base: baseXp(p), xp: solveXp(p, r, replay), at: r.solvedAt ?? Date.now(),
  };
}

// ---------- categories, level rewards ----------

/** The 10 look categories in the order the levels open them (category i opens at level i + 1). */
export const CATEGORIES = [
  { key: "ramecek-fotky", title: "Rámeček fotky", theme: "sbírka hlášek", first: "čtverec", big: "polaroid + rámeček v barvě skupiny" },
  { key: "barvy", title: "Barvy stavů", theme: "bez chyb", first: "pastelová", big: "vlastní barvy pro oba stavy" },
  { key: "pismo", title: "Písmo", theme: "tempo", first: "zaoblené", big: "slavnostní písmo + volba velikosti a řezu" },
  { key: "zvuky", title: "Zvuky", theme: "bez nápovědy", first: "jemné cvaknutí", big: "zvuková kulisa louky" },
  { key: "rub", title: "Rub karty", theme: "sekce knihy", first: "proužky", big: "rub s vlastní fotkou" },
  { key: "tvar", title: "Tvar karet", theme: "varianta B", first: "ostré rohy", big: "vlastní tvar (zaoblení a poměr stran)" },
  { key: "animace", title: "Animace otočení", theme: "vytrvalost", first: "3D otočení", big: "z otočené karty vyroste luční kvítí" },
  { key: "pozadi-hry", title: "Pozadí hry", theme: "velké mřížky", first: "D1 (kreslená s kopretinami)", big: "pozadí podle denní doby" },
  { key: "pozadi-menu", title: "Pozadí menu", theme: "postup knihou", first: "M10 (kopretiny)", big: "živé pozadí menu (motýli)" },
  { key: "ramecky", title: "Rámečky karet", theme: "mistrovství", first: "dvojitý", big: "rámeček z kvítí, který roste" },
];
export const CHALLENGES_FROM = 5;     // the Challenges tab opens here; until 10 only the first challenge per category
export const ALL_CHALLENGES_FROM = 10;
export const GENERATOR_LEVEL = 17;
export const EMBLEM_LEVEL = 20;

/** Big level rewards (milestones); categories add one each up to level 10. */
export function levelRewards() {
  const out = CATEGORIES.map((c, i) => ({ level: i + 1, text: `kategorie ${c.title} + ${c.first}` }));
  out.push({ level: 5, text: "záložka Výzvy" });
  out.push({ level: 10, text: "bronzový okraj karet, aktivní všechny výzvy" });
  out.push({ level: 15, text: "vlastní pozadí (vlastní fotka do menu i hry)" });
  out.push({ level: 17, text: "tvorba vlastních hádanek a úpravy postav" });
  out.push({ level: 20, text: "emblém levelu, stříbrný okraj karet" });
  out.push({ level: 50, text: "zlatý okraj karet" });
  out.push({ level: 100, text: "diamantový okraj karet" });
  return out.sort((a, b) => a.level - b.level);
}

/** Levels that bring a new emblem colour or emblem font colour (from 21 on). */
export const emblemColourLevel = L =>
  L > 20 && (L <= 30 || (L <= 50 && L % 2 === 0) || (L <= 100 && L % 5 === 0) || (L > 100 && L % 10 === 0));

// ---------- challenges ----------

const clean = e => !e.solvedInBook && !e.mistakes;           // mistakes made in the paper book are unknown
const noHint = e => !hintCount(e);
const recClean = r => r?.solvedAt && !r.solvedInBook && !r.mistakes;
const recNoHint = r => r?.solvedAt && !hintCount(r);

/** Longest run of solves meeting `pred` (solves marked as done in the book neither extend nor break it). */
function bestRun(solves, pred, skip = e => e.solvedInBook) {
  let run = 0, best = 0;
  for (const e of solves) {
    if (skip(e)) continue;
    run = pred(e) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function bestDayRun(solves) {
  const days = [...new Set(solves.map(e => { const d = new Date(e.at); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }))].sort((a, b) => a - b);
  let run = 0, best = 0, prev = null;
  for (const d of days) { run = prev !== null && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

const count = (n, need) => ({ done: n >= need, have: Math.min(n, need), need });
const distinct = (solves, pred) => new Set(solves.filter(pred).map(e => e.puzzle)).size;

/** Section state from the current progress: { all solved, all clean, all without hints }. */
function section(ctx, key) {
  const ps = ctx.book.filter(p => p.section === key);
  const rs = ps.map(p => ctx.progress[p.id]);
  const solved = rs.filter(r => r?.solvedAt).length;
  return { n: ps.length, solved, clean: rs.filter(recClean).length, noHint: rs.filter(recNoHint).length };
}

/** Definitions: id, category key (or "obecne"), text, reward, check(ctx) -> { done, have, need }. */
export const CHALLENGES = [
  // Rámeček fotky – sbírka hlášek
  { id: "f1", cat: "ramecek-fotky", text: "Odemkni 25 hlášek ve sbírce", reward: "srdíčko", check: c => count(c.quotesSeen, 25) },
  { id: "f2", cat: "ramecek-fotky", text: "Odemkni všechny hlášky jedné skupiny", reward: "hvězda", check: c => count(c.bestGroup.have, c.bestGroup.need) },
  { id: "f3", cat: "ramecek-fotky", text: "Odemkni 100 hlášek", reward: "věneček z kvítí", check: c => count(c.quotesSeen, 100) },
  { id: "f4", cat: "ramecek-fotky", text: "Potkej každou postavu aspoň jednou", reward: "šestiúhelník", check: c => count(c.met, c.castSize) },
  // Barvy stavů – bez chyb
  { id: "b1", cat: "barvy", text: "3 hádanky po sobě bez chyby", reward: "luční", check: c => count(bestRun(c.solves, clean), 3) },
  { id: "b2", cat: "barvy", text: "Hádanka varianty B bez chyby", reward: "vysoký kontrast", check: c => count(distinct(c.solves, e => e.variant === "B" && clean(e)), 1) },
  { id: "b3", cat: "barvy", text: "10 hádanek po sobě bez chyby", reward: "noční", check: c => count(bestRun(c.solves, clean), 10) },
  { id: "b4", cat: "barvy", text: "Celá sekce knihy bez jediné chyby", reward: "podzimní",
    check: c => { const best = Math.max(...["mastny", "liny", "pavouk", "finale"].map(k => { const s = section(c, k); return s.clean / s.n; })); return { done: best === 1, have: Math.round(best * 100), need: 100, unit: "%" }; } },
  // Písmo – tempo (only puzzles played start to finish in the app)
  { id: "p1", cat: "pismo", text: "Vyřeš 3 hádanky za jeden den", reward: "knižní patkové",
    check: c => { const per = {}; c.solves.filter(e => !e.solvedInBook).forEach(e => { per[dayKey(e.at)] = (per[dayKey(e.at)] ?? 0) + 1; }); return count(Math.max(0, ...Object.values(per)), 3); } },
  { id: "p2", cat: "pismo", text: "Hádanka 4×5 do 10 minut", reward: "psací stroj", check: c => count(distinct(c.solves, e => e.timed && e.size === "4x5" && e.time <= 600000), 1) },
  { id: "p3", cat: "pismo", text: "Hádanka 5×6 do 20 minut", reward: "ručně psané", check: c => count(distinct(c.solves, e => e.timed && e.size === "5x6" && e.time <= 1200000), 1) },
  { id: "p4", cat: "pismo", text: "Hádanka 6×9 do 60 minut", reward: "kaligrafické", check: c => count(distinct(c.solves, e => e.timed && e.size === "6x9" && e.time <= 3600000), 1) },
  // Zvuky – bez nápovědy
  { id: "z1", cat: "zvuky", text: "5 hádanek po sobě bez nápovědy", reward: "jemné tóny", check: c => count(bestRun(c.solves, noHint, () => false), 5) },
  { id: "z2", cat: "zvuky", text: "Sekce Mastný, nebo čistý? bez nápovědy", reward: "bublinky", check: c => { const s = section(c, "mastny"); return count(s.noHint, s.n); } },
  { id: "z3", cat: "zvuky", text: "Sekce Líný, nebo akční? bez nápovědy", reward: "xylofon", check: c => { const s = section(c, "liny"); return count(s.noHint, s.n); } },
  { id: "z4", cat: "zvuky", text: "Výuka a Mastný, nebo čistý? bez nápovědy", reward: "mečení kůzlete",
    check: c => { const a = section(c, "vyuka"), b = section(c, "mastny"); return count(a.noHint + b.noHint, a.n + b.n); } },
  // Rub karty – sekce knihy
  { id: "r1", cat: "rub", text: "Dokonči sekci Mastný, nebo čistý?", reward: "kytičky", check: c => { const s = section(c, "mastny"); return count(s.solved, s.n); } },
  { id: "r2", cat: "rub", text: "Dokonči sekci Líný, nebo akční?", reward: "blesky", check: c => { const s = section(c, "liny"); return count(s.solved, s.n); } },
  { id: "r3", cat: "rub", text: "Dokonči sekci Skrytý pavouk, nebo v duši kůzle?", reward: "pavučina", check: c => { const s = section(c, "pavouk"); return count(s.solved, s.n); } },
  { id: "r4", cat: "rub", text: "Dokonči finále", reward: "kůzlátka", check: c => { const s = section(c, "finale"); return count(s.solved, s.n); } },
  // Tvar karet – varianta B
  { id: "t1", cat: "tvar", text: "Vyřeš 1 hádanku varianty B", reward: "výrazně kulaté", check: c => count(distinct(c.solves, e => e.variant === "B"), 1) },
  { id: "t2", cat: "tvar", text: "Vyřeš 3 hádanky varianty B", reward: "zkosené rohy", check: c => count(distinct(c.solves, e => e.variant === "B"), 3) },
  { id: "t3", cat: "tvar", text: "3 hádanky varianty B bez chyby", reward: "okénko", check: c => count(distinct(c.solves, e => e.variant === "B" && clean(e)), 3) },
  { id: "t4", cat: "tvar", text: "Všech 5 knižních hádanek varianty B", reward: "polaroid",
    check: c => { const bs = c.book.filter(p => p.variant === "B"); return count(bs.filter(p => c.progress[p.id]?.solvedAt).length, bs.length); } },
  // Animace otočení – vytrvalost
  { id: "a1", cat: "animace", text: "Vyřeš 20 hádanek", reward: "rychlé otočení", check: c => count(c.solves.length, 20) },
  { id: "a2", cat: "animace", text: "3 dny po sobě aspoň jedna hádanka", reward: "otočení přes střed", check: c => count(bestDayRun(c.solves), 3) },
  { id: "a3", cat: "animace", text: "7 dní po sobě aspoň jedna hádanka", reward: "rozpad na lístky", check: c => count(bestDayRun(c.solves), 7) },
  { id: "a4", cat: "animace", text: "Vyřeš 50 hádanek", reward: "konfety po vyřešení", check: c => count(c.solves.length, 50) },
  // Pozadí hry – velké mřížky
  { id: "h1", cat: "pozadi-hry", text: "Vyřeš 5 hádanek 5×6", reward: "H1 + H2 (zelené louky)", check: c => count(c.solves.filter(e => e.size === "5x6").length, 5) },
  { id: "h2", cat: "pozadi-hry", text: "Vyřeš 10 hádanek 5×6 bez nápovědy", reward: "H3 + H4", check: c => count(c.solves.filter(e => e.size === "5x6" && noHint(e)).length, 10) },
  { id: "h3", cat: "pozadi-hry", text: "Vyřeš 1 hádanku 6×9", reward: "H5 (rozostřené kvítí)", check: c => count(c.solves.filter(e => e.size === "6x9").length, 1) },
  { id: "h4", cat: "pozadi-hry", text: "Hádanka 6×9 bez chyby", reward: "H6 + D2", check: c => count(c.solves.filter(e => e.size === "6x9" && clean(e)).length, 1) },
  // Pozadí menu – postup knihou
  ...[[1, 25, "kůzlátka K1–K4"], [2, 50, "M1 + M8 (louky s oblohou)"], [3, 75, "M2 + M3 + M4 (máky a chrpy)"], [4, 100, "M5 + M6 + M7 (pestré směsi)"]]
    .map(([i, n, reward]) => ({ id: `m${i}`, cat: "pozadi-menu", text: n === 100 ? "Všech 100 knižních hádanek" : `${n} knižních hádanek`, reward,
      check: c => count(distinct(c.solves, e => e.book), n) })),
  // Rámečky karet – mistrovství
  { id: "k1", cat: "ramecky", text: "Velmi těžká 4×5 bez chyby a bez nápovědy", reward: "tečkovaný",
    check: c => count(c.solves.filter(e => e.size === "4x5" && (e.section === "liny" || (!e.book && e.tier === "hard")) && clean(e) && noHint(e)).length, 1) },
  { id: "k2", cat: "ramecky", text: "Hádanka 5×6 bez chyby a bez nápovědy", reward: "květinový ornament", check: c => count(c.solves.filter(e => e.size === "5x6" && clean(e) && noHint(e)).length, 1) },
  { id: "k3", cat: "ramecky", text: "Vyřeš 3 hádanky z finále", reward: "krajkový", check: c => count(distinct(c.solves, e => e.section === "finale"), 3) },
  { id: "k4", cat: "ramecky", text: "Hádanka 6×9 bez chyby a bez nápovědy", reward: "vyšívaný", check: c => count(c.solves.filter(e => e.size === "6x9" && clean(e) && noHint(e)).length, 1) },
  // Obecné – XP only
  { id: "o1", cat: "obecne", text: "Vyřeš první hádanku", reward: "+20 XP", xp: 20, check: c => count(c.solves.length, 1) },
  { id: "o2", cat: "obecne", text: "Pokračuj v hádance z knihy", reward: "+20 XP", xp: 20, check: c => count(c.solves.filter(e => e.fromBook && !e.solvedInBook).length, 1) },
  { id: "o3", cat: "obecne", text: "Vyřeš první vlastní vygenerovanou hádanku", reward: "+50 XP", xp: 50, check: c => count(c.solves.filter(e => !e.book).length, 1) },
  { id: "o4", cat: "obecne", text: "Splň všechny výzvy všech kategorií", reward: "+500 XP a titul u emblému", xp: 500,
    check: c => count(CHALLENGES.filter(x => x.cat !== "obecne" && c.done.has(x.id)).length, CHALLENGES.filter(x => x.cat !== "obecne").length) },
];

/** Is the challenge active at this level? General ones always; category ones from 5 (first only) and all from 10. */
export function isActive(ch, level) {
  if (ch.cat === "obecne") return true;
  const ci = CATEGORIES.findIndex(c => c.key === ch.cat);
  if (level < CHALLENGES_FROM || level < ci + 1) return false;
  return level >= ALL_CHALLENGES_FROM || CHALLENGES.filter(x => x.cat === ch.cat)[0] === ch;
}

/** Why a challenge is not active yet, in words. */
export function lockReason(ch) {
  const ci = CATEGORIES.findIndex(c => c.key === ch.cat);
  const first = CHALLENGES.filter(x => x.cat === ch.cat)[0] === ch;
  return `od levelu ${first ? Math.max(CHALLENGES_FROM, ci + 1) : ALL_CHALLENGES_FROM}`;
}

export const categoryComplete = (key, done) => CHALLENGES.filter(x => x.cat === key).every(x => done.has(x.id));

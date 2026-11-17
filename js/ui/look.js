// Look (plan, chapters 4 and 6): the options of the 10 categories, when they unlock, and applying the
// chosen ones. The choice is a synced record look/<profile>; own pictures (backgrounds, card back) stay
// in the device only (cache/), they are too big to sync through GitHub comfortably.

import { CATEGORIES, EMBLEM_LEVEL, categoryComplete, emblemColourLevel } from "../game/progression.js";
import * as store from "../data/store.js";

const D = { type: "default" }, L = level => ({ type: "level", level }), C = id => ({ type: "challenge", id }), BIG = { type: "big" };

/** Options per category: id, label, unlock rule. The first is the default, the second comes with the category's level. */
export const LOOK = {
  "ramecek-fotky": [["kruh", "kruh", D], ["ctverec", "čtverec", L(1)], ["srdicko", "srdíčko", C("f1")], ["hvezda", "hvězda", C("f2")],
    ["venecek", "věneček z kvítí", C("f3")], ["sestiuhelnik", "šestiúhelník", C("f4")], ["polaroid", "polaroid v barvě skupiny", BIG]],
  barvy: [["vychozi", "výchozí", D], ["pastel", "pastelová", L(2)], ["lucni", "luční", C("b1")], ["kontrast", "vysoký kontrast", C("b2")],
    ["nocni", "noční", C("b3")], ["podzim", "podzimní", C("b4")], ["vlastni", "vlastní barvy", BIG]],
  pismo: [["vychozi", "výchozí", D], ["zaoblene", "zaoblené", L(3)], ["patkove", "knižní patkové", C("p1")], ["stroj", "psací stroj", C("p2")],
    ["rucni", "ručně psané", C("p3")], ["kaligraf", "kaligrafické", C("p4")], ["slavnostni", "slavnostní + velikost a řez", BIG]],
  zvuky: [["ticho", "ticho", D], ["cvak", "jemné cvaknutí", L(4)], ["tony", "jemné tóny", C("z1")], ["bubliny", "bublinky", C("z2")],
    ["xylofon", "xylofon", C("z3")], ["koza", "mečení kůzlete", C("z4")], ["louka", "kulisa louky", BIG]],
  rub: [["hladky", "hladký", D], ["prouzky", "proužky", L(5)], ["kyticky", "kytičky", C("r1")], ["blesky", "blesky", C("r2")],
    ["pavucina", "pavučina", C("r3")], ["kuzlata", "kůzlátka", C("r4")], ["foto", "vlastní fotka", BIG]],
  tvar: [["vychozi", "zaoblené rohy", D], ["ostre", "ostré rohy", L(6)], ["kulate", "výrazně kulaté", C("t1")], ["zkosene", "zkosené rohy", C("t2")],
    ["okenko", "okénko", C("t3")], ["polaroid", "polaroid", C("t4")], ["vlastni", "vlastní tvar", BIG]],
  animace: [["vychozi", "otočení", D], ["3d", "3D otočení", L(7)], ["rychle", "rychlé otočení", C("a1")], ["stred", "přes střed", C("a2")],
    ["listky", "rozpad na lístky", C("a3")], ["konfety", "konfety po vyřešení", C("a4")], ["kviti", "vyroste kvítí", BIG]],
  "pozadi-hry": [["D0", "kreslená louka", D], ["D1", "kreslená s kopretinami", L(8)], ["H1", "zelená louka", C("h1")], ["H2", "zelená louka 2", C("h1")],
    ["H3", "tráva zblízka", C("h2")], ["H4", "louka se stromy", C("h2")], ["H5", "rozostřené kvítí", C("h3")], ["H6", "bílé kvítí", C("h4")],
    ["D2", "kreslená pestrá", C("h4")], ["doba", "podle denní doby", BIG], ["vlastni", "vlastní fotka", L(15)]],
  "pozadi-menu": [["M9", "kopretiny ve zlaté trávě", D], ["M10", "kopretiny", L(9)], ["K1", "kůzlátka 1", C("m1")], ["K2", "kůzlátka 2", C("m1")],
    ["K3", "kůzlátka 3", C("m1")], ["K4", "kůzlátka 4", C("m1")], ["M1", "louka s oblohou", C("m2")], ["M8", "louka s oblohou 2", C("m2")],
    ["M2", "máky", C("m3")], ["M3", "chrpy", C("m3")], ["M4", "máky a chrpy", C("m3")], ["M5", "luční směs", C("m4")], ["M6", "luční směs 2", C("m4")],
    ["M7", "luční směs 3", C("m4")], ["zive", "živé (motýli)", BIG], ["vlastni", "vlastní fotka", L(15)]],
  ramecky: [["zadny", "žádný", D], ["dvojity", "dvojitý", L(10)], ["teckovany", "tečkovaný", C("k1")], ["ornament", "květinový ornament", C("k2")],
    ["krajka", "krajkový", C("k3")], ["vysivany", "vyšívaný", C("k4")], ["kviti", "z kvítí, roste", BIG]],
};
for (const k of Object.keys(LOOK)) LOOK[k] = LOOK[k].map(([id, label, unlock]) => ({ id, label, unlock }));

/** Special card edges from big level milestones; they combine with any frame. */
export const EDGES = [["zadny", "žádný", 0], ["bronz", "bronzový", 10], ["stribro", "stříbrný", 20], ["zlato", "zlatý", 50], ["diamant", "diamantový", 100]]
  .map(([id, label, level]) => ({ id, label, level }));

/** Pause pictures: every unlocked game background, and the kids from the moment the game-background category opens. */
export const PAUSE_EXTRA = ["K1", "K2", "K3", "K4"];

/** Emblem colours (background) and font colours: the default pair, then one new colour per emblem level from 21 on, alternating. */
const EMBLEM_BG = [["zlata", "#d9a93a"], ["mata", "#5dcaa5"], ["nebe", "#6aa9d8"], ["levandule", "#a68bd6"], ["vlcimak", "#e06b58"],
  ["cerna", "#2b2b2b"], ["ruzova", "#e690b8"], ["louka", "#7fae5a"], ["med", "#e8a33a"], ["stribrna", "#b9c2c9"], ["pulnoc", "#283a6b"],
  ["korala", "#f0997b"], ["mech", "#4f6b3a"], ["perlet", "#efe7da"], ["tyrkys", "#2fb3b3"], ["visen", "#8e2a3c"]];
const EMBLEM_FG = [["hneda", "#4a3200"], ["bila", "#ffffff"], ["cerna", "#111111"], ["tmavomodra", "#1d2c55"], ["zlata", "#f5d06b"],
  ["tmavozelena", "#173d2a"], ["vinova", "#5a1530"], ["seda", "#555555"], ["kremova", "#fff6d0"], ["fialova", "#3d1f63"]];

/** Unlocked emblem colours for a level: [bgList, fgList] of { id, label, colour }. */
export function emblemColours(level) {
  const bg = [EMBLEM_BG[0]], fg = [EMBLEM_FG[0]];
  let turn = 0;
  for (let L = 21; L <= level; L++) {
    if (!emblemColourLevel(L)) continue;
    const list = turn % 2 === 0 ? [EMBLEM_BG, bg] : [EMBLEM_FG, fg];
    const [all, have] = list;
    if (have.length < all.length) have.push(all[have.length]);
    turn++;
  }
  const map = l => l.map(([id, colour]) => ({ id, colour }));
  return [map(bg), map(fg)];
}

/** Is an option open for this profile? Returns { open, why } (why: text of the condition when locked). */
export function optionState(app, catKey, opt) {
  const ci = CATEGORIES.findIndex(c => c.key === catKey);
  const level = app.level.level;
  if (level < ci + 1) return { open: false, why: `Level ${ci + 1}` };
  const u = opt.unlock;
  if (u.type === "default") return { open: true };
  if (u.type === "level") return level >= u.level ? { open: true } : { open: false, why: `Level ${u.level}` };
  if (u.type === "challenge") return app.done.has(u.id) ? { open: true } : { open: false, why: "Výzva", challenge: u.id };
  if (u.type === "big") return categoryComplete(catKey, app.done) ? { open: true } : { open: false, why: "Všechny výzvy kategorie" };
  return { open: false, why: "" };
}

// ---------- applying ----------

// absolute address: a relative url() inside a CSS variable would resolve against the stylesheet that uses it
const BG = id => `url("${new URL(`img/pozadi/${id}.${id.startsWith("D") ? "svg" : "jpg"}`, document.baseURI).href}")`;
const DAYTIME = h => (h < 9 ? "H2" : h < 17 ? "H1" : h < 21 ? "H5" : "D2");   // morning, day, evening, night

/** Chosen look of the profile with defaults filled in. */
export function chosen(app) {
  const look = app.look ?? {};
  const out = {};
  for (const [cat, opts] of Object.entries(LOOK)) {
    const pick = opts.find(o => o.id === look[cat]);
    out[cat] = pick && optionState(app, cat, pick).open ? pick.id : opts[0].id;
  }
  out.edge = EDGES.find(e => e.id === look.edge && app.level.level >= e.level)?.id ?? "zadny";
  out.pause = look.pause ?? "D0";
  out.emblemBg = look.emblemBg ?? "zlata";
  out.emblemFg = look.emblemFg ?? "hneda";
  out.custom = look.custom ?? {};
  return out;
}

let daytimeTimer = null;

/** Put the chosen look on the page: data attributes and CSS variables on <html>. */
export async function applyLook(app) {
  const c = chosen(app);
  const root = document.documentElement;
  for (const cat of Object.keys(LOOK)) root.dataset[`look${cat.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase())}`] = c[cat];
  root.dataset.edge = c.edge;
  const set = (k, v) => (v == null ? root.style.removeProperty(k) : root.style.setProperty(k, v));

  // own colours and own card shape (big rewards)
  const cu = c.custom;
  set("--good", c.barvy === "vlastni" ? cu.good ?? null : null);
  set("--good-line", c.barvy === "vlastni" ? cu.goodLine ?? null : null);
  set("--bad", c.barvy === "vlastni" ? cu.bad ?? null : null);
  set("--bad-line", c.barvy === "vlastni" ? cu.badLine ?? null : null);
  set("--card-radius", c.tvar === "vlastni" ? `${cu.radius ?? 10}px` : null);
  set("--card-ratio", c.tvar === "vlastni" ? `${cu.ratio ?? 1}` : null);
  set("--font-scale", c.pismo === "slavnostni" ? `${cu.fontScale ?? 1}` : null);
  set("--font-weight", c.pismo === "slavnostni" ? `${cu.fontWeight ?? 400}` : null);

  // backgrounds; own photos come from the device
  const ownGame = c["pozadi-hry"] === "vlastni" ? await store.get("cache/look/pozadi-hry") : null;
  const ownMenu = c["pozadi-menu"] === "vlastni" ? await store.get("cache/look/pozadi-menu") : null;
  const ownBack = c.rub === "foto" ? await store.get("cache/look/rub") : null;
  const gameId = c["pozadi-hry"] === "doba" ? DAYTIME(new Date().getHours()) : c["pozadi-hry"];
  set("--game-bg", ownGame ? `url("${ownGame.data}")` : gameId === "vlastni" ? null : BG(gameId));
  set("--menu-bg", ownMenu ? `url("${ownMenu.data}")` : ["vlastni", "zive"].includes(c["pozadi-menu"]) ? null : BG(c["pozadi-menu"]));
  set("--back-photo", ownBack ? `url("${ownBack.data}")` : null);
  set("--pause-bg", BG(c.pause));
  set("--emblem-bg", EMBLEM_BG.find(([id]) => id === c.emblemBg)?.[1] ?? null);
  set("--emblem-fg", EMBLEM_FG.find(([id]) => id === c.emblemFg)?.[1] ?? null);
  root.dataset.emblem = app.level.level >= EMBLEM_LEVEL ? "on" : "off";
  // the growing flower frame: corners bloom after 10 and 25 solved puzzles, the green deepens up to 100
  const solves = (app.history ?? []).filter(e => e.kind === "solve").length;
  set("--bloom", `${Math.min(1, solves / 100)}`);
  set("--bloom-a", solves >= 10 ? "1" : "0");
  set("--bloom-b", solves >= 25 ? "1" : "0");
  butterflies(c["pozadi-menu"] === "zive");

  clearTimeout(daytimeTimer);
  if (c["pozadi-hry"] === "doba") daytimeTimer = setTimeout(() => applyLook(app), 15 * 60 * 1000);
  return c;
}

/** Live menu background: a few butterflies drifting over the meadow (only on menu screens, CSS hides them in game). */
function butterflies(on) {
  let layer = document.getElementById("butterflies");
  if (!on) { layer?.remove(); return; }
  if (layer) return;
  layer = document.createElement("div");
  layer.id = "butterflies";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i++) {
    const b = document.createElement("span");
    b.textContent = "🦋";
    b.style.cssText = `top:${10 + Math.random() * 75}%;animation-delay:${-Math.random() * 30}s;animation-duration:${22 + Math.random() * 18}s;font-size:${14 + Math.random() * 10}px`;
    layer.append(b);
  }
  document.body.append(layer);
}

/** Save the profile's look and apply it. */
export async function saveLook(app, patch) {
  app.look = { ...(app.look ?? {}), ...patch };
  await store.put(`look/${app.profile}`, app.look);
  return applyLook(app);
}

/** Resize a picture file to a JPEG data URL (longest side `max`) for an own background or card back. */
export function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Obrázek nejde načíst."));
    img.src = URL.createObjectURL(file);
  });
}

/** Confetti over the screen when a puzzle is solved (reward of the Animace category). */
export function celebrate() {
  const colours = ["#e88fb3", "#f2c230", "#6aa9d8", "#7fae5a", "#f0997b"];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.cssText = `left:${Math.random() * 100}vw;background:${colours[i % colours.length]};animation-delay:${Math.random() * 0.6}s`;
    document.body.append(c);
    setTimeout(() => c.remove(), 3600);
  }
}

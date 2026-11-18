// Novinky (plan, chapter 12): what has newly unlocked – levels and what they brought, completed
// challenges and their rewards, big category rewards. Everything is derived from the XP history and
// the completed challenges; the only stored thing is "read up to" per profile (seen/<profile>, synced).

import * as store from "../data/store.js";
import { CATEGORIES, CHALLENGES, EMBLEM_LEVEL, GENERATOR_LEVEL, emblemColourLevel, levelOf, levelRewards } from "../game/progression.js";
import { fill, h, icon } from "./dom.js";

const MAX = 50;

/** Where a level's reward lives. */
function levelLink(L) {
  if (L <= CATEGORIES.length || L === 15 || L >= EMBLEM_LEVEL) return "#/vzhled";
  if (L === GENERATOR_LEVEL) return "#/nova";
  return "#/statistiky";
}

/** All news items of the profile, newest first: { at, title, text, href, icon }. */
export function newsItems(app) {
  const out = [];
  const rewards = levelRewards();

  // levels: walk the history and note each level the moment it was reached
  let xp = 0, level = 1;
  for (const e of app.history) {
    xp += e.xp ?? 0;
    const now = levelOf(xp).level;
    for (let L = level + 1; L <= now; L++) {
      const got = rewards.filter(r => r.level === L).map(r => r.text);
      if (emblemColourLevel(L)) got.push("nová barva emblému");
      if (L === 5) got.push("výzvy v otevřených kategoriích");
      out.push({ at: e.at, icon: "star", title: `Level ${L}`, text: got.length ? got.join(" · ") : "", href: got.length ? levelLink(L) : "#/statistiky" });
    }
    level = now;
  }

  // challenges and the big reward of a category once all its challenges are done
  for (const ch of CHALLENGES) {
    const at = app.doneAt?.get(ch.id);
    if (at == null) continue;
    out.push({ at, icon: "trophy", title: `Výzva splněna: ${ch.text}`, text: `Odměna: ${ch.reward}`,
      href: ch.cat === "obecne" ? "#/vyzvy/obecne" : "#/vzhled" });
  }
  for (const cat of CATEGORIES) {
    const ats = CHALLENGES.filter(x => x.cat === cat.key).map(x => app.doneAt?.get(x.id));
    if (ats.some(a => a == null)) continue;
    out.push({ at: Math.max(...ats) + 1, icon: "trophy", title: `Velká odměna – ${cat.title}`, text: cat.big, href: "#/vzhled" });
  }

  // the generator through the whole book (before level 17)
  const bookIds = new Set(app.content.puzzles.map(p => p.id));
  const seen = new Set();
  for (const e of app.history) {
    if (e.kind !== "solve" || !bookIds.has(e.puzzle) || seen.has(e.puzzle)) continue;
    seen.add(e.puzzle);
    if (seen.size === bookIds.size) {
      if (levelOf(app.history.filter(x => x.at <= e.at).reduce((n, x) => n + (x.xp ?? 0), 0)).level < GENERATOR_LEVEL)
        out.push({ at: e.at, icon: "plus", title: "Celá kniha vyřešená!", text: "Odemkla se tvorba vlastních hádanek a úpravy postav.", href: "#/nova" });
      break;
    }
  }

  // newest first; items from the same moment keep the order they happened in (level 4 before level 5…)
  out.forEach((n, i) => { n.seq = n.title.startsWith("Level ") ? +n.title.slice(6) : 1000 + i; });
  return out.sort((a, b) => b.at - a.at || b.seq - a.seq).slice(0, MAX);
}

export async function unreadCount(app) {
  const upto = (await store.get(`seen/${app.profile}`))?.upto ?? 0;
  return newsItems(app).filter(n => n.at > upto).length;
}

function when(ms) {
  const d = new Date(ms), now = new Date();
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return diff === 0 ? `dnes ${time}` : diff === 1 ? `včera ${time}` : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

export async function renderNews(root, app) {
  const upto = (await store.get(`seen/${app.profile}`))?.upto ?? 0;
  const items = newsItems(app);
  const list = h("ul", { class: "news" });
  fill(list, items.length
    ? items.map(n => h("li", {}, h("a", { class: `panel news-item${n.at > upto ? " unread" : ""}`, href: n.href },
        icon(n.icon, 20), h("div", {}, h("strong", {}, n.title), n.text ? h("p", {}, n.text) : null, h("small", {}, when(n.at))))))
    : h("li", { class: "note" }, "Zatím nic. Novinky přibudou s levely a splněnými výzvami."));
  root.replaceChildren(
    h("header", { class: "bar" }, h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
      h("h1", {}, "Novinky", h("small", { class: "who" }, app.profiles[app.profile]?.name))),
    h("main", { class: "news-page" }, list));
  // everything shown is read now (synced, so it is read on the other devices too)
  const newest = items[0]?.at ?? 0;
  if (newest > upto) await store.put(`seen/${app.profile}`, { upto: newest });
}

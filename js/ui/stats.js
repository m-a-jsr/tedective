// Statistics (plan 3.8) and the level badge used in the bars: level, XP to the next one, emblem from level 20.

import { SECTIONS } from "../data/content.js";
import { EMBLEM_LEVEL, levelRewards } from "../game/progression.js";
import { formatTime, h, icon } from "./dom.js";

/** Level and XP bar; from level 20 the level number sits in an emblem. */
export function levelBadge(app, { big = false } = {}) {
  const lv = app.level;
  const pct = Math.round(((lv.xp - lv.from) / (lv.to - lv.from)) * 100);
  return h("a", { class: `level-badge${big ? " big" : ""}`, href: "#/statistiky", "aria-label": `Level ${lv.level}, ${lv.xp} XP` },
    lv.level >= EMBLEM_LEVEL ? h("span", { class: "emblem" }, lv.level) : h("span", { class: "lv" }, `Lv ${lv.level}`),
    h("span", { class: "xpbar" }, h("span", { style: `width:${pct}%` })));
}

function dayRuns(solves) {
  const days = [...new Set(solves.map(e => { const d = new Date(e.at); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }))].sort((a, b) => a - b);
  let run = 0, best = 0, prev = null;
  for (const d of days) { run = prev !== null && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const current = prev !== null && (today - prev) / 86400000 <= 1 ? run : 0;
  return { best, current };
}

export function renderStats(root, app) {
  const lv = app.level;
  const solves = app.history.filter(e => e.kind === "solve");
  const played = solves.filter(e => !e.solvedInBook);
  const timed = solves.filter(e => e.timed && e.time != null);
  let run = 0, bestClean = 0;
  for (const e of played) { run = e.mistakes ? 0 : run + 1; bestClean = Math.max(bestClean, run); }
  const days = dayRuns(solves);
  const bySize = {};
  for (const e of timed) (bySize[e.size] ??= []).push(e.time);
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);

  const row = (label, value) => [h("dt", {}, label), h("dd", {}, value)];
  const next = levelRewards().find(r => r.level > lv.level);
  root.replaceChildren(
    h("header", { class: "bar" },
      h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
      h("h1", {}, "Statistiky", h("small", { class: "who" }, app.profiles[app.profile]?.name))),
    h("main", { class: "stats" },
      h("section", { class: "panel level-panel" },
        levelBadge(app, { big: true }),
        h("p", {}, `${lv.xp} XP · do levelu ${lv.level + 1} zbývá ${lv.to - lv.xp} XP`),
        next ? h("p", { class: "note" }, `Další odměna na levelu ${next.level}: ${next.text}.`) : null),
      h("section", { class: "panel" }, h("h2", {}, "Vyřešeno"),
        h("dl", {},
          SECTIONS.map(sec => {
            const ps = app.content.puzzles.filter(p => p.section === sec.key);
            return row(sec.title, `${ps.filter(p => app.progress[p.id]?.solvedAt).length}/${ps.length}`);
          }),
          row("Vlastní hádanky", `${app.generated.filter(p => app.progress[p.id]?.solvedAt).length}/${app.generated.length}`),
          row("Celkem vyřešení (i opakovaná)", solves.length))),
      h("section", { class: "panel" }, h("h2", {}, "Chyby a nápovědy"),
        h("dl", {},
          row("Chyby celkem", sum(played, e => e.mistakes)),
          row("Nápovědy celkem", sum(solves, e => e.hints[0] + e.hints[1] + (e.bookHint ? 1 : 0))),
          row("Bez chyby po sobě – nejvíc", bestClean),
          row("Dny po sobě – teď / nejvíc", `${days.current} / ${days.best}`))),
      h("section", { class: "panel" }, h("h2", {}, "Čas"),
        h("p", { class: "note" }, "Jen hádanky hrané od začátku v aplikaci."),
        h("dl", {},
          row("Celkem", formatTime(sum(timed, e => e.time))),
          Object.entries(bySize).sort().map(([size, ts]) => row(size.replace("x", "×"),
            `nejlépe ${formatTime(Math.min(...ts))} · průměr ${formatTime(sum(ts, t => t) / ts.length)}`))))));
}

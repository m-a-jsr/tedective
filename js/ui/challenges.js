// Challenges tab (plan 3.9): opens at level 5, one sub-tab per look category plus "Obecné".
// The rewards are listed here; choosing them comes with the Vzhled step.

import { CATEGORIES, CHALLENGES, CHALLENGES_FROM, categoryComplete, isActive, lockReason } from "../game/progression.js";
import { fill, h, icon } from "./dom.js";
import { levelBadge } from "./stats.js";

export function renderChallenges(root, app) {
  const level = app.level.level;
  const header = h("header", { class: "bar" },
    h("a", { class: "back", href: "#/", "aria-label": "Zpět" }, icon("back")),
    h("h1", {}, "Výzvy"), levelBadge(app));
  if (level < CHALLENGES_FROM) {
    root.replaceChildren(header, h("main", { class: "challenges" }, h("section", { class: "panel locked-panel" },
      icon("lock", 28), h("h2", {}, `Výzvy se otevřou na levelu ${CHALLENGES_FROM}`),
      h("p", { class: "note" }, `Teď máš level ${level}.`))));
    return;
  }

  const tabs = [...CATEGORIES.map((c, i) => ({ key: c.key, title: c.title, cat: c, open: level >= i + 1 })),
    { key: "obecne", title: "Obecné", open: true }];
  const want = location.hash.split("/")[2];
  let tab = tabs.find(t => t.key === want && t.open)?.key ?? tabs.find(t => t.open).key;
  const bar = h("div", { class: "tabs scroll", role: "tablist" });
  const body = h("div", { class: "challenge-list" });

  const draw = () => {
    fill(bar, tabs.map(t => {
      const chs = CHALLENGES.filter(x => x.cat === t.key);
      const n = chs.filter(x => app.done.has(x.id)).length;
      return h("button", { role: "tab", class: `${t.key === tab ? "on" : ""}${t.open ? "" : " closed"}`, disabled: !t.open,
        onclick: () => { tab = t.key; history.replaceState(null, "", `#/vyzvy/${t.key}`); draw(); } },
        t.open ? null : icon("lock", 14), t.title, h("span", { class: "n" }, `${n}/${chs.length}`));
    }));
    const t = tabs.find(x => x.key === tab);
    const ctx = app.challengeContext();
    const items = CHALLENGES.filter(x => x.cat === tab).map(ch => {
      const done = app.done.has(ch.id), active = isActive(ch, level);
      const st = ch.check(ctx);
      return h("li", { class: `panel challenge ${done ? "done" : active ? "" : "locked"}` },
        h("div", { class: "head" },
          done ? icon("check", 18) : active ? h("span", { class: "dot" }) : icon("lock", 18),
          h("strong", {}, ch.text)),
        h("p", { class: "reward" }, "Odměna: ", ch.reward),
        done ? h("p", { class: "note" }, "Splněno")
          : active ? h("div", { class: "meter" }, h("span", { style: `width:${Math.round((st.have / st.need) * 100)}%` }),
            h("em", {}, `${st.have}${st.unit ?? ""}/${st.need}${st.unit ?? ""}`))
          : h("p", { class: "note" }, `Aktivní ${lockReason(ch)}`));
    });
    fill(body,
      t.cat ? h("p", { class: "note" }, `${t.cat.title} – ${t.cat.theme}. Otevřením kategorie se odemkla možnost „${t.cat.first}“.`) : null,
      h("ul", {}, items),
      t.cat ? h("section", { class: `panel big-reward ${categoryComplete(t.key, app.done) ? "done" : ""}` },
        icon("trophy", 20), h("div", {}, h("strong", {}, "Velká odměna za všechny čtyři"), h("p", {}, t.cat.big))) : null);
  };
  draw();
  root.replaceChildren(header, h("main", { class: "challenges" }, bar, body));
}

// Game screen: the grid of cards, verdicts, marks, two-stage hint, undo, reset,
// continuing from the paper book, summary.

import { Session, VERDICT } from "../game/session.js";
import { words } from "../logic/czech.js";
import { askDialog, avatar, capitalize, confirmDialog, fill, formatTime, h, icon, initials, toast } from "./dom.js";

/** `opts.fromBook`: opened from the list as "in progress in the book", so start picking the last card. */
export function renderGame(root, app, puzzle, opts = {}) {
  let s = new Session(puzzle, app.progress[puzzle.id]);
  let markMode = false;
  let bookMode = null;   // null | "last" (pick the last card from the book) | "fill" (add other solved cards)
  let hint = null;       // { statementCells, cell, stage }
  let picked = null;     // cell waiting for a verdict

  const save = () => app.saveProgress(puzzle.id, s.save());
  const theme = puzzle.theme;
  const word = v => capitalize(words(theme, v).sg);
  const fresh = () => s.known.size === 1 && !s.mistakes && !s.fromBook;

  const mistakes = h("span", { class: "mistakes" });
  const markBtn = h("button", { class: "tool", "aria-label": "Značky", "aria-pressed": "false", onclick: () => { markMode = !markMode; closeSheet(); draw(); } },
    icon("pencil"), h("span", {}, "Značky"));
  const tools = h("div", { class: "tools" });
  const banner = h("div", { class: "banner", hidden: true });
  const grid = h("div", { class: `grid cols-${puzzle.grid.cols}`, style: `--cols:${puzzle.grid.cols}` });
  const sheet = h("div", { class: "sheet", hidden: true });
  const summary = h("div", { class: "summary panel", hidden: true });
  // pause cover; its picture becomes selectable in the Vzhled step
  const cover = h("div", { class: "pause-cover", hidden: true },
    h("div", { class: "panel" }, h("p", {}, "Pauza"), h("button", { class: "primary", onclick: () => setPaused(false) }, icon("play"), "Pokračovat")));

  root.replaceChildren(
    h("header", { class: "bar" },
      h("a", { class: "back", href: "#/", "aria-label": "Zpět na seznam" }, icon("back")),
      h("h1", {}, puzzle.title, h("small", {}, theme.title)),
      mistakes),
    h("main", { class: "game" }, tools, banner, h("div", { class: "grid-wrap" }, grid), summary),
    sheet, cover);

  function setPaused(on) {
    if (on) { closeSheet(); s.pause(); } else s.resume();
    cover.hidden = !on;
    save();
  }
  const onVisibility = () => { if (document.hidden && !s.solved) setPaused(true); };
  document.addEventListener("visibilitychange", onVisibility);

  function drawTools() {
    const btn = (ic, label, fn) => h("button", { class: "tool", onclick: fn, "aria-label": label }, icon(ic), h("span", {}, label));
    const item = (label, fn) => h("button", { onclick: e => { e.target.closest("details").open = false; fn(); } }, label);
    fill(tools, 
      markBtn,
      btn("bulb", "Nápověda", onHint),
      btn("undo", "Zpět", () => { if (s.undo()) { save(); draw(); } else toast("Není co vrátit."); }),
      s.solved ? null : btn("pause", "Pauza", () => setPaused(true)),
      h("details", { class: "more" },
        h("summary", { class: "tool", "aria-label": "Další" }, icon("dots")),
        h("div", { class: "menu panel" },
          item("Smazat značky", () => { s.clearMarks(); save(); draw(); }),
          puzzle.book && fresh() && !bookMode ? item("Mám ji rozdělanou v knize", startBook) : null,
          puzzle.book && !s.solved && !bookMode ? item("Vyřešeno v knize", solvedInBook) : null,
          puzzle.code ? item("Kód hádanky", showCode) : null,
          puzzle.book ? null : item("Smazat hádanku", onDelete),
          item("Začít znovu", onReset))));
  }

  function card(i) {
    const solved = s.known.has(i);
    const state = solved ? s.known.get(i) : null;
    const cls = ["card", solved ? (state ? "bad" : "good") : "hidden",
      !solved && s.marks.get(i) === "g" ? "mark-g" : "", !solved && s.marks.get(i) === "r" ? "mark-r" : "",
      picked === i ? "picked" : "", hint?.stage === 2 && hint.cell === i ? "hint-cell" : "",
      hint?.statementCells.includes(i) ? "hint-st" : ""].filter(Boolean).join(" ");
    const text = s.visible(i) ? puzzle.texts[i] : solved && puzzle.quotes[i] ? `„${puzzle.quotes[i]}“` : null;
    return h("button", { class: cls, onclick: () => onCard(i), "aria-label": `${puzzle.grid.label(i)} ${puzzle.names[i]}` },
      h("span", { class: "coord" }, puzzle.grid.label(i)),
      solved && i === puzzle.star && puzzle.number != null
        ? h("span", { class: "star" }, icon("star", 14), h("span", { class: "num" }, puzzle.number)) : null,
      avatar(puzzle.names[i], app.content.photos),
      h("span", { class: "name" }, puzzle.names[i]),
      h("span", { class: "role" }, puzzle.roles[i]),       // the role stays: statements about roles need it
      solved ? h("span", { class: "verdict" }, words(theme, state).sg) : null,
      text ? h("span", { class: s.visible(i) ? "text statement" : "text quote" }, text) : null);
  }

  function draw() {
    mistakes.textContent = s.mistakes ? `chyby ${s.mistakes}` : "";
    markBtn.setAttribute("aria-pressed", String(markMode));
    markBtn.classList.toggle("on", markMode);
    drawTools();
    banner.hidden = !bookMode;
    if (bookMode === "last") banner.replaceChildren(h("p", {}, "Ťukni na kartu, jejíž nápovědu jsi v knize odkryla naposledy."),
      h("button", { onclick: () => { bookMode = null; draw(); } }, "Zrušit"));
    if (bookMode === "fill") banner.replaceChildren(h("p", {}, "Máš v knize vyřešené ještě jiné karty? Ťukni na ně."),
      h("button", { class: "primary", onclick: () => { bookMode = null; save(); draw(); } }, "Hrát dál"));
    grid.replaceChildren(...Array.from({ length: puzzle.grid.n }, (_, i) => card(i)));
    summary.hidden = !s.solved;
    if (s.solved) showSummary();
  }

  function onCard(i) {
    if (bookMode === "last") {
      const n = s.continueFromBook(i, bookHint);
      bookMode = "fill";
      toast(n ? `Otočeno ${n} karet podle knihy.` : "Tahle karta je hned na začátku, nic se neotočilo.");
      save(); draw();
      return;
    }
    if (s.known.has(i) || s.solved) return;
    if (markMode) { s.cycleMark(i); save(); draw(); return; }
    picked = i;
    sheet.replaceChildren(
      h("p", {}, `${puzzle.names[i]} je…`),
      h("div", { class: "choices" },
        h("button", { class: "choice bad", onclick: () => decide(1) }, word(1)),
        h("button", { class: "choice good", onclick: () => decide(0) }, word(0))),
      h("button", { class: "cancel", onclick: () => { closeSheet(); draw(); } }, "Zrušit"));
    sheet.hidden = false;
    draw();
  }

  function closeSheet() { picked = null; sheet.hidden = true; }

  function decide(v) {
    const i = picked;
    closeSheet();
    if (bookMode === "fill") {
      if (!s.fillFromBook(i, v)) toast("Takhle to v knize vyjít nemohlo. Zkontroluj, prosím.");
      save(); draw();
      return;
    }
    const r = s.verdict(i, v);
    if (r === VERDICT.OK) {
      if (hint && s.known.has(hint.cell)) hint = null;
      navigator.vibrate?.(15);
    } else if (r === VERDICT.WRONG) {
      toast("Tudy ne – přečti si nápovědy znovu.", "bad");
      navigator.vibrate?.([40, 60, 40]);
    } else {
      toast("Na tohle ještě nemáš dost důkazů.");
    }
    save(); draw();
  }

  let bookHint = null;
  const askBookHint = () => askDialog("Použila jsi v knize nápovědu?",
    "Hádanka z knihy se počítá do XP. Čas se měří až v aplikaci a do výzev na čas se nepočítá.",
    [{ label: "Ano", value: true }, { label: "Ne", value: false, primary: true }]);

  async function startBook() {
    const used = await askBookHint();
    if (used == null) return;
    bookHint = used;
    markMode = false;
    hint = null;
    bookMode = "last";
    draw();
  }

  async function solvedInBook() {
    const used = await askBookHint();
    if (used == null) return;
    s.markSolvedInBook(used);
    bookMode = null; hint = null; markMode = false;
    save(); draw();
  }

  function onHint() {
    if (s.solved || bookMode) return;
    if (!hint) {
      const found = s.hint();
      if (!found) return toast("Teď se nedá nic dokázat.");
      hint = { ...found, stage: 1 };
      s.hints[0]++;
      toast(found.statementCells.length > 1 ? "Přečti si zvýrazněné výpovědi dohromady." : "Podívej se na zvýrazněnou výpověď.");
    } else if (hint.stage === 1) {
      hint.stage = 2;
      s.hints[1]++;
      toast(`Rozhodnout se dá o kartě ${puzzle.grid.label(hint.cell)} (${puzzle.names[hint.cell]}).`);
    } else {
      toast(`Rozhodnout se dá o kartě ${puzzle.grid.label(hint.cell)} (${puzzle.names[hint.cell]}).`);
    }
    save(); draw();
  }

  async function onReset() {
    const ok = await confirmDialog(`Začít hádanku ${puzzle.title} znovu?`,
      "Smaže se postup v této hádance a její chyby, nápovědy a čas. XP, level, výzvy a odměny zůstanou.",
      { ok: "Začít znovu" });
    if (!ok) return;
    await app.resetProgress(puzzle.id);
    s = new Session(puzzle, null);
    bookMode = null; hint = null; markMode = false; bookHint = null;
    draw();
  }

  async function showCode() {
    try { await navigator.clipboard.writeText(puzzle.code); toast("Kód zkopírován."); }
    catch { toast(puzzle.code); }
  }

  async function onDelete() {
    const ok = await confirmDialog(`Smazat hádanku ${puzzle.title}?`,
      "Hádanka zmizí ze seznamu vlastních hádanek na všech zařízeních a u všech profilů.", { ok: "Smazat" });
    if (!ok) return;
    await app.deleteGenerated(puzzle.id);
    app.go("#/");
  }

  function showSummary() {
    fill(summary, 
      h("h2", {}, icon("check"), s.solvedInBook ? "Vyřešeno v knize" : "Vyřešeno"),
      s.solvedInBook ? null : h("dl", {},
        h("dt", {}, "Chyby"), h("dd", {}, s.mistakes),
        h("dt", {}, "Nápovědy"), h("dd", {}, s.hints[0] + s.hints[1]),
        h("dt", {}, s.fromBook ? "Čas v aplikaci" : "Čas"), h("dd", {}, formatTime(s.elapsed))),
      s.fromBook ? h("p", { class: "note" }, `Navázáno na knihu${s.bookHint ? ", s nápovědou z knihy" : ""}. Do výzev na čas se nepočítá.`) : null,
      puzzle.number != null ? h("p", { class: "note" }, "Číslo z ★ karty si zapiš.") : null,
      puzzle.book ? null : h("a", { class: "button", href: "#/nova" }, "Další nová hádanka"),
      h("a", { class: "button", href: "#/" }, "Zpět na seznam"));
  }

  draw();
  if (opts.fromBook && fresh()) startBook();
  return () => { document.removeEventListener("visibilitychange", onVisibility); save(); };   // called when leaving the screen
}

// Connection to the private data repository: entering the access token (first start, or later from
// the settings). The token stays in this device only.

import { REPO } from "../data/github.js";
import * as store from "../data/store.js";
import { h } from "./dom.js";

/** Form for the token. `connect()` must download the content with it and throw on failure. */
export function tokenForm({ connect, onDone, cancel = null }) {
  const input = h("input", { type: "password", autocomplete: "off", spellcheck: "false", "aria-label": "Přístupový token",
    placeholder: "github_pat_…" });
  const err = h("p", { class: "err", hidden: true });
  const btn = h("button", { class: "primary", type: "submit" }, "Připojit");
  const submit = async e => {
    e.preventDefault();
    const token = input.value.trim();
    if (!token) return;
    btn.disabled = true;
    btn.textContent = "Stahuji…";
    err.hidden = true;
    const old = await store.getCfg("token");
    await store.setCfg("token", token);
    try {
      await connect();
      input.value = "";
      onDone();
    } catch (ex) {
      await store.setCfg("token", old);
      err.textContent = ex.message || String(ex);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Připojit";
    }
  };
  return h("form", { class: "token", onsubmit: submit },
    input, err,
    h("div", { class: "actions" }, cancel ? h("button", { type: "button", onclick: cancel }, "Zrušit") : null, btn));
}

/** First start without data: what to do, then the form. */
export function renderSetup(root, { connect, onDone }) {
  root.replaceChildren(
    h("main", { class: "setup" },
      h("section", { class: "panel" },
        h("img", { src: "img/ikona/ikona.svg", alt: "", width: 72, height: 72 }),
        h("h1", {}, "Tedective"),
        h("p", {}, "Hádanky se stáhnou ze soukromého úložiště. Vlož přístupový token, stačí jednou. Potom aplikace funguje i bez internetu."),
        tokenForm({ connect, onDone }),
        h("p", { class: "note" }, `Data: ${REPO}`))));
}

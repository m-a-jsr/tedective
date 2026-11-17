// Small DOM helpers and the icon set (simple inline SVG, so the app works offline).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

const PATHS = {
  back: "M15 5l-7 7 7 7",
  pencil: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
  droplet: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  spider: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9V5M9 11L4 8M9 13l-5 3M15 11l5-3M15 13l5 3M10 15l-3 5M14 15l3 5",
  school: "M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6",
  mask: "M4 8c4-2 12-2 16 0 0 6-3 10-8 10S4 14 4 8zM8 11h2M14 11h2",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  pause: "M9 5v14M15 5v14",
  play: "M7 4l13 8-13 8z",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  cloud: "M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z",
  cloudCheck: "M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18zM9.5 13.5l2 2 3.5-4",
  cloudOff: "M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18zM4 4l16 16",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  plus: "M12 5v14M5 12h14",
  cards: "M8 4h11v15H8zM5 7v13h11",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
};

export function icon(name, size = 20) {
  const s = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
  return h("span", { class: "icon", html: s });
}

let toastTimer = null;
export function toast(msg, kind = "") {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status" }); document.body.append(el); }
  el.textContent = msg;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ""; }, 2600);
}

export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

export function formatTime(ms) {
  const s = Math.round(ms / 1000), m = Math.floor(s / 60), hh = Math.floor(m / 60);
  return hh ? `${hh} h ${m % 60} min` : m ? `${m} min ${s % 60} s` : `${s} s`;
}

export function initials(name) {
  const parts = name.replace(/[„“"]/g, "").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Round picture of a character: the photo if there is one, else initials. */
export function avatar(name, photos) {
  const src = photos?.get(name);
  return src ? h("img", { class: "avatar", src, alt: "" }) : h("span", { class: "avatar" }, initials(name));
}

/** Confirmation dialog. With `typeWord`, the user must type that word to confirm. Resolves to true/false. */
export function confirmDialog(title, text, { ok = "Potvrdit", typeWord = null } = {}) {
  return new Promise(resolve => {
    const input = typeWord ? h("input", { "aria-label": `Napiš ${typeWord}`, autocomplete: "off" }) : null;
    const err = h("p", { class: "err", hidden: true }, `Napiš ${typeWord}.`);
    const dlg = h("dialog", { class: "panel dialog" },
      h("h2", {}, title), h("p", {}, text),
      typeWord ? h("p", { class: "note" }, `Pro potvrzení napiš ${typeWord}:`) : null, input, err,
      h("div", { class: "actions" },
        h("button", { onclick: () => close(false) }, "Zrušit"),
        h("button", { class: "danger", onclick: () => {
          if (typeWord && input.value.trim().toUpperCase() !== typeWord) { err.hidden = false; return; }
          close(true);
        } }, ok)));
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    input?.addEventListener("input", () => { err.hidden = true; });
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Dialog with a question and several answers; resolves to the chosen value, or null when cancelled. */
export function askDialog(title, text, options) {
  return new Promise(resolve => {
    const dlg = h("dialog", { class: "panel dialog" },
      h("h2", {}, title), text ? h("p", {}, text) : null,
      h("div", { class: "actions" },
        h("button", { onclick: () => close(null) }, "Zrušit"),
        options.map(o => h("button", { class: o.primary ? "primary" : "", onclick: () => close(o.value) }, o.label))));
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Dialog asking for a short text; resolves to the trimmed text, or null when cancelled. */
export function promptDialog(title, label, value = "", ok = "Uložit") {
  return new Promise(resolve => {
    const input = h("input", { "aria-label": label, value, maxlength: 30, autocomplete: "off" });
    const dlg = h("dialog", { class: "panel dialog" },
      h("h2", {}, title),
      h("form", { onsubmit: e => { e.preventDefault(); if (input.value.trim()) close(input.value.trim()); } },
        h("p", { class: "note" }, label), input,
        h("div", { class: "actions" },
          h("button", { type: "button", onclick: () => close(null) }, "Zrušit"),
          h("button", { class: "primary", type: "submit" }, ok))));
    const close = v => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(null); });
    document.body.append(dlg);
    dlg.showModal();
    input.select();
  });
}

/** replaceChildren that skips null/false children. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat().filter(c => c != null && c !== false));
}

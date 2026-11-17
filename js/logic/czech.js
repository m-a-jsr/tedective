// Czech word forms per theme, count phrases and alphabetical order (port of gen/themes.py and gen/czech.py).
// State 1 is the "marked" state (criminal, greasy, lazy, hidden spider), state 0 the other one.

const adj = (sg, pl, gen, acc) => ({ sg, pl, gen, acc, all: `všichni ${pl}`, none: `žádný ${sg}`, none1: "žádný" });

export const THEMES = {
  zlocin: {
    key: "zlocin", title: "Zločinec, nebo nevinný?",
    marked: { sg: "zločinec", pl: "zločinci", gen: "zločinců", acc: "zločince", all: "všichni zločinci", none: "žádný zločinec", none1: "žádný" },
    clear: adj("nevinný", "nevinní", "nevinných", "nevinné"),
  },
  mastny: {
    key: "mastny", title: "Mastný, nebo čistý?",
    marked: adj("mastný", "mastní", "mastných", "mastné"),
    clear: adj("čistý", "čistí", "čistých", "čisté"),
  },
  liny: {
    key: "liny", title: "Líný, nebo akční?",
    marked: adj("líný", "líní", "líných", "líné"),
    clear: adj("akční", "akční", "akčních", "akční"),
  },
  pavouk: {
    key: "pavouk", title: "Skrytý pavouk, nebo v duši kůzle?",
    marked: { sg: "skrytý pavouk", pl: "skrytí pavouci", gen: "skrytých pavouků", acc: "skryté pavouky",
              all: "všichni skrytí pavouci", none: "žádný skrytý pavouk", none1: "žádný" },
    clear: { sg: "kůzle", pl: "kůzlata", gen: "kůzlat", acc: "kůzlata", all: "všechna kůzlata", none: "žádné kůzle", none1: "žádné" },
  },
};

export const words = (theme, state) => (state ? theme.marked : theme.clear);

/** 'je právě 1 mastný' / 'jsou právě 2 mastní' / 'je právě 5 mastných' / 'není žádný mastný'. */
export function countPhrase(w, k, atLeast = false) {
  const q = atLeast ? "alespoň" : "právě";
  if (k === 0 && !atLeast) return `není ${w.none}`;
  if (k === 1) return `je ${q} 1 ${w.sg}`;
  if (k >= 2 && k <= 4) return `jsou ${q} ${k} ${w.pl}`;
  return `je ${q} ${k} ${w.gen}`;
}

/** '(z toho) právě 1' / '(z toho) žádný'. */
export const shortCount = (w, k) => (k === 0 ? w.none1 : `právě ${k}`);

const ORDER = ["a", "b", "c", "č", "d", "e", "f", "g", "h", "ch", "i", "j", "k", "l", "m", "n", "o", "p", "q",
  "r", "ř", "s", "š", "t", "u", "v", "w", "x", "y", "z", "ž"];
const RANK = new Map(ORDER.map((ch, i) => [ch, i]));
const SECONDARY = { á: "a", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ť: "t", ú: "u", ů: "u", ý: "y" };

/** Czech alphabetical key: CH after H, háček letters after their base, acute accents secondary. */
export function czechKey(name) {
  const s = name.toLowerCase(), primary = [];
  for (let i = 0; i < s.length;) {
    if (s.slice(i, i + 2) === "ch") { primary.push(RANK.get("ch")); i += 2; continue; }
    const ch = SECONDARY[s[i]] ?? s[i];
    primary.push(RANK.has(ch) ? RANK.get(ch) : 100 + ch.codePointAt(0));
    i += 1;
  }
  return { primary, s };
}

export function czechCompare(a, b) {
  const ka = czechKey(a), kb = czechKey(b);
  for (let i = 0; i < Math.min(ka.primary.length, kb.primary.length); i++)
    if (ka.primary[i] !== kb.primary[i]) return ka.primary[i] - kb.primary[i];
  if (ka.primary.length !== kb.primary.length) return ka.primary.length - kb.primary.length;
  return ka.s < kb.s ? -1 : ka.s > kb.s ? 1 : 0;
}

export const initial = name => (name.slice(0, 2).toLowerCase() === "ch" ? "Ch" : name.slice(0, 1).toUpperCase());

/** Names that contain " a " (a couple, e.g. "X a Y") are quoted inside sentences. */
export const shownName = name => (name.includes(" a ") ? `„${name}“` : name);

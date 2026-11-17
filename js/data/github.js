// Access to the private data repository through the GitHub REST API (contents endpoint).
// The token is a fine-grained token limited to this one repository (contents: read and write).

export const REPO = "m-a-jsr/tedective-data";
const API = `https://api.github.com/repos/${REPO}/contents/`;

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function headers(token, raw = false) {
  return {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function call(token, path, init = {}, raw = false) {
  let r;
  try {
    r = await fetch(API + path, { cache: "no-store", ...init, headers: { ...headers(token, raw), ...init.headers } });
  } catch {
    throw new GitHubError(0, "Bez připojení k internetu.");
  }
  if (r.ok) return r;
  const text = { 401: "Token neplatí (vypršel nebo byl zrušen).", 403: "Token nemá přístup k datům.",
    404: "Soubor nebo repozitář nenalezen.", 409: "Data se mezitím změnila.", 422: "Data se mezitím změnila." }[r.status];
  throw new GitHubError(r.status, text ?? `GitHub odpověděl chybou ${r.status}.`);
}

/** A text file's content (up to 100 MB). */
export async function readText(token, path) {
  return (await call(token, path, {}, true)).text();
}

const fromBase64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), c => c.charCodeAt(0)));
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A JSON file with its sha (needed to overwrite it), or { json: null, sha: null } if it does not exist. */
export async function readJson(token, path) {
  try {
    const d = await (await call(token, path)).json();
    return { json: JSON.parse(fromBase64(d.content)), sha: d.sha };
  } catch (e) {
    if (e.status === 404) return { json: null, sha: null };
    throw e;
  }
}

/** Write a JSON file. `sha` is the version it replaces (null for a new file); if the file changed
 *  in the meantime GitHub refuses with 409, so two devices never overwrite each other silently. */
export async function writeJson(token, path, json, sha, message) {
  const body = { message, content: toBase64(JSON.stringify(json)), ...(sha ? { sha } : {}) };
  const d = await (await call(token, path, { method: "PUT", body: JSON.stringify(body) })).json();
  return d.content.sha;
}

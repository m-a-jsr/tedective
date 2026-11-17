// Decoding of the content files written by gen/build_app.py (JSON, XOR with a fixed key, base64).
// This only keeps solutions from being readable at a glance; it is not encryption.

const KEY = new TextEncoder().encode("griductive-louka");

export function decode(text) {
  const bin = atob(text.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ KEY[i % KEY.length];
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ^ KEY[i % KEY.length]);
  return btoa(bin);
}

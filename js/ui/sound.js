// Sounds of the Zvuky category, synthesised with Web Audio (no sound files, works offline).
// play(pack, event) with event "ok" (card solved), "wrong" (mistake) or "solved" (whole puzzle).
// The big reward "louka" is a quiet meadow ambience (crickets and birds) while a puzzle is open.

let ctx = null;
const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, { at = 0, dur = 0.15, type = "sine", vol = 0.12, glide = null, attack = 0.005 } = {}) {
  const a = ac(), t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

function noise(dur, { at = 0, vol = 0.08, freq = 3000, q = 1 } = {}) {
  const a = ac(), t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

function bleat(at = 0, base = 520) {
  const a = ac(), t = a.currentTime + at;
  const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = "sawtooth"; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.85, t + 0.45);
  lfo.frequency.value = 22; lg.gain.value = base * 0.06; lfo.connect(lg).connect(o.frequency);
  f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
}

const PACKS = {
  cvak: { ok: () => noise(0.03, { freq: 2500, vol: 0.15, q: 4 }), wrong: () => noise(0.06, { freq: 600, vol: 0.15 }),
    solved: () => { noise(0.03, { freq: 2500, vol: 0.15, q: 4 }); noise(0.03, { at: 0.09, freq: 3200, vol: 0.15, q: 4 }); } },
  tony: { ok: () => tone(660, { dur: 0.25 }), wrong: () => tone(220, { dur: 0.3, type: "triangle" }),
    solved: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.35 })) },
  bubliny: { ok: () => tone(400, { dur: 0.12, glide: 1200, vol: 0.1 }), wrong: () => tone(500, { dur: 0.2, glide: 180, vol: 0.1 }),
    solved: () => [0, 0.08, 0.16, 0.26].forEach((t, i) => tone(350 + i * 120, { at: t, dur: 0.12, glide: 1300 + i * 200, vol: 0.09 })) },
  xylofon: { ok: () => tone(1046, { dur: 0.4, type: "triangle", vol: 0.14 }), wrong: () => tone(392, { dur: 0.4, type: "triangle", vol: 0.14 }),
    solved: () => [784, 880, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.45, type: "triangle", vol: 0.13 })) },
  koza: { ok: () => bleat(0, 560), wrong: () => bleat(0, 380), solved: () => { bleat(0, 560); bleat(0.55, 640); } },
};
PACKS.louka = PACKS.tony;   // the meadow ambience comes with gentle tones for the moves

export function play(pack, event) {
  try { PACKS[pack]?.[event]?.(); } catch { /* sound is optional */ }
}

// ---------- meadow ambience ----------
let ambience = null;
export function meadow(on) {
  if (!on) { clearInterval(ambience); ambience = null; return; }
  if (ambience) return;
  const chirp = () => {
    try {
      if (document.hidden) return;
      if (Math.random() < 0.7) for (let i = 0; i < 3; i++) tone(4200 + Math.random() * 300, { at: i * 0.07, dur: 0.04, vol: 0.012, type: "square" });
      if (Math.random() < 0.25) { const f = 2400 + Math.random() * 900; tone(f, { dur: 0.18, glide: f * 1.3, vol: 0.02 }); tone(f * 1.2, { at: 0.2, dur: 0.14, glide: f, vol: 0.018 }); }
    } catch { /* ignore */ }
  };
  ambience = setInterval(chirp, 900);
}

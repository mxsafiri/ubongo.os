'use client';

// Synthesized game audio — zero audio files, pure WebAudio.
// All gains kept low; every call is fire-and-forget and safe on the server.
//
// Two buses — effects and music — meet in a gentle compressor, so stacking
// sounds can't clip. The player can switch either off; that choice is kept.

let ctx: AudioContext | null = null;
let fxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

const PREFS_KEY = 'surfari-audio';
export interface AudioPrefs { sound: boolean; music: boolean }
let prefs: AudioPrefs = { sound: true, music: true };
try {
  if (typeof window !== 'undefined') prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
} catch { /* defaults */ }

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    fxBus = ctx.createGain();
    musicBus = ctx.createGain();
    fxBus.connect(comp);
    musicBus.connect(comp);
    applyPrefs();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function applyPrefs() {
  if (!ctx || !fxBus || !musicBus) return;
  fxBus.gain.setTargetAtTime(prefs.sound ? 1 : 0, ctx.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(prefs.sound && prefs.music ? 0.8 : 0, ctx.currentTime, 0.05);
}

/** The shared context and buses, for the continuous ride audio. */
export function audioGraph() {
  const c = ac();
  return c && fxBus && musicBus ? { ctx: c, fx: fxBus, music: musicBus } : null;
}

export function getAudioPrefs(): AudioPrefs {
  return { ...prefs };
}

export function setAudioPrefs(next: Partial<AudioPrefs>) {
  prefs = { ...prefs, ...next };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  applyPrefs();
}

function tone(
  freq: number,
  dur = 0.12,
  type: OscillatorType = 'sine',
  gain = 0.12,
  delay = 0,
  glideTo?: number,
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(fxBus ?? c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur = 0.25, gain = 0.14, delay = 0, filter: BiquadFilterType = 'lowpass', freq = 900) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  src.connect(f).connect(g).connect(fxBus ?? c.destination);
  src.start(t0);
}

export const sfx = {
  /** Create/resume the AudioContext inside a user-gesture call stack. */
  unlock() { ac(); },

  countdown(n: number) {
    if (n > 0) tone(440, 0.09, 'square', 0.05);
    else tone(880, 0.22, 'square', 0.07);
  },

  // Signal Rush
  hit(combo = 1) {
    const f = 660 * Math.pow(1.059, Math.min(combo, 12)); // rises a semitone per combo step
    tone(f, 0.09, 'triangle', 0.12);
    tone(f * 1.5, 0.09, 'sine', 0.06, 0.03);
  },
  miss() { tone(220, 0.18, 'sawtooth', 0.07, 0, 140); },

  // Boda Rush
  whoosh() { tone(320, 0.08, 'sine', 0.05, 0, 620); },
  crash() { noise(0.3, 0.18); tone(110, 0.25, 'sawtooth', 0.1, 0, 55); },

  // Frequency Duel — classic Simon pitches (E4, C#4, A3, E3)
  pad(i: number) {
    const freqs = [329.63, 277.18, 220.0, 164.81];
    tone(freqs[i] ?? 220, 0.26, 'sine', 0.14);
  },
  wrong() { tone(140, 0.35, 'sawtooth', 0.11); tone(133, 0.35, 'sawtooth', 0.09); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, i * 0.09)); },

  // Zone Flood
  pop() { tone(760, 0.06, 'sine', 0.09, 0, 1500); },
  aiMove() { tone(230, 0.09, 'sine', 0.05, 0, 180); },

  // Surf Run style
  nearMiss() { noise(0.22, 0.12, 0, 'bandpass', 1800); tone(900, 0.16, 'sine', 0.04, 0, 1800); },
  comboUp(tier: number) {
    const base = 392 * Math.pow(1.122, tier); // up a whole tone per tier
    [1, 1.26, 1.5, 2].forEach((k, i) => tone(base * k, 0.11, 'triangle', 0.08, i * 0.06));
  },
  comboBust() { tone(330, 0.3, 'sawtooth', 0.06, 0, 110); },
  land() { tone(90, 0.14, 'sine', 0.14, 0, 45); noise(0.12, 0.08, 0, 'lowpass', 500); },
  scrape() { noise(0.18, 0.09, 0, 'highpass', 2600); },
  horn() { tone(415, 0.16, 'square', 0.03); tone(523, 0.22, 'square', 0.03, 0.18); },

  // Stingers
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i === 3 ? 0.42 : 0.14, 'triangle', 0.12, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.16, 'sine', 0.09, i * 0.13)); },
};

'use client';

// Synthesized game audio — zero audio files, pure WebAudio.
// All gains kept low; every call is fire-and-forget and safe on the server.

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
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
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur = 0.25, gain = 0.14, delay = 0) {
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
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  src.connect(f).connect(g).connect(c.destination);
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

  // Stingers
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i === 3 ? 0.42 : 0.14, 'triangle', 0.12, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.16, 'sine', 0.09, i * 0.13)); },
};

'use client';

import { audioGraph } from './sfx';

// The continuous sound of a ride, all synthesized:
//   - the board rolling on tarmac and the wind, both rising with speed
//   - a boda engine while you're mounted
//   - the street: a low city rumble, the odd horn and bajaji putter
//   - music: an amapiano-flavoured groove (log drum, shaker, offbeat chords)
//     that adds layers as the combo climbs, so playing well sounds good
// Pausing the ride suspends it all; ending it tears it down.

const BPM = 112;
const STEP_S = 60 / BPM / 4;       // one 16th note
const LOOKAHEAD_S = 0.12;          // schedule this far ahead of the clock
const TICK_MS = 30;

// A minor-ish loop, one chord per bar: Am7 · Fmaj7 · C · G
const CHORDS = [
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 329.63],
  [196.0, 261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66, 392.0],
];
const BASS = [55.0, 43.65, 65.41, 49.0];     // roots, an octave down
const LOG_STEPS = [0, 3, 6, 10, 13];          // syncopated log drum
const LOG_NOTE = [1, 1, 1.5, 1, 2];           // relative to the bar's root
const CHORD_STEPS = [2, 7, 10];
const LEAD = [4, 3, 2, 3, 4, 5, 4, 2];        // chord-tone index walk for the top tier

export class RideAudio {
  private g = audioGraph();
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private roll?: { f: BiquadFilterNode; g: GainNode };
  private wind?: GainNode;
  private engine?: { a: OscillatorNode; b: OscillatorNode; g: GainNode };
  private city?: GainNode;
  private noiseBuf?: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private step = 0;
  private tier = 1;
  private nextHornAt = 0;
  private stopped = false;

  constructor() {
    const g = this.g;
    if (!g) return;
    const { ctx } = g;
    // Two seconds of white noise, looped by every noisy layer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    const loop = (filter: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = Math.random();
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(g.fx);
      src.start();
      this.sources.push(src);
      this.nodes.push(f, gain);
      return { f, g: gain };
    };
    this.roll = loop('bandpass', 400, 0.9);
    this.wind = loop('highpass', 1400).g;
    this.city = loop('lowpass', 170).g;
    this.city.gain.value = 0.05;

    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    a.connect(lp);
    b.connect(lp);
    lp.connect(eg).connect(g.fx);
    a.start();
    b.start();
    this.sources.push(a, b);
    this.nodes.push(lp, eg);
    this.engine = { a, b, g: eg };

    this.nextStepAt = ctx.currentTime + 0.1;
    this.nextHornAt = ctx.currentTime + 4 + Math.random() * 6;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Feed the ride state every frame or so. */
  update(speed01: number, onBoda: boolean, airborne: boolean) {
    const g = this.g;
    if (!g || this.stopped) return;
    const t = g.ctx.currentTime;
    const s = Math.max(0, Math.min(speed01, 1.3));
    if (this.roll) {
      this.roll.f.frequency.setTargetAtTime(250 + 1500 * s, t, 0.1);
      this.roll.g.gain.setTargetAtTime(onBoda || airborne ? 0 : 0.06 * s, t, airborne ? 0.03 : 0.12);
    }
    this.wind?.gain.setTargetAtTime(0.09 * s * s, t, 0.2);
    if (this.engine) {
      const f = 38 + 75 * s;
      this.engine.a.frequency.setTargetAtTime(f, t, 0.08);
      this.engine.b.frequency.setTargetAtTime(f * 0.503, t, 0.08);
      this.engine.g.gain.setTargetAtTime(onBoda ? 0.045 + 0.03 * s : 0, t, 0.1);
    }
  }

  /** Music layers follow the combo multiplier (1…5). */
  setTier(tier: number) {
    this.tier = Math.max(1, Math.min(5, tier));
  }

  pause() {
    void this.g?.ctx.suspend();
  }

  resume() {
    const g = this.g;
    if (!g) return;
    void g.ctx.resume();
    this.nextStepAt = Math.max(this.nextStepAt, g.ctx.currentTime + 0.05);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    const g = this.g;
    if (!g) return;
    void g.ctx.resume(); // effects still play after the ride (results stinger)
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    for (const n of this.nodes) n.disconnect();
  }

  /* ── Scheduler: the groove and the street, slightly ahead of the clock ── */

  private schedule() {
    const g = this.g;
    if (!g || this.stopped || g.ctx.state !== 'running') return;
    const now = g.ctx.currentTime;
    while (this.nextStepAt < now + LOOKAHEAD_S) {
      this.playStep(this.step, this.nextStepAt);
      this.step = (this.step + 1) % 64; // four bars
      this.nextStepAt += STEP_S;
    }
    if (now > this.nextHornAt) {
      if (Math.random() < 0.6) this.horn(now); else this.bajaji(now);
      this.nextHornAt = now + 5 + Math.random() * 9;
    }
  }

  private playStep(step: number, t: number) {
    const tier = this.tier;
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    // ×1: shaker and a soft kick — the street has a pulse
    this.shaker(t, inBar % 2 === 1 ? 0.035 : 0.018);
    if (inBar % 4 === 0) this.kick(t, tier >= 4 ? 0.5 : 0.28);
    // ×2: the log drum
    if (tier >= 2) {
      const i = LOG_STEPS.indexOf(inBar);
      if (i >= 0) this.logDrum(t, BASS[bar] * LOG_NOTE[i]);
    }
    // ×3: offbeat chord stabs
    if (tier >= 3 && CHORD_STEPS.includes(inBar)) this.chord(t, CHORDS[bar]);
    // ×4: clap on 2 and 4
    if (tier >= 4 && (inBar === 4 || inBar === 12)) this.clap(t);
    // ×5: a little lead line on top
    if (tier >= 5 && inBar % 2 === 0) {
      const chord = CHORDS[bar];
      const idx = LEAD[(inBar / 2) % LEAD.length];
      this.pluck(t, chord[idx % 4] * (idx >= 4 ? 4 : 2));
    }
  }

  private env(t: number, peak: number, attack: number, decay: number, dest: AudioNode) {
    const ctx = this.g!.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    gain.connect(dest);
    return gain;
  }

  private osc(t: number, type: OscillatorType, freq: number, dur: number, out: AudioNode, glideTo?: number) {
    const o = this.g!.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.6);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, vol: number) {
    this.osc(t, 'sine', 140, 0.22, this.env(t, vol, 0.004, 0.22, this.g!.music), 42);
  }

  private logDrum(t: number, freq: number) {
    // The amapiano log drum: a round, pitch-dropping bass hit
    const out = this.env(t, 0.42, 0.006, 0.32, this.g!.music);
    this.osc(t, 'sine', freq * 2, 0.34, out, freq);
    this.osc(t, 'triangle', freq * 4, 0.12, this.env(t, 0.06, 0.003, 0.08, this.g!.music), freq * 2);
  }

  private chord(t: number, freqs: number[]) {
    const ctx = this.g!.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.tier >= 5 ? 2600 : 1500;
    lp.connect(this.g!.music);
    const out = this.env(t, 0.07, 0.01, 0.28, lp);
    for (const f of freqs) this.osc(t, 'triangle', f, 0.3, out);
  }

  private pluck(t: number, freq: number) {
    this.osc(t, 'square', freq, 0.12, this.env(t, 0.025, 0.004, 0.12, this.g!.music));
  }

  private noiseHit(t: number, vol: number, dur: number, type: BiquadFilterType, freq: number, dest: AudioNode) {
    const ctx = this.g!.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, vol, 0.002, dur, dest));
    src.start(t, Math.random(), dur + 0.05);
  }

  private shaker(t: number, vol: number) {
    this.noiseHit(t, vol, 0.05, 'highpass', 7000, this.g!.music);
  }

  private clap(t: number) {
    this.noiseHit(t, 0.12, 0.12, 'bandpass', 1500, this.g!.music);
  }

  /* ── Street life ── */

  private horn(t: number) {
    // A two-tone daladala horn somewhere down the road
    const ctx = this.g!.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    lp.connect(pan).connect(this.g!.fx);
    const twice = Math.random() < 0.5;
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      const at = t + i * 0.32;
      this.osc(at, 'square', 392, 0.22, this.env(at, 0.035, 0.01, 0.22, lp));
      this.osc(at, 'square', 494, 0.22, this.env(at, 0.03, 0.01, 0.22, lp));
    }
  }

  private bajaji(t: number) {
    // A bajaji putters past: a fast run of low pops, panning across
    const ctx = this.g!.ctx;
    const pan = ctx.createStereoPanner();
    const from = Math.random() < 0.5 ? -0.9 : 0.9;
    pan.pan.setValueAtTime(from, t);
    pan.pan.linearRampToValueAtTime(-from, t + 1.6);
    pan.connect(this.g!.fx);
    for (let i = 0; i < 22; i++) {
      const at = t + i * 0.075;
      const k = Math.sin((i / 22) * Math.PI); // swells as it passes
      this.osc(at, 'triangle', 70 + Math.random() * 8, 0.05, this.env(at, 0.012 + 0.04 * k, 0.003, 0.05, pan));
    }
  }
}

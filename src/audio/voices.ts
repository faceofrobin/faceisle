
import { onsetFor } from './envelope';

export interface Send {
  dry: AudioNode;
  wet: AudioNode;
}

export interface StruckOpts {
  freq: number;
  peak: number;
  when: number;
  ring: number;
  pan?: number;
  bright?: number;
  wet?: number;
  mallet?: number;
}

export function struck(ctx: AudioContext, out: Send, o: StruckOpts): void {
  const bright = o.bright ?? 0.5;
  const t = o.when;
  const attack = onsetFor(o.peak);

  const B = 0.0006 + bright * 0.0038;
  const count = 4 + Math.round(bright * 2);
  const falloff = 2.2 - bright * 1.1;

  const sum = ctx.createGain();
  sum.gain.value = 1;

  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.Q.value = 0.4;
  const open = Math.min(16000, o.freq * (4 + bright * 11));
  const close = Math.min(16000, Math.max(o.freq * 2, 220));
  body.frequency.setValueAtTime(open, t);
  body.frequency.exponentialRampToValueAtTime(close, t + o.ring * 0.45);

  const pan = ctx.createStereoPanner();
  pan.pan.value = clampPan(o.pan ?? 0);

  sum.connect(body);
  body.connect(pan);
  pan.connect(out.dry);
  if (out.wet && (o.wet ?? 1) > 0) {
    const send = ctx.createGain();
    send.gain.value = o.wet ?? 0.55;
    pan.connect(send);
    send.connect(out.wet);
  }

  for (let i = 1; i <= count; i++) {
    const ratio = i * Math.sqrt(1 + B * i * i);
    const freq = o.freq * ratio;
    if (freq > 17000) break;

    const level = o.peak * Math.pow(i, -falloff);
    const life = o.ring * Math.pow(i, -0.85);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.detune.value = (Math.random() * 2 - 1) * 5;
    osc.frequency.setValueAtTime(freq * 1.003, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);

    const g = ctx.createGain();
    const floor = Math.max(level * 1e-4, 1e-5);
    g.gain.setValueAtTime(floor, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(floor, t + attack + life);

    osc.connect(g);
    g.connect(sum);
    osc.start(t);
    osc.stop(t + attack + life + 0.05);
  }

  const malletAmt = o.mallet ?? 0.55;
  if (malletAmt > 0.01) {
    const src = ctx.createBufferSource();
    src.buffer = strikeNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(14000, o.freq * (3 + bright * 3));
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    const peak = o.peak * 0.3 * malletAmt;
    g.gain.setValueAtTime(peak * 1e-3, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.0025);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + 0.03);
    src.connect(bp);
    bp.connect(g);
    g.connect(sum);
    src.start(t);
    src.stop(t + 0.05);
  }
}

export interface BowedOpts {
  freq: number;
  peak: number;
  when: number;
  attack: number;
  hold: number;
  release: number;
  pan?: number;
  wet?: number;
  edge?: number;
}

export function bowed(ctx: AudioContext, out: Send, o: BowedOpts): void {
  const t = o.when;
  const edge = o.edge ?? 0.25;

  const gain = ctx.createGain();
  const floor = Math.max(o.peak * 1e-4, 1e-5);
  gain.gain.setValueAtTime(floor, t);
  gain.gain.linearRampToValueAtTime(o.peak, t + o.attack);
  gain.gain.setValueAtTime(o.peak, t + o.attack + o.hold);
  gain.gain.exponentialRampToValueAtTime(floor, t + o.attack + o.hold + o.release);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(15000, o.freq * (5 + edge * 8));
  lp.Q.value = 0.5;

  const pan = ctx.createStereoPanner();
  pan.pan.value = clampPan(o.pan ?? 0);

  gain.connect(lp);
  lp.connect(pan);
  pan.connect(out.dry);
  if (out.wet) {
    const send = ctx.createGain();
    send.gain.value = o.wet ?? 0.6;
    pan.connect(send);
    send.connect(out.wet);
  }

  const end = t + o.attack + o.hold + o.release + 0.1;
  for (const [detune, level, type] of [
    [0, 1, 'sine'],
    [-6, 0.5, 'sine'],
    [7, edge * 0.6, 'triangle'],
  ] as [number, number, OscillatorType][]) {
    if (level < 0.01) continue;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = o.freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g);
    g.connect(gain);
    osc.start(t);
    osc.stop(end);
  }
}

let strikeBuf: AudioBuffer | null = null;
function strikeNoise(ctx: AudioContext): AudioBuffer {
  if (strikeBuf && strikeBuf.sampleRate === ctx.sampleRate) return strikeBuf;
  const len = Math.ceil(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  strikeBuf = buf;
  return buf;
}

export function clampPan(p: number): number {
  return Math.max(-0.92, Math.min(0.92, p));
}

export function place(
  dx: number,
  dz: number,
  yaw: number,
  range: number,
): { pan: number; near: number } {
  const dist = Math.hypot(dx, dz);
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const pan = dist > 0.001 ? clampPan((right / dist) * 0.85) : 0;
  const near = Math.max(0, 1 - dist / range);
  return { pan, near: near * near };
}

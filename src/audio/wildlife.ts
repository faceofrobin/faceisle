
import { Send, clampPan } from './voices';

export type Ground = 'sand' | 'grass' | 'rock' | 'snow' | 'water';

interface Common {
  when: number;
  pan?: number;
  near?: number;
}


export type BirdKind = 'warble' | 'trill' | 'call';

export function bird(
  ctx: AudioContext,
  out: Send,
  kind: BirdKind,
  o: Common & { peak: number },
): void {
  const near = o.near ?? 1;
  const peak = o.peak * (0.25 + near * 0.75);
  const pan = clampPan(o.pan ?? 0);

  const throat = ctx.createBiquadFilter();
  throat.type = 'bandpass';
  throat.frequency.value = 2600 + near * 900;
  throat.Q.value = 1.1;

  const airLoss = ctx.createBiquadFilter();
  airLoss.type = 'lowpass';
  airLoss.frequency.value = 900 + near * near * 9000;

  const p = ctx.createStereoPanner();
  p.pan.value = pan * (0.4 + near * 0.6);

  const send = ctx.createGain();
  send.gain.value = 0.75 - near * 0.45;

  throat.connect(airLoss);
  airLoss.connect(p);
  p.connect(out.dry);
  p.connect(send);
  send.connect(out.wet);

  const notes =
    kind === 'trill' ? 5 + Math.floor(Math.random() * 4)
    : kind === 'warble' ? 2 + Math.floor(Math.random() * 2)
    : 1 + Math.floor(Math.random() * 2);

  const base = 2200 + Math.random() * 1500;
  let t = o.when;

  for (let i = 0; i < notes; i++) {
    const dur =
      kind === 'trill' ? 0.035 + Math.random() * 0.02
      : kind === 'warble' ? 0.13 + Math.random() * 0.1
      : 0.07 + Math.random() * 0.05;

    const f0 = base * (1 + (Math.random() - 0.5) * 0.22);
    const f1 =
      kind === 'warble' ? f0 * (0.62 + Math.random() * 0.22)
      : kind === 'trill' ? f0 * (0.97 + Math.random() * 0.06)
      : f0 * (1.18 + Math.random() * 0.3);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);

    const harm = ctx.createOscillator();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(f0 * 2, t);
    harm.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.16;

    const vib = ctx.createOscillator();
    vib.frequency.value = 22 + Math.random() * 16;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = kind === 'warble' ? 26 : 12;
    vib.connect(vibDepth);
    vibDepth.connect(osc.detune);

    const g = ctx.createGain();
    const floor = Math.max(peak * 1e-3, 1e-5);
    const atk = Math.min(0.02, dur * 0.3);
    g.gain.setValueAtTime(floor, t);
    g.gain.linearRampToValueAtTime(peak * (i === 0 ? 1 : 0.82), t + atk);
    g.gain.exponentialRampToValueAtTime(floor, t + dur);

    osc.connect(g);
    harm.connect(harmGain);
    harmGain.connect(g);
    g.connect(throat);

    osc.start(t);
    harm.start(t);
    vib.start(t);
    const end = t + dur + 0.02;
    osc.stop(end);
    harm.stop(end);
    vib.stop(end);

    t += dur + (kind === 'trill' ? 0.018 : 0.06 + Math.random() * 0.11);
  }
}


export function cricket(ctx: AudioContext, out: Send, o: Common & { peak: number }): void {
  const near = o.near ?? 1;
  const peak = o.peak * (0.3 + near * 0.7);
  const p = ctx.createStereoPanner();
  p.pan.value = clampPan(o.pan ?? 0);
  p.connect(out.dry);
  const send = ctx.createGain();
  send.gain.value = 0.3;
  p.connect(send);
  send.connect(out.wet);

  const f = 4150 + Math.random() * 550;
  let t = o.when;
  const pulses = 3 + Math.floor(Math.random() * 3);

  for (let i = 0; i < pulses; i++) {
    const g = ctx.createGain();
    const floor = Math.max(peak * 1e-3, 1e-6);
    g.gain.setValueAtTime(floor, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(floor, t + 0.036);
    g.connect(p);

    for (const detune of [0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = detune;
      const vg = ctx.createGain();
      vg.gain.value = detune === 0 ? 1 : 0.7;
      osc.connect(vg);
      vg.connect(g);
      osc.start(t);
      osc.stop(t + 0.045);
    }
    t += 0.045 + Math.random() * 0.012;
  }
}


export function frog(ctx: AudioContext, out: Send, o: Common & { peak: number }): void {
  const near = o.near ?? 1;
  const peak = o.peak * (0.3 + near * 0.7);
  const t = o.when;

  const p = ctx.createStereoPanner();
  p.pan.value = clampPan(o.pan ?? 0);
  p.connect(out.dry);
  const send = ctx.createGain();
  send.gain.value = 0.5;
  p.connect(send);
  send.connect(out.wet);

  const form = ctx.createBiquadFilter();
  form.type = 'bandpass';
  form.frequency.value = 420;
  form.Q.value = 2.2;
  form.connect(p);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(280 + Math.random() * 90, t);
  osc.frequency.exponentialRampToValueAtTime(120 + Math.random() * 40, t + 0.15);

  const g = ctx.createGain();
  const floor = Math.max(peak * 1e-3, 1e-6);
  g.gain.setValueAtTime(floor, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.018);
  g.gain.exponentialRampToValueAtTime(floor, t + 0.19);

  const rip = ctx.createOscillator();
  rip.frequency.value = 34 + Math.random() * 14;
  const ripDepth = ctx.createGain();
  ripDepth.gain.value = peak * 0.4;
  rip.connect(ripDepth);
  ripDepth.connect(g.gain);

  osc.connect(g);
  g.connect(form);
  osc.start(t);
  rip.start(t);
  osc.stop(t + 0.24);
  rip.stop(t + 0.24);
}


interface SurfaceSpec {
  thudHz: number;
  thudLevel: number;
  hz: number;
  q: number;
  level: number;
  decay: number;
  grains: number;
}

const SURFACES: Record<Ground, SurfaceSpec> = {
  sand: { thudHz: 190, thudLevel: 0.5, hz: 760, q: 0.5, level: 0.34, decay: 0.1, grains: 1 },
  grass: { thudHz: 165, thudLevel: 0.62, hz: 1500, q: 0.8, level: 0.3, decay: 0.13, grains: 3 },
  rock: { thudHz: 230, thudLevel: 0.75, hz: 2500, q: 1.4, level: 0.4, decay: 0.07, grains: 2 },
  snow: { thudHz: 145, thudLevel: 0.45, hz: 1150, q: 3.2, level: 0.34, decay: 0.17, grains: 0 },
  water: { thudHz: 210, thudLevel: 0.5, hz: 900, q: 0.6, level: 0.55, decay: 0.2, grains: 0 },
};

export function footstep(
  ctx: AudioContext,
  out: Send,
  ground: Ground,
  o: Common & { peak: number; noise: AudioBuffer },
): void {
  const s = SURFACES[ground];
  const t = o.when;
  const vary = 0.82 + Math.random() * 0.36;

  const p = ctx.createStereoPanner();
  p.pan.value = clampPan(o.pan ?? 0);
  p.connect(out.dry);
  const send = ctx.createGain();
  send.gain.value = ground === 'rock' ? 0.5 : 0.22;
  p.connect(send);
  send.connect(out.wet);

  burst(ctx, o.noise, p, {
    type: 'lowpass',
    hz: s.thudHz * vary,
    q: 0.7,
    peak: o.peak * s.thudLevel * vary,
    attack: 0.004,
    decay: 0.085,
    when: t,
  });

  burst(ctx, o.noise, p, {
    type: 'bandpass',
    hz: s.hz * vary,
    q: s.q,
    peak: o.peak * s.level * vary,
    attack: 0.005,
    decay: s.decay * vary,
    when: t + 0.008,
  });

  for (let i = 0; i < s.grains; i++) {
    if (Math.random() > 0.55) continue;
    burst(ctx, o.noise, p, {
      type: 'bandpass',
      hz: 2200 + Math.random() * 3400,
      q: 2.5,
      peak: o.peak * 0.1 * Math.random(),
      attack: 0.002,
      decay: 0.025,
      when: t + 0.015 + Math.random() * 0.06,
    });
  }

  if (ground === 'water') {
    const sw = ctx.createBufferSource();
    sw.buffer = o.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200 * vary, t);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const peak = o.peak * 0.5 * vary;
    g.gain.setValueAtTime(peak * 1e-3, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(peak * 1e-3, t + 0.3);
    sw.connect(bp);
    bp.connect(g);
    g.connect(p);
    sw.start(t, Math.random() * 0.4);
    sw.stop(t + 0.34);

    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.6) continue;
      const dt = 0.14 + Math.random() * 0.22;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f = 900 + Math.random() * 1400;
      osc.frequency.setValueAtTime(f * 0.7, t + dt);
      osc.frequency.exponentialRampToValueAtTime(f, t + dt + 0.035);
      const dg = ctx.createGain();
      const dp = o.peak * 0.14 * Math.random();
      dg.gain.setValueAtTime(Math.max(dp * 1e-3, 1e-6), t + dt);
      dg.gain.linearRampToValueAtTime(dp, t + dt + 0.004);
      dg.gain.exponentialRampToValueAtTime(Math.max(dp * 1e-3, 1e-6), t + dt + 0.055);
      osc.connect(dg);
      dg.connect(p);
      osc.start(t + dt);
      osc.stop(t + dt + 0.07);
    }
  }
}

interface BurstOpts {
  type: BiquadFilterType;
  hz: number;
  q: number;
  peak: number;
  attack: number;
  decay: number;
  when: number;
}

function burst(
  ctx: AudioContext,
  noise: AudioBuffer,
  dest: AudioNode,
  o: BurstOpts,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = Math.min(16000, o.hz);
  f.Q.value = o.q;
  const g = ctx.createGain();
  const floor = Math.max(o.peak * 1e-3, 1e-6);
  g.gain.setValueAtTime(floor, o.when);
  g.gain.linearRampToValueAtTime(o.peak, o.when + o.attack);
  g.gain.exponentialRampToValueAtTime(floor, o.when + o.attack + o.decay);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(o.when, Math.random() * (noise.duration - o.decay - 0.1));
  src.stop(o.when + o.attack + o.decay + 0.05);
}

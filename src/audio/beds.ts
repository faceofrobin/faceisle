
import { brownNoise, pinkNoise } from './dsp';

const SWELL_HZ = [0.083, 0.052, 0.031];

export class Surf {
  private ctx: AudioContext;
  private body: GainNode;
  private foam: GainNode;
  private bodyFilter: BiquadFilterNode;

  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, foamNoise: AudioBuffer) {
    this.ctx = ctx;

    const swell = ctx.createGain();
    swell.gain.value = 1 / SWELL_HZ.length;
    for (const hz of SWELL_HZ) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      lfo.connect(swell);
      lfo.start();
    }

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    this.bodyFilter = ctx.createBiquadFilter();
    this.bodyFilter.type = 'lowpass';
    this.bodyFilter.frequency.value = 320;
    this.bodyFilter.Q.value = 0.6;

    const bodySwell = ctx.createGain();
    bodySwell.gain.value = 0.55;
    const bodyDepth = ctx.createGain();
    bodyDepth.gain.value = 0.42;
    swell.connect(bodyDepth);
    bodyDepth.connect(bodySwell.gain);

    this.body = ctx.createGain();
    this.body.gain.value = 0;

    src.connect(this.bodyFilter);
    this.bodyFilter.connect(bodySwell);
    bodySwell.connect(this.body);
    this.body.connect(dest);
    src.start();

    const lag = ctx.createDelay(6);
    lag.delayTime.value = 3.1;
    swell.connect(lag);

    const gate = ctx.createWaveShaper();
    gate.curve = crestCurve();
    lag.connect(gate);

    const foamSwell = ctx.createGain();
    foamSwell.gain.value = 0.05;
    const foamDepth = ctx.createGain();
    foamDepth.gain.value = 0.95;
    gate.connect(foamDepth);
    foamDepth.connect(foamSwell.gain);

    this.foam = ctx.createGain();
    this.foam.gain.value = 0;
    foamSwell.connect(this.foam);
    this.foam.connect(dest);

    const foamSrc = ctx.createBufferSource();
    foamSrc.buffer = foamNoise;
    foamSrc.loop = true;
    for (const [hz, pan, delay] of [
      [1020, -0.62, 0],
      [1380, 0.62, 0.013],
    ] as [number, number, number][]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = hz;
      bp.Q.value = 0.55;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      if (delay > 0) {
        const d = ctx.createDelay(0.05);
        d.delayTime.value = delay;
        foamSrc.connect(d);
        d.connect(bp);
      } else {
        foamSrc.connect(bp);
      }
      bp.connect(p);
      p.connect(foamSwell);
    }
    foamSrc.start();
  }

  update(shore: number, wading: number): void {
    const t = this.ctx.currentTime;
    const near = Math.max(shore, wading);
    this.body.gain.setTargetAtTime(Math.pow(near, 0.6) * 0.115, t, 1.4);
    this.foam.gain.setTargetAtTime(Math.pow(near, 2.1) * 0.075, t, 1.1);
    this.bodyFilter.frequency.setTargetAtTime(300 + near * 420 - wading * 180, t, 1.4);
  }
}

function crestCurve(): Float32Array<ArrayBuffer> {
  const n = 257;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = x > 0 ? x * x : 0;
  }
  return curve;
}

export class Wind {
  private ctx: AudioContext;
  private airFilter: BiquadFilterNode;
  private air: GainNode;
  private gust: GainNode;
  private leaves: GainNode;
  private leafFlutter: BiquadFilterNode;
  private gustTimer = 6 + Math.random() * 10;
  private strength = 0;

  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start();

    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass';
    this.airFilter.frequency.value = 420;
    this.airFilter.Q.value = 0.5;

    for (const [hz, depth] of [
      [0.037, 190],
      [0.019, 120],
    ] as [number, number][]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g);
      g.connect(this.airFilter.frequency);
      lfo.start();
    }

    this.gust = ctx.createGain();
    this.gust.gain.value = 1;
    this.gust.connect(dest);

    this.air = ctx.createGain();
    this.air.gain.value = 0;
    src.connect(this.airFilter);
    this.airFilter.connect(this.air);
    this.air.connect(this.gust);

    this.leafFlutter = ctx.createBiquadFilter();
    this.leafFlutter.type = 'bandpass';
    this.leafFlutter.frequency.value = 1150;
    this.leafFlutter.Q.value = 1.1;

    const flutter = ctx.createOscillator();
    flutter.frequency.value = 0.11;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 380;
    flutter.connect(flutterDepth);
    flutterDepth.connect(this.leafFlutter.frequency);
    flutter.start();

    this.leaves = ctx.createGain();
    this.leaves.gain.value = 0;
    src.connect(this.leafFlutter);
    this.leafFlutter.connect(this.leaves);
    this.leaves.connect(this.gust);
  }

  update(dt: number, exposure: number, trees: number, speed: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const want = Math.min(1, (speed / 5.5) * (0.35 + exposure * 0.65));
    this.strength += (want - this.strength) * Math.min(1, dt * 0.4);

    this.air.gain.setTargetAtTime(0.004 + this.strength * 0.026, t, 1.5);
    this.leaves.gain.setTargetAtTime(trees * (0.006 + this.strength * 0.02), t, 1.5);
    this.airFilter.frequency.setTargetAtTime(360 + exposure * 520 + this.strength * 300, t, 2.5);

    this.gustTimer -= dt * (0.5 + this.strength);
    if (this.gustTimer <= 0) {
      this.gustTimer = 7 + Math.random() * 16;
      const rise = 1.4 + Math.random() * 2.2;
      const fall = 3 + Math.random() * 4;
      const peak = 1 + (0.7 + Math.random() * 1.5) * this.strength;
      const g = this.gust.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, 0.01), t);
      g.linearRampToValueAtTime(peak, t + rise);
      g.linearRampToValueAtTime(1, t + rise + fall);
    }
  }
}

export class NightChorus {
  private ctx: AudioContext;
  private out: GainNode;

  constructor(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start();

    let node: AudioNode = src;
    for (const hz of [4300, 4450]) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = hz;
      bp.Q.value = 5.5;
      node.connect(bp);
      node = bp;
    }

    const sway = this.ctx.createGain();
    sway.gain.value = 0.7;
    for (const [hz, depth] of [
      [0.047, 0.22],
      [0.081, 0.14],
    ] as [number, number][]) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = hz;
      const g = this.ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g);
      g.connect(sway.gain);
      lfo.start();
    }

    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    node.connect(sway);
    sway.connect(this.out);
    this.out.connect(dest);
  }

  update(night: number, warmth: number): void {
    this.out.gain.setTargetAtTime(
      night * (0.004 + warmth * 0.005),
      this.ctx.currentTime,
      3,
    );
  }
}

export function makeBedNoise(ctx: AudioContext): {
  brown: AudioBuffer;
  pink: AudioBuffer;
} {
  return { brown: brownNoise(ctx, 11), pink: pinkNoise(ctx, 13) };
}

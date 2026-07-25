
import { midiToHz } from './theory';

const SPREAD = [0, -0.18, 0.28, -0.46, 0.5];
const BREATH_HZ = [0.021, 0.029, 0.037, 0.017, 0.043];
const WEIGHT = [1, 0.62, 0.5, 0.42, 0.34];

interface Voice {
  osc: OscillatorNode;
  fine: OscillatorNode;
  lp: BiquadFilterNode;
  breathe: GainNode;
  level: GainNode;
  midi: number;
  weight: number;
}

export class Drone {
  private ctx: AudioContext;
  private voices: Voice[] = [];
  private out: GainNode;
  private level = 0;
  private bright = 0.5;

  constructor(ctx: AudioContext, dest: AudioNode, wet: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);

    const send = ctx.createGain();
    send.gain.value = 0.75;
    this.out.connect(send);
    send.connect(wet);

    for (let i = 0; i < SPREAD.length; i++) this.voices.push(this.makeVoice(i));
  }

  setLevel(level: number, seconds = 6): void {
    this.level = level;
    this.out.gain.setTargetAtTime(level, this.ctx.currentTime, seconds / 3);
  }

  setBright(b: number): void {
    if (Math.abs(b - this.bright) < 0.01) return;
    this.bright = b;
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      const base = midiToHz(v.midi);
      v.lp.frequency.setTargetAtTime(
        Math.min(9000, base * (2.4 + b * 6)),
        t,
        3,
      );
    }
  }

  setChord(midis: number[], immediate = false): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    let moved = 0;

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const target = midis[i];
      if (target === undefined || target === v.midi) continue;

      if (immediate) {
        const hz = midiToHz(target);
        v.osc.frequency.value = hz;
        v.fine.frequency.value = hz;
        v.lp.frequency.value = Math.min(9000, hz * (2.4 + this.bright * 6));
        v.midi = target;
        continue;
      }

      const delay = moved * (2.4 + Math.random() * 2.2);
      const down = 5 + Math.random() * 3.5;
      const up = 8 + Math.random() * 5;
      moved++;

      const g = v.level.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(g.value, 1e-4), now + delay);
      g.exponentialRampToValueAtTime(1e-4, now + delay + down);

      const hz = midiToHz(target);
      v.osc.frequency.setValueAtTime(hz, now + delay + down + 0.05);
      v.fine.frequency.setValueAtTime(hz, now + delay + down + 0.05);
      v.lp.frequency.setValueAtTime(
        Math.min(9000, hz * (2.4 + this.bright * 6)),
        now + delay + down + 0.05,
      );

      g.setValueAtTime(1e-4, now + delay + down + 0.1);
      g.exponentialRampToValueAtTime(v.weight, now + delay + down + 0.1 + up);
      v.midi = target;
    }
  }

  get currentLevel(): number {
    return this.level;
  }

  private makeVoice(i: number): Voice {
    const ctx = this.ctx;
    const midi = 45;
    const hz = midiToHz(midi);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const fine = ctx.createOscillator();
    fine.type = 'sine';
    fine.frequency.value = hz;
    fine.detune.value = 5 + Math.random() * 5;

    const fineGain = ctx.createGain();
    fineGain.gain.value = 0.55;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = hz * 5;
    lp.Q.value = 0.4;

    const breathe = ctx.createGain();
    breathe.gain.value = 0.74;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = BREATH_HZ[i];
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.24;
    lfo.connect(lfoDepth);
    lfoDepth.connect(breathe.gain);

    const swayLfo = ctx.createOscillator();
    swayLfo.frequency.value = BREATH_HZ[i] * 0.41;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = hz * 0.9;
    swayLfo.connect(swayDepth);
    swayDepth.connect(lp.frequency);

    const level = ctx.createGain();
    level.gain.value = WEIGHT[i];

    const pan = ctx.createStereoPanner();
    pan.pan.value = SPREAD[i];

    osc.connect(lp);
    fine.connect(fineGain);
    fineGain.connect(lp);
    lp.connect(breathe);
    breathe.connect(level);
    level.connect(pan);
    pan.connect(this.out);

    osc.start();
    fine.start();
    lfo.start();
    swayLfo.start();

    return { osc, fine, lp, breathe, level, midi, weight: WEIGHT[i] };
  }
}

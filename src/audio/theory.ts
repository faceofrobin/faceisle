
export const TONIC = 45;

export function midiToHz(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export interface Colour {
  t: number;
  name: string;
  scale: number[];
  voicing: number[];
  bright: number;
}

export const COLOURS: Colour[] = [
  {
    t: 0.0,
    name: 'deep night',
    scale: [0, 2, 3, 5, 7, 10],
    voicing: [0, 12, 19, 24, 27],
    bright: 0.06,
  },
  {
    t: 0.19,
    name: 'first light',
    scale: [0, 2, 5, 7, 10],
    voicing: [0, 12, 19, 26, 31],
    bright: 0.2,
  },
  {
    t: 0.27,
    name: 'sunrise',
    scale: [0, 2, 4, 7, 9],
    voicing: [0, 12, 19, 28, 31],
    bright: 0.7,
  },
  {
    t: 0.36,
    name: 'morning',
    scale: [0, 2, 4, 7, 9],
    voicing: [0, 12, 19, 26, 33],
    bright: 0.88,
  },
  {
    t: 0.5,
    name: 'noon',
    scale: [0, 2, 4, 7, 9, 11],
    voicing: [0, 12, 19, 28, 35],
    bright: 1.0,
  },
  {
    t: 0.64,
    name: 'afternoon',
    scale: [0, 2, 4, 7, 9, 10],
    voicing: [0, 12, 19, 28, 34],
    bright: 0.78,
  },
  {
    t: 0.74,
    name: 'sunset',
    scale: [0, 2, 3, 5, 7, 9],
    voicing: [0, 12, 19, 27, 33],
    bright: 0.42,
  },
  {
    t: 0.82,
    name: 'dusk',
    scale: [0, 2, 3, 5, 7, 8],
    voicing: [0, 12, 19, 27, 32],
    bright: 0.16,
  },
  {
    t: 0.9,
    name: 'night',
    scale: [0, 2, 3, 5, 7, 10],
    voicing: [0, 12, 19, 24, 27],
    bright: 0.06,
  },
];

export interface KeyState {
  colour: Colour;
  next: Colour;
  blend: number;
  bright: number;
  ladder: number[];
  restingPoints: number[];
}

export function colourAt(t: number): { a: Colour; b: Colour; k: number } {
  const phase = ((t % 1) + 1) % 1;
  let a = COLOURS[COLOURS.length - 1];
  let b = COLOURS[0];
  for (let i = 0; i < COLOURS.length - 1; i++) {
    if (phase >= COLOURS[i].t && phase < COLOURS[i + 1].t) {
      a = COLOURS[i];
      b = COLOURS[i + 1];
      break;
    }
  }
  const span = b.t > a.t ? b.t - a.t : 1 - a.t + b.t;
  const local = phase >= a.t ? phase - a.t : phase + 1 - a.t;
  return { a, b, k: span > 0 ? Math.min(1, local / span) : 0 };
}

export function keyAt(t: number): KeyState {
  const { a, b, k } = colourAt(t);
  const blur = k > 0.62 ? (k - 0.62) / 0.38 : 0;
  const degrees = new Set(a.scale);
  if (blur > 0) for (const d of b.scale) if (Math.random() < blur) degrees.add(d);

  const scale = [...degrees].sort((x, y) => x - y);
  const ladder: number[] = [];
  for (let oct = 0; oct < 5; oct++) {
    for (const d of scale) ladder.push(TONIC + 12 + oct * 12 + d);
  }

  const voicing = k < 0.5 ? a.voicing : b.voicing;
  const tones = new Set(voicing.map((v) => ((v % 12) + 12) % 12));
  const restingPoints: number[] = [];
  for (let i = 0; i < ladder.length; i++) {
    if (tones.has(((ladder[i] - TONIC) % 12 + 12) % 12)) restingPoints.push(i);
  }

  return {
    colour: a,
    next: b,
    blend: k,
    bright: a.bright + (b.bright - a.bright) * k,
    ladder,
    restingPoints,
  };
}

export interface Note {
  midi: number;
  at: number;
  vel: number;
  ring: number;
}

export interface Phrase {
  notes: Note[];
  seconds: number;
}

export class Melody {
  private at = -1;
  private centre = 0.5;
  private drift = Math.random() * Math.PI * 2;
  private sinceLeap = 0;

  wander(dt: number, target: number): void {
    this.drift += dt * 0.06;
    const breathe = Math.sin(this.drift) * 0.12 + Math.sin(this.drift * 0.37) * 0.07;
    const want = Math.max(0.08, Math.min(0.92, target + breathe));
    this.centre += (want - this.centre) * Math.min(1, dt * 0.09);
  }

  next(key: KeyState, energy: number): Phrase {
    const n = key.ladder.length;
    const centreIdx = Math.round(this.centre * (n - 1));
    if (this.at < 0 || this.at >= n) this.at = centreIdx;
    else if (Math.abs(this.at - centreIdx) > 8) {
      this.at += Math.sign(centreIdx - this.at) * 5;
    }

    if (Math.random() < 0.65) {
      const nudge = (1 + Math.floor(Math.random() * 2)) * (Math.random() < 0.5 ? 1 : -1);
      this.at = Math.max(0, Math.min(n - 1, this.at + nudge));
    }

    const len = 2 + Math.floor(Math.random() * (1 + Math.round(energy * 3)));
    const rise = Math.random();
    const bias = rise < 0.3 ? 1 : rise < 0.6 ? -1 : 0;

    const notes: Note[] = [];
    let at = 0;
    let gap = 0.62 + Math.random() * 0.5;

    for (let i = 0; i < len; i++) {
      const last = i === len - 1;

      if (i > 0) {
        let step = this.pickStep(bias, i / len);
        if (this.sinceLeap === 0 && Math.abs(step) > 2) step = 0;
        if (this.sinceLeap === 1) step = -Math.sign(step || 1) * (1 + Math.floor(Math.random() * 2));
        this.sinceLeap = Math.abs(step) > 2 ? 0 : Math.min(2, this.sinceLeap + 1);

        const next = this.at + step;
        const reach = 6;
        this.at = next < centreIdx - reach || next > centreIdx + reach
          ? this.at - step
          : next;
        this.at = Math.max(0, Math.min(n - 1, this.at));
      }

      if (last) this.at = nearest(key.restingPoints, this.at);

      const shape = i === 0 ? 1 : last ? 0.52 : 0.72 + Math.random() * 0.16;
      notes.push({
        midi: key.ladder[this.at],
        at,
        vel: shape * (0.62 + energy * 0.38),
        ring: last ? 5.5 + Math.random() * 2.5 : 3.2 + Math.random() * 1.4,
      });

      at += gap;
      gap *= 1.1 + Math.random() * 0.14;
    }

    const tail = notes[notes.length - 1];
    return { notes, seconds: tail.at + tail.ring };
  }

  get position(): number {
    return this.at;
  }

  private pickStep(bias: number, through: number): number {
    const r = Math.random();
    const leapChance = 0.13 * (1 - through);
    let size: number;
    if (r < leapChance) size = 3 + Math.floor(Math.random() * 2);
    else if (r < 0.45) size = 1;
    else if (r < 0.8) size = 2;
    else size = 1;

    if (bias === 0) return Math.random() < 0.5 ? size : -size;
    return Math.random() < 0.78 ? size * bias : -size * bias;
  }
}

function nearest(points: number[], idx: number): number {
  if (points.length === 0) return idx;
  let best = points[0];
  let bestD = Math.abs(best - idx);
  for (const p of points) {
    const d = Math.abs(p - idx);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}


export function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function pinkNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return loopable(ctx, seconds, () => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    return () => {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.108;
      b6 = w * 0.115926;
      return Math.max(-1, Math.min(1, out));
    };
  });
}

export function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return loopable(ctx, seconds, () => {
    let last = 0;
    return () => {
      last += (Math.random() * 2 - 1) * 0.055;
      if (last > 1) last = 1;
      else if (last < -1) last = -1;
      return last * 0.9;
    };
  });
}

function loopable(
  ctx: BaseAudioContext,
  seconds: number,
  makeGen: () => () => number,
): AudioBuffer {
  const fade = Math.floor(ctx.sampleRate * 0.25);
  const outLen = Math.ceil(ctx.sampleRate * seconds);
  const gen = makeGen();
  const raw = new Float32Array(outLen + fade);
  for (let i = 0; i < raw.length; i++) raw[i] = gen();

  const buf = ctx.createBuffer(1, outLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  data.set(raw.subarray(0, outLen));
  for (let i = 0; i < fade; i++) {
    const f = i / fade;
    const a = Math.cos(f * Math.PI * 0.5);
    const b = Math.sin(f * Math.PI * 0.5);
    data[i] = raw[outLen + i] * a + data[i] * b;
  }
  return buf;
}

export interface SpaceSpec {
  seconds: number;
  decay: number;
  predelayMs: number;
  openHz: number;
  closeHz: number;
  earlies: number;
  width: number;
}

export function makeSpace(ctx: BaseAudioContext, spec: SpaceSpec): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.ceil(sr * spec.seconds);
  const pre = Math.floor((spec.predelayMs / 1000) * sr);
  const buf = ctx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const side = ch === 0 ? -1 : 1;

    let lp = 0;
    for (let i = pre; i < len; i++) {
      const age = (i - pre) / (len - pre);
      const cut = spec.openHz * Math.pow(spec.closeHz / spec.openHz, age);
      const a = Math.exp((-2 * Math.PI * cut) / sr);
      lp += (1 - a) * ((Math.random() * 2 - 1) - lp);
      data[i] = lp * Math.pow(1 - age, spec.decay);
    }

    for (let e = 0; e < spec.earlies; e++) {
      const frac = (e + Math.random()) / spec.earlies;
      const skew = 1 + side * spec.width * 0.32 * (0.4 + Math.random());
      const at = pre + Math.floor(frac * frac * 0.11 * sr * skew);
      if (at >= len) continue;
      const amp = (1 - frac) * 0.55 * (0.5 + Math.random() * 0.5);
      data[at] += amp * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return buf;
}

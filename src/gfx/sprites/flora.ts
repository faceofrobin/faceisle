import { Rng, hash2 } from '../../util/random';
import { Blob, Painter, PixelSprite, RGB, inBlobs, rgb } from './painter';
import { TREE_COLORS } from './trees';

export function makeBushTexture(rng: Rng): PixelSprite {
  const w = 28;
  const h = 18;
  const p = new Painter(w, h);
  const col = rng.chance(0.5) ? TREE_COLORS.green : TREE_COLORS.lime;
  const salt = rng.int(0, 10000);
  const sx = rng.range(1.0, 1.4);
  const blobs: Blob[] = [];
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const cx = w / 2 + rng.range(-8, 8);
    const cy = h - 6 + rng.range(-3, 2);
    const r = Math.min(rng.range(4, 7), (cx - 1) / (1.12 * sx), (w - 2 - cx) / (1.12 * sx), (cy - 1) / 1.12);
    blobs.push({ cx, cy, r });
  }
  const berry: RGB | null = rng.chance(0.28) ? rgb(0xd85c50) : rng.chance(0.18) ? rgb(0xf5efd8) : null;
  const leaf = rng.pick(col.leaf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBlobs(blobs, x, y, salt, 0.22, sx)) continue;
      const fruit = berry && y < h - 3 && hash2(x * 7 + salt, y * 3 - salt) < 0.05;
      p.set(x, y, fruit ? berry : leaf);
    }
  }
  return p.toSprite();
}

export function makeReedTexture(rng: Rng): PixelSprite {
  const w = 16;
  const h = 24;
  const p = new Painter(w, h);
  const stalk = rng.pick([rgb(0x5d8a46), rgb(0x6f9c52), rgb(0x7fae5c)]);
  const head = rgb(0x6b4a2e);
  const tip = rgb(0xd8c9a0);
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const x0 = rng.int(2, w - 2);
    const tall = rng.int(12, h - 2);
    const drift = rng.range(-0.14, 0.14);
    for (let j = 0; j < tall; j++) p.set(x0 + j * drift, h - 1 - j, stalk);
    if (rng.chance(0.5) && tall > 15) {
      const hx = Math.round(x0 + (tall - 4) * drift);
      const hy = h - 1 - tall;
      p.set(hx, hy, tip);
      p.set(hx, hy + 1, tip);
      for (let k = 0; k < 5; k++) {
        p.set(hx, hy + 2 + k, head);
        p.set(hx + 1, hy + 2 + k, head);
      }
    }
  }
  return p.toSprite();
}

export function makeMushroomTexture(rng: Rng): PixelSprite {
  const w = 14;
  const h = 10;
  const p = new Painter(w, h);
  const red = rng.chance(0.6);
  const cap = red ? rgb(0xc94f43) : rgb(0xa8794e);
  const fleck = rgb(0xfff4ea);
  const stem = rgb(0xe8dcc0);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const cx = 2 + Math.round(((i + 0.5) * (w - 4)) / n) + rng.int(-1, 2);
    const capHw = rng.int(2, 4);
    const capBase = h - rng.int(4, 7);
    for (let y = capBase; y < h - 1; y++) {
      p.set(cx, y, stem);
      if (capHw > 2) p.set(cx - 1, y, stem);
    }
    const capH = 3;
    for (let dy = 0; dy < capH; dy++) {
      const rw = Math.max(1, Math.round(capHw * Math.sqrt((dy + 0.6) / capH)));
      for (let dx = -rw; dx <= rw; dx++) {
        const flecked = red && (dx * 3 + dy * 7 + cx * 5) % 7 === 0;
        p.set(cx + dx, capBase - capH + dy, flecked ? fleck : cap);
      }
    }
  }
  return p.toSprite();
}

const FLOWER_COLORS: { head: RGB; center: RGB }[] = [
  { head: rgb(0xfff6e8), center: rgb(0xffd75e) },
  { head: rgb(0xff9ec7), center: rgb(0xffe2ee) },
  { head: rgb(0xff6a5e), center: rgb(0xffc85e) },
  { head: rgb(0x8fb0ff), center: rgb(0xf0f4ff) },
  { head: rgb(0xffd75e), center: rgb(0xff9e3f) },
];

export function makeFlowerTexture(rng: Rng, variant: number): PixelSprite {
  const w = 10;
  const h = 14;
  const p = new Painter(w, h);
  const stem: RGB = rgb(0x4e8a3c);
  const { head, center } = FLOWER_COLORS[variant % FLOWER_COLORS.length];
  const cx = 4 + rng.int(0, 2);
  const top = 3 + rng.int(0, 2);
  for (let y = top + 2; y < h; y++) p.set(cx + (y % 3 === 0 ? 1 : 0) - (y % 5 === 0 ? 1 : 0), y, stem);
  p.set(cx, top, head);
  p.set(cx - 1, top + 1, head);
  p.set(cx + 1, top + 1, head);
  p.set(cx, top + 2, head);
  p.set(cx - 2, top + 1, head);
  p.set(cx + 2, top + 1, head);
  p.set(cx, top + 1, center);
  return p.toSprite();
}

export function makeGrassTexture(rng: Rng, palette?: number[]): PixelSprite {
  const w = 12;
  const h = 8;
  const p = new Painter(w, h);
  const c = rng.pick((palette ?? [0x4e9440, 0x63b04e, 0x7cc45a]).map(rgb));
  const clumps = rng.int(1, 2);
  for (let b = 0; b < clumps; b++) {
    const x0 = 3 + rng.int(0, w - 7);
    const tall = rng.int(3, h - 1);
    for (let i = 0; i < tall; i++) {
      const y = h - 1 - i;
      const half = Math.max(1, Math.floor((1 - i / tall) * 2.2));
      for (let dx = -half; dx <= half; dx++) p.set(x0 + dx, y, c);
      if (i < tall * 0.5) p.set(x0 + half + 1, y, c);
    }
  }
  return p.toSprite();
}

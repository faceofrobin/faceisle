import { Rng, hash2 } from '../../util/random';
import { Blob, Painter, PixelSprite, RGB, inBlobs, rgb } from './painter';

export type TreeKind = 'green' | 'lime' | 'cherry' | 'pine' | 'elder' | 'rust' | 'gold' | 'willow' | 'snowpine';

export interface TreePalette {
  leaf: RGB[];
  trunk: RGB;
  accent?: RGB;
  accentChance?: number;
}

export const TREE_COLORS: Record<TreeKind, TreePalette> = {
  green: {
    leaf: [rgb(0x2f8a3c), rgb(0x39953f), rgb(0x2b8a4a), rgb(0x43a047), rgb(0x287f45)],
    trunk: rgb(0x6b5a3e),
  },
  lime: {
    leaf: [rgb(0x71af2f), rgb(0x84ba28), rgb(0x87b526), rgb(0x93c435), rgb(0x6da029)],
    trunk: rgb(0x74643f),
  },
  cherry: {
    leaf: [rgb(0xe08fb0), rgb(0xef9ec0), rgb(0xd67ea4), rgb(0xf0b0c8)],
    trunk: rgb(0x6a4a44),
    accent: rgb(0xfff1f7),
    accentChance: 0.03,
  },
  pine: {
    leaf: [rgb(0x2b6b45), rgb(0x24603e), rgb(0x336f4a), rgb(0x2a7550)],
    trunk: rgb(0x5c4a32),
  },
  elder: {
    leaf: [rgb(0x35913c), rgb(0x2c8034), rgb(0x40a047), rgb(0x2f8a4c)],
    trunk: rgb(0x63512f),
  },
  rust: {
    leaf: [rgb(0xbf4021), rgb(0xc4501e), rgb(0xaa3c22), rgb(0xc9642a), rgb(0xa2556b)],
    trunk: rgb(0x6e4e57),
  },
  gold: {
    leaf: [rgb(0xc46a12), rgb(0xc98a1c), rgb(0xd0a026), rgb(0xb87a18), rgb(0xceb23a)],
    trunk: rgb(0x6e5747),
  },
  willow: {
    leaf: [rgb(0x6ba33c), rgb(0x77ad45), rgb(0x5f9638), rgb(0x82b552)],
    trunk: rgb(0x6a5a3e),
  },
  snowpine: {
    leaf: [rgb(0x37665a), rgb(0x2e5a50), rgb(0x3d7060)],
    trunk: rgb(0x4e4030),
  },
};

function leafOf(rng: Rng, col: TreePalette): RGB {
  return rng.pick(col.leaf);
}

export function makeTreeTexture(rng: Rng, kind: TreeKind): PixelSprite {
  if (kind === 'pine') return makePine(rng, false);
  if (kind === 'snowpine') return makePine(rng, true);
  if (kind === 'elder') return makeElder(rng);
  if (kind === 'willow') return makeWillow(rng);
  return makeBlobTree(rng, kind);
}

function canopySpan(blobs: Blob[]): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (const b of blobs) {
    top = Math.min(top, b.cy - b.r);
    bottom = Math.max(bottom, b.cy + b.r);
  }
  return { top, bottom };
}

function paintCanopy(p: Painter, blobs: Blob[], col: TreePalette, leaf: RGB, salt: number, sx: number): void {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!inBlobs(blobs, x, y, salt, 0.22, sx)) continue;
      const blossom =
        col.accent && hash2(x + salt * 5, y - salt * 3) < (col.accentChance ?? 0);
      p.set(x, y, blossom ? col.accent! : leaf);
    }
  }
}

function fitBlob(p: Painter, cx: number, cy: number, r: number, sx: number): Blob {
  const rMax = Math.min((cx - 1) / (1.12 * sx), (p.w - 2 - cx) / (1.12 * sx), (cy - 1) / 1.12);
  return { cx, cy, r: Math.min(r, rMax) };
}

function makeBlobTree(rng: Rng, kind: TreeKind): PixelSprite {
  const w = 48;
  const h = 64;
  const p = new Painter(w, h);
  const col = TREE_COLORS[kind];
  const salt = rng.int(0, 10000);

  const sx = rng.range(0.85, 1.25);
  const crownY = rng.range(17, 23);
  const spread = rng.range(6.5, 10);
  const blobs: Blob[] = [];
  const n = rng.int(6, 11);
  for (let i = 0; i < n; i++) {
    blobs.push(fitBlob(p, w / 2 + rng.range(-spread, spread), crownY + rng.range(-6, 6), rng.range(7, 12), sx));
  }
  const { bottom: canopyBottom } = canopySpan(blobs);
  const leaf = leafOf(rng, col);

  for (const s of [-1, 1]) {
    if (rng.chance(0.3)) continue;
    const len = rng.int(5, 10);
    const slope = rng.range(0.4, 0.8);
    for (let i = 0; i < len; i++) {
      p.set(w / 2 + s * i * slope, canopyBottom - 2 - i, col.trunk);
    }
  }

  paintCanopy(p, blobs, col, leaf, salt, sx);

  const lean = rng.range(-0.07, 0.07);
  const trunkTop = Math.round(canopyBottom - 4);
  for (let y = trunkTop; y < h; y++) {
    const cx = w / 2 + (y - canopyBottom) * lean;
    const t = (y - trunkTop) / Math.max(1, h - 1 - trunkTop);
    p.set(cx - 1, y, col.trunk);
    p.set(cx, y, col.trunk);
    p.set(cx + 1, y, col.trunk);
    if (t > 0.55) p.set(cx - 2, y, col.trunk);
    if (t > 0.9) {
      p.set(cx - 3, y, col.trunk);
      p.set(cx + 2, y, col.trunk);
    }
  }
  return p.toSprite();
}

function makeElder(rng: Rng): PixelSprite {
  const w = 64;
  const h = 80;
  const p = new Painter(w, h);
  const col = TREE_COLORS.elder;
  const salt = rng.int(0, 10000);

  const sx = rng.range(1.05, 1.35);
  const blobs: Blob[] = [];
  const n = rng.int(11, 16);
  for (let i = 0; i < n; i++) {
    blobs.push(fitBlob(p, w / 2 + rng.range(-13, 13), 23 + rng.range(-8, 7), rng.range(8, 13), sx));
  }
  const { bottom: canopyBottom } = canopySpan(blobs);
  const leaf = leafOf(rng, col);

  for (const s of [-1, 1]) {
    const len = rng.int(10, 15);
    const slope = rng.range(0.5, 0.9);
    for (let i = 0; i < len; i++) {
      const bx = w / 2 + s * (2 + i * slope);
      const by = canopyBottom + 2 - i;
      p.set(bx, by, col.trunk);
      p.set(bx + (s < 0 ? -1 : 1), by, col.trunk);
    }
  }

  paintCanopy(p, blobs, col, leaf, salt, sx);

  const lean = rng.range(-0.05, 0.05);
  const trunkTop = Math.round(canopyBottom - 4);
  for (let y = trunkTop; y < h; y++) {
    const t = (y - trunkTop) / Math.max(1, h - 1 - trunkTop);
    const cx = w / 2 + (y - canopyBottom) * lean + Math.sin((y - trunkTop) * 0.16 + salt) * 1.4;
    const hw = t > 0.85 ? 3 : 2;
    for (let dx = -hw; dx <= hw; dx++) p.set(cx + dx, y, col.trunk);
    if (t > 0.93) {
      p.set(cx - hw - 1, y, col.trunk);
      p.set(cx + hw + 1, y, col.trunk);
    }
  }
  return p.toSprite();
}

function makeWillow(rng: Rng): PixelSprite {
  const w = 52;
  const h = 68;
  const p = new Painter(w, h);
  const col = TREE_COLORS.willow;
  const salt = rng.int(0, 10000);

  const sx = rng.range(1.1, 1.35);
  const blobs: Blob[] = [];
  const n = rng.int(8, 12);
  for (let i = 0; i < n; i++) {
    blobs.push(fitBlob(p, w / 2 + rng.range(-10, 10), 15 + rng.range(-5, 5), rng.range(6.5, 10), sx));
  }
  const leaf = leafOf(rng, col);
  paintCanopy(p, blobs, col, leaf, salt, sx);
  const { bottom: canopyBottom } = canopySpan(blobs);

  for (let x = 3; x < w - 3; x++) {
    if (hash2(x + salt, salt) > 0.62) continue;
    let yTop = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (p.filled(x, y)) {
        yTop = y;
        break;
      }
    }
    if (yTop < 0) continue;
    const mid = 1 - Math.abs(x - w / 2) / (w / 2);
    const len = Math.round((6 + hash2(x * 3 + salt, x - salt) * 16) * (0.45 + mid * 0.8));
    const drift = (hash2(x + salt * 5, salt * 3) - 0.5) * 0.22;
    for (let j = 1; j <= len; j++) p.set(x + j * drift, yTop + j, leaf);
  }

  const trunkTop = Math.round(canopyBottom - 3);
  for (let y = trunkTop; y < h; y++) {
    const t = (y - trunkTop) / Math.max(1, h - 1 - trunkTop);
    const cx = w / 2 + Math.sin((y - trunkTop) * 0.2 + salt) * 1.1;
    p.set(cx - 1, y, col.trunk);
    p.set(cx, y, col.trunk);
    p.set(cx + 1, y, col.trunk);
    if (t > 0.7) {
      p.set(cx - 2, y, col.trunk);
      p.set(cx + 2, y, col.trunk);
    }
  }
  return p.toSprite();
}

function makePine(rng: Rng, snowy: boolean): PixelSprite {
  const w = 30;
  const h = 56;
  const p = new Painter(w, h);
  const col = TREE_COLORS[snowy ? 'snowpine' : 'pine'];
  const snow: RGB = rgb(0xe8f0f6);
  const leaf = leafOf(rng, col);
  const salt = rng.int(0, 10000);
  const apex = 2;
  const base = rng.int(44, 48);
  const maxHw = rng.range(9.5, 13);
  const tierH = rng.int(9, 13);

  for (let y = apex; y <= base; y++) {
    const f = (y - apex) / (base - apex);
    let hw = maxHw * f;
    const tier = (y - apex) % tierH;
    if (tier < 3) hw *= 0.55 + tier * 0.15;
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - w / 2);
      const edge = hw * (0.9 + hash2(x + salt, y + salt) * 0.2);
      if (dx > edge) continue;
      const capped =
        snowy && (tier < 2 || (f < 0.2 && hash2(x + salt * 7, y) > 0.35));
      p.set(x, y, capped ? snow : leaf);
    }
  }
  p.set(w / 2, apex - 1, snowy ? snow : leaf);
  p.set(w / 2, apex - 2, snowy ? snow : leaf);
  for (let y = base; y < h; y++) {
    p.set(w / 2 - 1, y, col.trunk);
    p.set(w / 2, y, col.trunk);
    if ((y - base) / Math.max(1, h - 1 - base) > 0.6) {
      p.set(w / 2 + 1, y, col.trunk);
    }
  }
  return p.toSprite();
}

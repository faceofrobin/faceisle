import * as THREE from '../../gl';
import { Rng } from '../../util/random';
import { Blob, Painter, RGB, inBlobs } from './painter';

export function makeCloudTexture(rng: Rng, variant: number): THREE.Texture {
  const w = 96;
  const h = 40;
  const p = new Painter(w, h);
  const salt = variant * 977 + rng.int(0, 10000);
  const baseline = 27;
  const body: RGB = [255, 252, 248];
  const under: RGB = [214, 220, 235];
  const blobs: Blob[] = [];
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i++) {
    blobs.push({
      cx: 14 + (i / (n - 1)) * (w - 28) + rng.range(-6, 6),
      cy: rng.range(13, 23),
      r: rng.range(8, 16),
    });
  }
  for (let y = 0; y <= baseline; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBlobs(blobs, x, y, salt, 0.16)) continue;
      p.set(x, y, y > baseline - 4 ? under : body);
    }
  }
  return p.toSprite().texture;
}

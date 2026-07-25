import * as THREE from '../gl';
import { Terrain } from './terrain';

export function probeShore(terrain: Terrain, px: number, pz: number): number {
  let deepDist = Infinity;
  for (const r of [3, 7, 12, 19, 28, 38, 50]) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (
        terrain.heightAt(px + Math.cos(ang) * r, pz + Math.sin(ang) * r) < -0.8
      ) {
        deepDist = r;
        break;
      }
    }
    if (deepDist < Infinity) break;
  }
  if (deepDist === Infinity) return 0;
  const near = THREE.MathUtils.clamp(1 - (deepDist - 8) / 34, 0, 1);
  let s = near * near;
  if (terrain.heightAt(px, pz) < 0.05) s = Math.max(s, 0.9);
  return s;
}

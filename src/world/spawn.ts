import * as THREE from '../gl';
import { Terrain } from './terrain';
import { Rng } from '../util/random';

export interface SpawnPoint {
  pos: THREE.Vector3;
  yaw: number;
}

export function findSpawn(terrain: Terrain, rng: Rng): SpawnPoint {
  const startAngle = rng.range(0, Math.PI * 2);
  for (let i = 0; i < 300; i++) {
    const a = startAngle + i * 0.13;
    for (
      let r = terrain.islandRadius * 0.95;
      r > terrain.islandRadius * 0.4;
      r -= 4
    ) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = terrain.heightAt(x, z);
      if (h > 0.5 && h < 1.6 && terrain.slopeAt(x, z) < 0.3) {
        return { pos: new THREE.Vector3(x, h, z), yaw: Math.atan2(x, z) };
      }
    }
  }
  return { pos: new THREE.Vector3(0, terrain.heightAt(0, 0), 0), yaw: 0 };
}

export function applyGoto(
  spawn: SpawnPoint,
  gotoParam: string,
  sites: Record<string, THREE.Vector3 | null>,
  terrain: Terrain,
): void {
  let site = sites[gotoParam] ?? null;
  if (!site && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(gotoParam)) {
    const [gx, gz] = gotoParam.split(',').map(Number);
    site = new THREE.Vector3(gx, terrain.heightAt(gx, gz), gz);
  }
  if (site) {
    const px = site.x + 11;
    const pz = site.z + 7;
    spawn.pos.set(px, terrain.heightAt(px, pz), pz);
    spawn.yaw = Math.atan2(-(site.x - px), -(site.z - pz));
  }
}

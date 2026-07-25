import * as THREE from '../../gl';
import { Terrain } from '../terrain';
import { Rng } from '../../util/random';
import { makeDragonflyTextures } from '../../gfx/sprites/fauna';
import { FramePair, frameMaterials } from './common';

interface Dragonfly {
  sprite: THREE.Sprite;
  anchor: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  phase: number;
  matIdx: number;
}

export class Dragonflies {
  private dragonflies: Dragonfly[] = [];
  private mats: FramePair[] = [];
  private terrain: Terrain;
  private scratch = new THREE.Vector3();

  constructor(scene: THREE.Scene, terrain: Terrain, marshSpots: THREE.Vector3[], rng: Rng) {
    this.terrain = terrain;
    this.mats.push(frameMaterials(makeDragonflyTextures(0x2f6f74)));
    this.mats.push(frameMaterials(makeDragonflyTextures(0x8f3a4a)));
    if (marshSpots.length > 0) {
      const n = Math.min(14, marshSpots.length * 2);
      for (let i = 0; i < n; i++) {
        const matIdx = rng.chance(0.75) ? 0 : 1;
        const sprite = new THREE.Sprite(this.mats[matIdx][0]);
        sprite.scale.set(0.52, 0.33, 1);
        const anchor = rng.pick(marshSpots).clone();
        const start = anchor.clone().add(new THREE.Vector3(rng.range(-3, 3), rng.range(0.5, 1.4), rng.range(-3, 3)));
        this.dragonflies.push({
          sprite,
          anchor,
          from: start.clone(),
          to: start.clone(),
          t: 1,
          dur: 1,
          phase: rng.range(0, Math.PI * 2),
          matIdx,
        });
        scene.add(sprite);
      }
    }
  }

  update(dt: number, time: number, daylight: number, tint: THREE.Color): void {
    for (const pair of this.mats) {
      pair[0].color.copy(tint);
      pair[1].color.copy(tint);
    }
    for (const df of this.dragonflies) {
      const visible = daylight > 0.3;
      df.sprite.visible = visible;
      if (!visible) continue;
      df.t += dt / df.dur;
      if (df.t >= 1) {
        df.from.copy(df.to);
        const nx = df.anchor.x + Math.sin(time * 1.7 + df.phase) * 2 + (Math.sin(df.phase + time * 0.23) * 3);
        const nz = df.anchor.z + Math.cos(time * 1.3 + df.phase * 2) * 2 + (Math.cos(df.phase * 3 + time * 0.31) * 3);
        const ground = Math.max(this.terrain.heightAt(nx, nz), 0);
        df.to.set(nx, ground + 0.35 + Math.abs(Math.sin(df.phase + time * 0.7)) * 1.2, nz);
        df.t = 0;
        df.dur = 0.7 + Math.abs(Math.sin(df.phase * 5 + time)) * 1.1;
      }
      const e = 1 - (1 - df.t) * (1 - df.t);
      this.scratch.lerpVectors(df.from, df.to, e);
      this.scratch.y += Math.sin(time * 6 + df.phase) * 0.06;
      df.sprite.position.copy(this.scratch);
      const frame = Math.sin(time * 21 + df.phase) > 0 ? 0 : 1;
      df.sprite.material = this.mats[df.matIdx][frame];
    }
  }
}

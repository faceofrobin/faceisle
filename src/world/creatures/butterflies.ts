import * as THREE from '../../gl';
import { Terrain } from '../terrain';
import { Rng } from '../../util/random';
import { makeButterflyTextures } from '../../gfx/sprites/fauna';
import { FramePair, frameMaterials } from './common';

interface Butterfly {
  sprite: THREE.Sprite;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  phase: number;
  speed: number;
  heading: number;
  size: number;
}

export class Butterflies {
  private butterflies: Butterfly[] = [];
  private mats: FramePair[] = [];
  private matIndex: number[] = [];
  private terrain: Terrain;

  constructor(scene: THREE.Object3D, terrain: Terrain, flowerSpots: THREE.Vector3[], rng: Rng) {
    this.terrain = terrain;
    const wingColors = [0xff9c3f, 0xfff4e0, 0x8fb0ff, 0xffd75e];
    for (const c of wingColors) this.mats.push(frameMaterials(makeButterflyTextures(c)));
    const homes = flowerSpots.length > 0 ? flowerSpots : [new THREE.Vector3()];
    const n = Math.min(34, homes.length * 3);
    for (let i = 0; i < n; i++) {
      const matIdx = rng.int(0, this.mats.length);
      const sprite = new THREE.Sprite(this.mats[matIdx][0]);
      const size = rng.range(0.42, 0.6);
      sprite.scale.set(size * 1.4, size, 1);
      const home = rng.pick(homes);
      this.butterflies.push({
        sprite,
        home: home.clone(),
        pos: home.clone().add(new THREE.Vector3(rng.range(-4, 4), rng.range(0.8, 2), rng.range(-4, 4))),
        phase: rng.range(0, Math.PI * 2),
        speed: rng.range(0.9, 1.6),
        heading: rng.range(0, Math.PI * 2),
        size,
      });
      this.matIndex.push(matIdx);
      scene.add(sprite);
    }
  }

  update(dt: number, time: number, daylight: number, tint: THREE.Color): void {
    for (const pair of this.mats) {
      pair[0].color.copy(tint);
      pair[1].color.copy(tint);
    }
    for (let i = 0; i < this.butterflies.length; i++) {
      const b = this.butterflies[i];
      const visible = daylight > 0.25;
      b.sprite.visible = visible;
      if (!visible) continue;
      b.heading += Math.sin(time * 0.7 + b.phase) * 1.7 * dt;
      const away = b.pos.distanceTo(b.home);
      if (away > 10) {
        const toHome = Math.atan2(b.home.x - b.pos.x, b.home.z - b.pos.z);
        b.heading += (toHome - b.heading) * 0.6 * dt * away * 0.1;
      }
      b.pos.x += Math.sin(b.heading) * b.speed * dt;
      b.pos.z += Math.cos(b.heading) * b.speed * dt;
      const ground = this.terrain.heightAt(b.pos.x, b.pos.z);
      b.pos.y = ground + 1.1 + Math.sin(time * 2.6 + b.phase) * 0.45;
      b.sprite.position.copy(b.pos);
      const frame = Math.sin(time * 14 + b.phase) > 0 ? 0 : 1;
      b.sprite.material = this.mats[this.matIndex[i]][frame];
    }
  }
}

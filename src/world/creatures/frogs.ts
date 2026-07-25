import * as THREE from 'three';
import { Terrain } from '../terrain';
import { Rng } from '../../util/random';
import { makeFrogTextures } from '../../gfx/sprites/fauna';
import { CreatureSounds, FramePair, frameMaterials } from './common';
import { place } from '../../audio/voices';

interface Frog {
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  hopFrom: THREE.Vector3;
  hopTo: THREE.Vector3;
  hopT: number;
  cooldown: number;
}

export class Frogs {
  private frogs: Frog[] = [];
  private mats: FramePair;
  private terrain: Terrain;
  private sounds: CreatureSounds;

  constructor(scene: THREE.Scene, terrain: Terrain, marshSpots: THREE.Vector3[], rng: Rng, sounds: CreatureSounds) {
    this.terrain = terrain;
    this.sounds = sounds;
    this.mats = frameMaterials(makeFrogTextures());
    let tries = 0;
    while (this.frogs.length < 18 && tries < 6000) {
      tries++;
      let x: number;
      let z: number;
      if (marshSpots.length > 0 && rng.chance(0.5)) {
        const m = rng.pick(marshSpots);
        x = m.x + rng.range(-6, 6);
        z = m.z + rng.range(-6, 6);
      } else {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(terrain.islandRadius * 0.3, terrain.islandRadius);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      const h = terrain.heightAt(x, z);
      if (h < 0.15 || h > 0.9) continue;
      const sprite = new THREE.Sprite(this.mats[0]);
      sprite.scale.set(0.55, 0.42, 1);
      const pos = new THREE.Vector3(x, h + 0.2, z);
      sprite.position.copy(pos);
      this.frogs.push({ sprite, pos, hopFrom: pos.clone(), hopTo: pos.clone(), hopT: 1, cooldown: 0 });
      scene.add(sprite);
    }
  }

  update(
    dt: number,
    time: number,
    tint: THREE.Color,
    playerPos: THREE.Vector3,
    yaw: number,
  ): void {
    this.mats[0].color.copy(tint);
    this.mats[1].color.copy(tint);
    for (const f of this.frogs) {
      f.cooldown = Math.max(0, f.cooldown - dt);
      if (f.hopT < 1) {
        f.hopT = Math.min(1, f.hopT + dt * 2.2);
        const t = f.hopT;
        f.pos.lerpVectors(f.hopFrom, f.hopTo, t);
        f.pos.y = THREE.MathUtils.lerp(f.hopFrom.y, f.hopTo.y, t) + Math.sin(t * Math.PI) * 1.1;
        f.sprite.material = this.mats[1];
      } else {
        f.sprite.material = this.mats[0];
        const d = f.pos.distanceTo(playerPos);
        if (d < 5.5 && f.cooldown <= 0) {
          const away = Math.atan2(f.pos.x - playerPos.x, f.pos.z - playerPos.z) + (Math.sin(time * 3.1) * 0.5);
          const dist = 2.4;
          const nx = f.pos.x + Math.sin(away) * dist;
          const nz = f.pos.z + Math.cos(away) * dist;
          const nh = this.terrain.heightAt(nx, nz);
          if (nh > -0.4 && nh < 1.6) {
            f.hopFrom.copy(f.pos);
            f.hopTo.set(nx, Math.max(nh, -0.1) + 0.2, nz);
            f.hopT = 0;
            f.cooldown = 0.45;
            if (d < 14) {
              const { pan, near } = place(f.pos.x - playerPos.x, f.pos.z - playerPos.z, yaw, 14);
              this.sounds.frogHop(pan, near);
            }
          } else {
            f.cooldown = 0.3;
          }
        }
      }
      f.sprite.position.copy(f.pos);
    }
  }
}

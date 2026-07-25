import * as THREE from 'three';
import { Rng } from '../../util/random';
import { makeBirdTextures } from '../../gfx/sprites/fauna';
import { FramePair, frameMaterials } from './common';

interface Flock {
  center: number;
  radius: number;
  height: number;
  speed: number;
  birds: { sprite: THREE.Sprite; phaseOffset: number; radiusOffset: number }[];
}

export class BirdFlocks {
  private flocks: Flock[] = [];
  private mats: FramePair;

  constructor(scene: THREE.Scene, rng: Rng) {
    this.mats = frameMaterials(makeBirdTextures());
    for (let f = 0; f < 3; f++) {
      const flock: Flock = {
        center: rng.range(0, Math.PI * 2),
        radius: rng.range(90, 230),
        height: rng.range(36, 70),
        speed: rng.range(0.035, 0.06) * (rng.chance(0.5) ? 1 : -1),
        birds: [],
      };
      const n = rng.int(3, 6);
      for (let b = 0; b < n; b++) {
        const sprite = new THREE.Sprite(this.mats[0]);
        sprite.scale.set(1.5, 1.0, 1);
        flock.birds.push({ sprite, phaseOffset: rng.range(0, 1.2), radiusOffset: rng.range(-8, 8) });
        scene.add(sprite);
      }
      this.flocks.push(flock);
    }
  }

  update(dt: number, time: number, daylight: number, tint: THREE.Color): void {
    this.mats[0].color.copy(tint);
    this.mats[1].color.copy(tint);
    for (const flock of this.flocks) {
      flock.center += flock.speed * dt;
      for (const bird of flock.birds) {
        const visible = daylight > 0.35;
        bird.sprite.visible = visible;
        if (!visible) continue;
        const a = flock.center + bird.phaseOffset * 0.4;
        const r = flock.radius + bird.radiusOffset;
        bird.sprite.position.set(
          Math.cos(a) * r,
          flock.height + Math.sin(time * 0.8 + bird.phaseOffset * 5) * 3,
          Math.sin(a) * r,
        );
        const frame = Math.sin(time * 9 + bird.phaseOffset * 7) > 0 ? 0 : 1;
        bird.sprite.material = this.mats[frame];
      }
    }
  }
}

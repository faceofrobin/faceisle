import * as THREE from '../../gl';
import { Terrain } from '../terrain';
import { Vegetation } from '../vegetation';
import { DayCycle } from '../daycycle';
import { Rng } from '../../util/random';
import { CreatureSounds } from './common';
import { Butterflies } from './butterflies';
import { Frogs } from './frogs';
import { Dragonflies } from './dragonflies';
import { BirdFlocks } from './birds';
import { Fireflies } from './fireflies';
import { Drift, createDrift } from './drift';

export class Creatures {
  private butterflies: Butterflies;
  private frogs: Frogs;
  private dragonflies: Dragonflies;
  private birds: BirdFlocks;
  private fireflies: Fireflies;
  private petals: Drift | null;
  private leaves: Drift | null;
  private snow: Drift | null;

  constructor(scene: THREE.Object3D, terrain: Terrain, veg: Vegetation, rng: Rng, sounds: CreatureSounds) {
    // Anything with no home on this island gathers at its centre rather than
    // at the world origin, which is another island once you leave the first.
    const centre = new THREE.Vector3(terrain.centerX, 0, terrain.centerZ);
    const orElse = (spots: THREE.Vector3[]): THREE.Vector3[] =>
      spots.length > 0 ? spots : [centre];

    this.butterflies = new Butterflies(scene, terrain, orElse(veg.flowerSpots), rng);
    this.frogs = new Frogs(scene, terrain, veg.marshSpots, rng, sounds);
    this.dragonflies = new Dragonflies(scene, terrain, veg.marshSpots, rng);
    this.birds = new BirdFlocks(scene, rng, centre);
    this.fireflies = new Fireflies(scene, orElse(veg.forestSpots), rng);

    this.petals = createDrift(scene, rng, veg.cherrySpots, {
      hex: 0xffc2d8,
      size: 0.24,
      perAnchor: 10,
      max: 160,
      jitter: 3,
      speed: 0.28,
      span: 7,
      drop: 5.5,
      cycleLen: 1.6,
      sway: 1.1,
    });
    this.leaves = createDrift(scene, rng, veg.autumnSpots, {
      hex: 0xd8923f,
      size: 0.26,
      perAnchor: 6,
      max: 220,
      jitter: 3.5,
      speed: 0.2,
      span: 6.5,
      drop: 5.5,
      cycleLen: 1.7,
      sway: 1.5,
    });
    // Snow falls where there is snow on the ground, which is the snow line and
    // not a fixed height. A caldera's landmark site is the lake at the bottom
    // of it, so anchoring to bare height put falling snow over open water on a
    // green rim.
    const snowAnchors: THREE.Vector3[] = [];
    for (let i = 0; i < 900 && snowAnchors.length < 60; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, 85);
      const x = terrain.peakSite.x + Math.cos(a) * d;
      const z = terrain.peakSite.z + Math.sin(a) * d;
      const h = terrain.heightAt(x, z);
      if (h < terrain.snowline - 4) continue;
      snowAnchors.push(new THREE.Vector3(x, h, z));
    }
    this.snow = createDrift(scene, rng, snowAnchors, {
      hex: 0xf0f4fa,
      size: 0.18,
      perAnchor: 5,
      max: 280,
      jitter: 7,
      speed: 0.075,
      span: 13,
      drop: 13,
      cycleLen: 1.0,
      sway: 0.6,
    });
  }

  update(
    dt: number,
    time: number,
    day: DayCycle,
    playerPos: THREE.Vector3,
    yaw: number,
  ): void {
    this.butterflies.update(dt, time, day.daylight, day.tint);
    this.frogs.update(dt, time, day.tint, playerPos, yaw);
    this.dragonflies.update(dt, time, day.daylight, day.tint);
    this.birds.update(dt, time, day.daylight, day.tint);
    this.fireflies.update(time, day.daylight);

    this.petals?.update(time, day.tint);
    this.leaves?.update(time, day.tint);
    this.snow?.update(time, day.tint);
  }
}

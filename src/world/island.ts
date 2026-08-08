import * as THREE from "../gl";
import { Rng } from "../util/random";
import { Landmark, Terrain } from "./terrain";
import { Vegetation } from "./vegetation";
import { Stones } from "./stones";
import { Landmarks } from "./landmarks";
import { Creatures } from "./creatures";
import { CreatureSounds } from "./creatures/common";
import { DayCycle } from "./daycycle";

/** How much of an island is currently in the scene. */
export type Detail = "none" | "far" | "full";

export interface IslandSite {
  /** Grid cell, and the key it is stored under. */
  ci: number;
  cj: number;
  seed: number;
  centerX: number;
  centerZ: number;
  radius: number;
  relief: number;
  snowline: number;
  landmark: Landmark;
  /** The island the game opens on: cell (0, 0), and the one `?seed=` names. */
  home: boolean;
}

export function siteKey(ci: number, cj: number): string {
  return `${ci},${cj}`;
}

/** `Rng.fork()` without keeping the child, so the same stream can be re-made. */
function forkSeed(rng: Rng): number {
  return (rng.next() * 4294967296) >>> 0;
}

/**
 * One island: its terrain, and whatever of its scenery is currently built.
 *
 * Terrain is analytic, so the moment an island exists the player can stand on
 * it, land on it and hear the right ground underfoot — geometry is only ever
 * about what you can see. That is what lets an island be built behind you while
 * you fly, and torn down once it is over the horizon.
 *
 * Everything the island owns hangs off one group, so putting it back is a
 * single `remove` plus a walk to hand the buffers to the driver.
 */
export class Island {
  readonly site: IslandSite;
  readonly terrain: Terrain;
  readonly group = new THREE.Object3D();

  /**
   * Draw order from the island's seed, reproducing what the single-island game
   * did: terrain, then sky, vegetation, stones, creatures, weather, spawn. Sky
   * and weather belong to the world rather than to an island, so only the home
   * island's are ever used — but the slots have to be spent in the same order
   * or every `?seed=` link in the wild would open a different island.
   */
  readonly skyRng: Rng;
  readonly weatherRng: Rng;
  readonly spawnRng: Rng;

  detail: Detail = "none";
  vegetation: Vegetation | null = null;
  stones: Stones | null = null;
  landmarks: Landmarks | null = null;
  creatures: Creatures | null = null;

  private farMesh: THREE.Mesh | null = null;
  private fullMesh: THREE.Mesh | null = null;
  /** Children up to here belong to a finished step; past it is half-built. */
  private committed = 0;
  private vegSeed: number;
  private stoneSeed: number;
  private landmarkSeed: number;
  private creatureSeed: number;

  constructor(site: IslandSite) {
    this.site = site;
    const rng = new Rng(site.seed);
    this.terrain = new Terrain(rng, {
      centerX: site.centerX,
      centerZ: site.centerZ,
      radius: site.radius,
      relief: site.relief,
      snowline: site.snowline,
      landmark: site.landmark,
    });
    this.skyRng = rng.fork();
    this.vegSeed = forkSeed(rng);
    this.stoneSeed = forkSeed(rng);
    this.creatureSeed = forkSeed(rng);
    // Drawn from the stone stream rather than the shared one, so adding a
    // landmark did not move every island's creatures along by one.
    this.landmarkSeed = forkSeed(new Rng(this.stoneSeed));
    this.weatherRng = rng.fork();
    this.spawnRng = rng;
  }

  /** Distance from the player to this island's shore; 0 means standing on it. */
  edgeDistance(x: number, z: number): number {
    return Math.max(0, this.terrain.distanceTo(x, z) - this.site.radius);
  }

  /**
   * Bring the island up to `target`, a slice at a time. The caller pumps this
   * against a frame budget and may walk away from it at any yield — if the
   * player turns around, finishing an island behind them is wasted work.
   *
   * Planting adds its sprite batches to the group as it goes, so an abandoned
   * build leaves half a wood standing with nothing owning it. The watermark
   * below is what makes walking away safe: anything past the last finished
   * step is swept up before the next attempt, which would otherwise plant a
   * second wood on top of the first.
   */
  *grow(target: Detail, sounds: CreatureSounds, gpu: THREE.WebGLRenderer): Generator<void, void, void> {
    if (target === "none") return;
    this.discardPartial(gpu);

    // A silhouette first, even when full detail is what was asked for: it
    // costs a tenth as much, so the island shows up on the horizon while its
    // detail is still being drawn rather than arriving all at once underfoot.
    if (!this.farMesh && !this.fullMesh) {
      this.farMesh = yield* this.terrain.build(this.terrain.farSegments);
      this.group.add(this.farMesh);
      this.detail = "far";
      this.commit();
    }
    if (target === "far") return;

    if (!this.fullMesh) {
      this.fullMesh = yield* this.terrain.build(this.terrain.fullSegments);
      this.group.add(this.fullMesh);
      if (this.farMesh) this.farMesh.visible = false;
      this.commit();
    }
    if (!this.vegetation) {
      this.vegetation = yield* Vegetation.grow(
        this.group,
        this.terrain,
        new Rng(this.vegSeed),
      );
      this.commit();
    }
    if (!this.stones) {
      this.stones = new Stones(this.group, this.terrain, new Rng(this.stoneSeed));
      this.commit();
      yield;
    }
    if (!this.landmarks) {
      this.landmarks = new Landmarks(
        this.group,
        this.terrain,
        new Rng(this.landmarkSeed),
      );
      this.commit();
      yield;
    }
    if (!this.creatures) {
      this.creatures = new Creatures(
        this.group,
        this.terrain,
        this.vegetation,
        new Rng(this.creatureSeed),
        sounds,
      );
      this.commit();
      yield;
    }
    this.detail = "full";
  }

  private commit(): void {
    this.committed = this.group.children.length;
  }

  /** Sweep up anything an abandoned build left in the group. */
  private discardPartial(gpu: THREE.WebGLRenderer): void {
    while (this.group.children.length > this.committed) {
      const child = this.group.children.pop()!;
      child.parent = null;
      releaseTree(child, gpu);
    }
  }

  /**
   * Drop back to a silhouette: the scenery goes, the coarse mesh comes back.
   * The island stays queryable, so the player can still fly over it.
   */
  demote(gpu: THREE.WebGLRenderer): void {
    for (const child of this.group.children.slice()) {
      if (child === this.farMesh) continue;
      this.group.remove(child);
      releaseTree(child, gpu);
    }
    this.committed = this.group.children.length;
    this.fullMesh = null;
    this.vegetation = null;
    this.stones = null;
    this.landmarks = null;
    this.creatures = null;
    if (this.farMesh) {
      this.farMesh.visible = true;
      this.detail = "far";
    } else {
      this.detail = "none";
    }
  }

  dispose(scene: THREE.Object3D, gpu: THREE.WebGLRenderer): void {
    scene.remove(this.group);
    releaseTree(this.group, gpu);
    this.group.children.length = 0;
    this.committed = 0;
    this.farMesh = null;
    this.fullMesh = null;
    this.vegetation = null;
    this.stones = null;
    this.landmarks = null;
    this.creatures = null;
    this.detail = "none";
  }

  /** Per-frame work for whatever this island currently has in the scene. */
  update(
    dt: number,
    time: number,
    day: DayCycle,
    fog: THREE.Fog,
    playerPos: THREE.Vector3,
    yaw: number,
  ): void {
    this.terrain.material.color.copy(day.tint);
    if (this.detail !== "full") return;
    this.stones?.material.color.copy(day.tint);
    this.vegetation?.update(time, day, fog);
    this.creatures?.update(dt, time, day, playerPos, yaw);
  }
}

/**
 * Hand every GL buffer under a node back to the driver.
 *
 * Sprites are the one exception: they all share a single unit quad, so
 * releasing a sprite's geometry would blank every other sprite in the world.
 * Their textures are still theirs to free.
 */
function releaseTree(node: THREE.Object3D, gpu: THREE.WebGLRenderer): void {
  const holder = node as unknown as {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material;
    isSprite?: boolean;
  };
  if (holder.geometry && !holder.isSprite) gpu.releaseGeometry(holder.geometry);
  if (holder.material) releaseMaterial(holder.material, gpu);
  for (const child of node.children) releaseTree(child, gpu);
}

function releaseMaterial(
  material: THREE.Material,
  gpu: THREE.WebGLRenderer,
): void {
  const withMap = material as unknown as { map?: THREE.Texture | null };
  if (withMap.map) gpu.releaseTexture(withMap.map);
  const withUniforms = material as unknown as {
    uniforms?: Record<string, { value: unknown }>;
  };
  if (!withUniforms.uniforms) return;
  for (const name in withUniforms.uniforms) {
    const value = withUniforms.uniforms[name].value;
    if (value instanceof THREE.Texture) gpu.releaseTexture(value);
  }
}

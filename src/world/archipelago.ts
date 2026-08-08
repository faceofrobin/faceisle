import * as THREE from "../gl";
import { Rng } from "../util/random";
import { DayCycle } from "./daycycle";
import { DEEP_SEA } from "./terrain";
import { Detail, Island, IslandSite, siteKey } from "./island";
import { CreatureSounds } from "./creatures/common";

/**
 * Islands sit one to a grid cell, jittered inside it, and some cells are left
 * as open sea. A cell is a kilometre across and an island is at most 260 m of
 * land (300 m for home), so however the jitter falls there is always water
 * between two shores — the layout never has to be checked for overlap or
 * retried, which is what makes it a pure function of the cell.
 */
const CELL = 1000;
const JITTER = 150;
const DENSITY = 0.62;
const MIN_RADIUS = 135;
const MAX_RADIUS = 260;

/** Shore distances at which an island gains and loses each kind of detail. */
const FULL_IN = 240;
const FULL_OUT = 420;
const FAR_IN = 1500;
const FAR_OUT = 1900;
/** Islands are *known* — queryable, unbuilt — well past what is drawn. */
const KNOWN_IN = 2600;
const KNOWN_OUT = 3000;

/** Cells to sweep for sites, enough to cover `KNOWN_OUT` plus jitter. */
const SCAN = 4;

/** Sea floor where no island reaches. */
const OPEN_SEA = DEEP_SEA - 0.4;

interface Job {
  island: Island;
  target: Detail;
  cost: number;
  steps: Generator<void, void, void>;
}

function cellHash(seed: number, ci: number, cj: number): number {
  let h =
    (Math.imul(ci, 374761393) +
      Math.imul(cj, 668265263) +
      Math.imul(seed, 2246822519)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A sea of islands, streamed around the player.
 *
 * The layout is a pure function of the world seed and a cell's coordinates, so
 * it needs no storage and has no edge: fly far enough in any direction and
 * there is always another island, and flying back finds the one you left
 * exactly as it was. What is *built* is decided by distance to each island's
 * shore rather than its centre, so a wide island announces itself on the
 * horizon sooner than a skerry does.
 */
export class Archipelago {
  readonly islands = new Map<string, Island>();
  /** The island the game opens on. Only boot should hold on to this. */
  readonly boot: Island;

  private scene: THREE.Object3D;
  private gpu: THREE.WebGLRenderer;
  private sounds: CreatureSounds;
  private seed: number;
  private job: Job | null = null;
  private lastScanX = Infinity;
  private lastScanZ = Infinity;

  constructor(
    scene: THREE.Object3D,
    gpu: THREE.WebGLRenderer,
    seed: number,
    sounds: CreatureSounds,
  ) {
    this.scene = scene;
    this.gpu = gpu;
    this.seed = seed;
    this.sounds = sounds;
    this.boot = this.load(this.siteAt(0, 0)!);
  }

  /** The island at a cell, or null where the sea was left open. */
  private siteAt(ci: number, cj: number): IslandSite | null {
    if (ci === 0 && cj === 0) {
      // Home keeps the shape the single-island game had, and the world seed
      // itself, so every `?seed=` link still opens the island it always did.
      return {
        ci,
        cj,
        seed: this.seed,
        centerX: 0,
        centerZ: 0,
        radius: 300,
        relief: 1,
        snowline: 17.5,
        home: true,
      };
    }
    const rng = new Rng(cellHash(this.seed, ci, cj));
    if (rng.next() > DENSITY) return null;
    return {
      ci,
      cj,
      centerX: ci * CELL + rng.range(-JITTER, JITTER),
      centerZ: cj * CELL + rng.range(-JITTER, JITTER),
      radius: rng.range(MIN_RADIUS, MAX_RADIUS),
      // Relief decides whether a place is a low green mound or a mountain. The
      // 5.5 m of base height underneath means even the flattest still breaks
      // the surface, so the generator never produces a reef you cannot land on.
      relief: rng.range(0.62, 1.32),
      snowline: 17.5 * rng.range(0.85, 1.15),
      seed: (rng.next() * 4294967296) >>> 0,
      home: false,
    };
  }

  private load(site: IslandSite): Island {
    const island = new Island(site);
    this.scene.add(island.group);
    this.islands.set(siteKey(site.ci, site.cj), island);
    return island;
  }

  /**
   * Decide what each nearby island should be and work on the most urgent
   * difference. One build runs at a time, so a burst of new sites coming over
   * the horizon can never gang up on a frame.
   */
  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastScanX, z - this.lastScanZ) > 40) {
      this.lastScanX = x;
      this.lastScanZ = z;
      this.sweep(x, z);
    }

    let best: Job | null = null;
    for (const island of this.islands.values()) {
      const edge = island.edgeDistance(x, z);
      const want = this.wantedDetail(island, edge);
      if (want === island.detail) continue;
      if (want === "far" && island.detail === "full") {
        island.demote(this.gpu);
        continue;
      }
      if (want === "none") continue;
      // Nearest first, and a silhouette before anybody's scenery: an island you
      // cannot make out yet matters less than the horizon being right.
      const cost = edge + (want === "full" ? 900 : 0);
      if (best && cost >= best.cost) continue;
      best = { island, target: want, cost, steps: null as never };
    }

    if (this.job) {
      const running = this.job;
      const edge = running.island.edgeDistance(x, z);
      // Judge a running build against the same hysteresis the detail levels
      // use, not against what the island currently *is* — mid-build it is
      // still only a silhouette, so asking `wantedDetail` would abandon every
      // promotion the moment the player drifted past the inner threshold.
      const stale =
        !this.islands.has(siteKey(running.island.site.ci, running.island.site.cj)) ||
        edge > FAR_OUT ||
        (running.target === "full" && edge > FULL_OUT);
      // Otherwise let it finish, unless something clearly more urgent has come
      // over the horizon — restarting throws away whatever it had done.
      if (!stale && !(best && best.cost + 300 < running.cost)) return;
      this.job = null;
    }
    if (!best) return;
    best.steps = best.island.grow(best.target, this.sounds, this.gpu);
    this.job = best;
  }

  /** Hysteresis, so an island hovering at a threshold cannot flicker. */
  private wantedDetail(island: Island, edge: number): Detail {
    if (island.detail === "full") return edge > FULL_OUT ? "far" : "full";
    if (edge <= FULL_IN) return "full";
    if (island.detail === "far") return edge > FAR_OUT ? "none" : "far";
    return edge <= FAR_IN ? "far" : "none";
  }

  private sweep(x: number, z: number): void {
    const pci = Math.round(x / CELL);
    const pcj = Math.round(z / CELL);
    for (let ci = pci - SCAN; ci <= pci + SCAN; ci++) {
      for (let cj = pcj - SCAN; cj <= pcj + SCAN; cj++) {
        if (this.islands.has(siteKey(ci, cj))) continue;
        const site = this.siteAt(ci, cj);
        if (!site) continue;
        const dx = site.centerX - x;
        const dz = site.centerZ - z;
        if (Math.sqrt(dx * dx + dz * dz) - site.radius > KNOWN_IN) continue;
        this.load(site);
      }
    }
    for (const [key, island] of this.islands) {
      if (island.edgeDistance(x, z) <= KNOWN_OUT) continue;
      island.dispose(this.scene, this.gpu);
      this.islands.delete(key);
      if (this.job?.island === island) this.job = null;
    }
  }

  /** Advance the current build for at most `budgetMs`. */
  pump(budgetMs: number): void {
    if (!this.job) return;
    const until = performance.now() + budgetMs;
    do {
      if (this.job.steps.next().done) {
        this.job = null;
        return;
      }
    } while (performance.now() < until);
  }

  /** True while an island near the player is still assembling itself. */
  get building(): boolean {
    return this.job !== null;
  }

  /**
   * Ground height anywhere in the world. Islands never overlap, so at most one
   * has an answer; everywhere else is open sea.
   */
  heightAt(x: number, z: number): number {
    let best = OPEN_SEA;
    for (const island of this.islands.values()) {
      if (!island.terrain.covers(x, z)) continue;
      const h = island.terrain.heightAt(x, z);
      if (h > best) best = h;
    }
    return best;
  }

  /** Islands whose land could fall inside a square window, for the water bake. */
  islandsNear(x: number, z: number, reach: number, out: Island[]): Island[] {
    out.length = 0;
    for (const island of this.islands.values()) {
      if (island.terrain.distanceTo(x, z) > reach + island.site.radius * 1.35) {
        continue;
      }
      out.push(island);
    }
    return out;
  }

  /** The island whose shore is closest — the one the player belongs to. */
  nearest(x: number, z: number): Island {
    let best = this.boot;
    let bestEdge = Infinity;
    for (const island of this.islands.values()) {
      const edge = island.edgeDistance(x, z);
      if (edge >= bestEdge) continue;
      bestEdge = edge;
      best = island;
    }
    return best;
  }

  updateVisuals(
    dt: number,
    time: number,
    day: DayCycle,
    fog: THREE.Fog,
    playerPos: THREE.Vector3,
    yaw: number,
  ): void {
    for (const island of this.islands.values()) {
      island.update(dt, time, day, fog, playerPos, yaw);
    }
  }
}

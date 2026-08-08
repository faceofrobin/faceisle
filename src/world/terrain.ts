import * as THREE from "../gl";
import { Noise2D } from "../util/noise";
import { Rng } from "../util/random";
import { snapMaterial } from "../gfx/post";
import { GROUND, RegionSample, posterize, washGround } from "./palette";

/** The island the game shipped with: 300 m of land, a 680 m plane, 2.1 m quads. */
const HOME_RADIUS = 300;
const PLANE_OVERSHOOT = 680 / HOME_RADIUS;
const FULL_QUAD = 2.125;
const FAR_QUAD = 9;

/** Sea floor beyond the island's reach, and what open ocean reads as. */
export const DEEP_SEA = -3.2;

export interface BiomeWeights {
  autumn: number;
  marsh: number;
}

/**
 * How one island differs from another. Every field defaults to the values the
 * single-island game used, so a given seed still generates the island it always
 * did — the archipelago varies islands through this, not by touching the noise.
 */
export interface IslandShape {
  centerX?: number;
  centerZ?: number;
  radius?: number;
  /** Multiplies hills, massif and peak. Below 1 gives low sandy skerries. */
  relief?: number;
  snowline?: number;
}

const AUTUMN_ANG = 1.95;
const AUTUMN_HALF = 0.62;
const MARSH_ANG = 3.65;
const MARSH_HALF = 0.58;
const PEAK_ANG = 2.85;
const EDGE_SOFT = 0.3;
const WARP_MAX = 0.55;

const TWO_PI = Math.PI * 2;

export class Terrain {
  readonly material: THREE.MeshBasicMaterial;
  readonly islandRadius: number;
  readonly snowline: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly peakSite: THREE.Vector3;

  private heightNoise: Noise2D;
  private maskNoise: Noise2D;
  private forestNoise: Noise2D;
  private meadowNoise: Noise2D;
  private biomeWarp: Noise2D;
  private poolNoise: Noise2D;
  private tintNoise: Noise2D;
  private edgeNoise: Noise2D;
  private baseAngle: number;
  private peakX: number;
  private peakZ: number;
  private relief: number;
  /** Island size relative to the home island, for distances tuned against it. */
  private k: number;
  private planeSize: number;

  constructor(rng: Rng, shape: IslandShape = {}) {
    // Noise draw order is load-bearing: it is what makes `?seed=` reproducible.
    this.heightNoise = new Noise2D(rng.fork());
    this.maskNoise = new Noise2D(rng.fork());
    this.forestNoise = new Noise2D(rng.fork());
    this.meadowNoise = new Noise2D(rng.fork());
    this.biomeWarp = new Noise2D(rng.fork());
    this.poolNoise = new Noise2D(rng.fork());
    const paintRng = rng.fork();
    this.tintNoise = new Noise2D(paintRng.fork());
    this.edgeNoise = new Noise2D(paintRng.fork());
    this.baseAngle = rng.range(0, TWO_PI);

    this.centerX = shape.centerX ?? 0;
    this.centerZ = shape.centerZ ?? 0;
    this.islandRadius = shape.radius ?? HOME_RADIUS;
    this.relief = shape.relief ?? 1;
    this.snowline = shape.snowline ?? 17.5;
    this.k = this.islandRadius / HOME_RADIUS;
    this.planeSize = this.islandRadius * PLANE_OVERSHOOT;

    const pr = this.islandRadius * 0.22;
    this.peakX = Math.cos(this.baseAngle + PEAK_ANG) * pr;
    this.peakZ = Math.sin(this.baseAngle + PEAK_ANG) * pr;
    const peakWorldX = this.peakX + this.centerX;
    const peakWorldZ = this.peakZ + this.centerZ;
    this.peakSite = new THREE.Vector3(
      peakWorldX,
      this.heightAt(peakWorldX, peakWorldZ),
      peakWorldZ,
    );
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
    });
    snapMaterial(this.material);
  }

  /** Vertices per side for a mesh that walks well up close. */
  get fullSegments(): number {
    return Math.max(32, Math.round(this.planeSize / FULL_QUAD));
  }

  /** Vertices per side for a silhouette seen from the air. */
  get farSegments(): number {
    return Math.max(16, Math.round(this.planeSize / FAR_QUAD));
  }

  /** Distance from this island's centre, in metres. */
  distanceTo(x: number, z: number): number {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * True where this island, rather than open sea, owns the ground. Squared —
   * the water bake asks this a hundred thousand times per window.
   */
  covers(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const reach = this.islandRadius * 1.35;
    return dx * dx + dz * dz <= reach * reach;
  }

  heightAt(x: number, z: number): number {
    const lx = x - this.centerX;
    const lz = z - this.centerZ;
    const dist = Math.sqrt(lx * lx + lz * lz);
    if (dist > this.islandRadius * 1.35) return DEEP_SEA;

    const n = this.heightNoise;
    const hills = n.fbm(lx * 0.012, lz * 0.012, 4) * 7.5;
    const massif = Math.max(
      0,
      n.fbm(lx * 0.0032 + 13.7, lz * 0.0032 - 4.1, 3) * 19,
    );

    const marsh = this.wedgeAt(lx, lz, dist, MARSH_ANG, MARSH_HALF, true);
    const damped = hills * (1 - 0.5 * marsh) + massif * (1 - 0.85 * marsh);

    const dpx = lx - this.peakX;
    const dpz = lz - this.peakZ;
    const d2 = dpx * dpx + dpz * dpz;
    const peak = d2 < 30000 ? 24 * Math.exp(-d2 / 3600) : 0;

    const warp =
      this.maskNoise.fbm(lx * 0.008 + 71.3, lz * 0.008 + 29.9, 3) * 0.22;
    const r = dist / this.islandRadius + warp;
    const falloff = 1 - THREE.MathUtils.smoothstep(r, 0.42, 1.02);
    let h =
      ((damped + peak) * this.relief + 5.5) * falloff * falloff + DEEP_SEA;

    if (marsh > 0.001) {
      h = THREE.MathUtils.lerp(h, 0.9, 0.45 * marsh);
      if (h > -0.6) {
        const pool = THREE.MathUtils.smoothstep(
          this.poolNoise.fbm(lx * 0.021, lz * 0.021, 2),
          0.18,
          0.55,
        );
        h = THREE.MathUtils.lerp(h, -0.55, pool * marsh * 0.92);
      }
    }
    return h;
  }

  slopeAt(x: number, z: number): number {
    const e = 1.2;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  forestAt(x: number, z: number): number {
    const lx = x - this.centerX;
    const lz = z - this.centerZ;
    return THREE.MathUtils.clamp(
      this.forestNoise.fbm(lx * 0.011 + 3.1, lz * 0.011 - 8.7, 3) * 0.5 + 0.5,
      0,
      1,
    );
  }

  meadowAt(x: number, z: number): number {
    const lx = x - this.centerX;
    const lz = z - this.centerZ;
    return THREE.MathUtils.clamp(
      this.meadowNoise.fbm(lx * 0.016 - 11.3, lz * 0.016 + 5.9, 3) * 0.5 + 0.5,
      0,
      1,
    );
  }

  regionAt(
    x: number,
    z: number,
    out: RegionSample = blankSample(),
    knownHeight?: number,
  ): RegionSample {
    const b = this.biomeAt(x, z);
    out.height = knownHeight ?? this.heightAt(x, z);
    out.slope = this.slopeAt(x, z);
    out.forest = this.forestAt(x, z);
    out.meadow = this.meadowAt(x, z);
    out.autumn = b.autumn;
    out.marsh = b.marsh;
    return out;
  }

  biomeAt(x: number, z: number): BiomeWeights {
    const lx = x - this.centerX;
    const lz = z - this.centerZ;
    const dist = Math.sqrt(lx * lx + lz * lz);
    return {
      autumn: this.wedgeAt(lx, lz, dist, AUTUMN_ANG, AUTUMN_HALF, false),
      marsh: this.wedgeAt(lx, lz, dist, MARSH_ANG, MARSH_HALF, true),
    };
  }

  /** Takes island-local coordinates; the public samplers convert first. */
  private wedgeAt(
    lx: number,
    lz: number,
    dist: number,
    center: number,
    half: number,
    avoidPeak: boolean,
  ): number {
    const k = this.k;
    if (dist < 34 * k) return 0;
    let a = Math.atan2(lz, lx) - this.baseAngle - center;
    a = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    if (a > Math.PI) a = TWO_PI - a;
    if (a > half + EDGE_SOFT + WARP_MAX) return 0;
    const warp =
      this.biomeWarp.fbm(lx * 0.005 + 31.7, lz * 0.005 - 17.3, 2) * WARP_MAX;
    let w =
      1 -
      THREE.MathUtils.smoothstep(a + warp, half - EDGE_SOFT, half + EDGE_SOFT);
    if (w <= 0) return 0;
    w *= THREE.MathUtils.smoothstep(dist, 34 * k, 80 * k);
    if (avoidPeak && w > 0) {
      const dpx = lx - this.peakX;
      const dpz = lz - this.peakZ;
      w *= THREE.MathUtils.smoothstep(
        Math.sqrt(dpx * dpx + dpz * dpz),
        100 * k,
        170 * k,
      );
    }
    return w;
  }

  /**
   * Build the ground mesh a slice at a time.
   *
   * Colouring a face is the expensive half — a slope needs four extra height
   * samples, and biome weights need four more noise walks on top. At full
   * detail that is a couple of hundred thousand faces, well past a frame. The
   * caller pumps this generator against a millisecond budget so an island can
   * assemble itself while the player is still flying towards it.
   */
  *build(segments: number): Generator<void, THREE.Mesh, void> {
    const size = this.planeSize;
    let geo: THREE.BufferGeometry = new THREE.PlaneGeometry(
      size,
      size,
      segments,
      segments,
    );
    geo.rotateX(-Math.PI / 2);
    yield;

    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const rowStride = segments + 1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + this.centerX;
      const z = pos.getZ(i) + this.centerZ;
      pos.setXYZ(i, x, this.heightAt(x, z), z);
      if (i % (rowStride * 8) === rowStride * 8 - 1) yield;
    }
    yield;

    geo = geo.toNonIndexed();
    yield;

    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      this.faceColor(c, cx, cy, cz);
      for (let v = 0; v < 3; v++) {
        colors[(i + v) * 3] = c.r;
        colors[(i + v) * 3 + 1] = c.g;
        colors[(i + v) * 3 + 2] = c.b;
      }
      if (i % 3072 === 0) yield;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private tmp = new THREE.Color();
  private sample: RegionSample = blankSample();

  private patch(x: number, z: number, scale = 0.024, salt = 0): number {
    const lx = x - this.centerX;
    const lz = z - this.centerZ;
    return THREE.MathUtils.clamp(
      this.tintNoise.fbm(lx * scale + salt, lz * scale - salt, 2) * 0.8 + 0.5,
      0,
      1,
    );
  }

  private edge(x: number, z: number, scale = 0.05, salt = 0): number {
    const lx = x - this.centerX;
    const lz = z - this.centerZ;
    return this.edgeNoise.fbm(lx * scale + salt, lz * scale + salt, 2);
  }

  private faceColor(out: THREE.Color, x: number, y: number, z: number): void {
    const s = this.regionAt(x, z, this.sample, y);
    const slope = s.slope;

    if (y < -0.4) {
      out
        .copy(this.hex(GROUND.seaFloor))
        .lerp(this.hex2(GROUND.sandWet), THREE.MathUtils.clamp(y / -6 + 1, 0, 1));
      if (s.marsh > 0) out.lerp(this.hex2(GROUND.murk), s.marsh * 0.8);
    } else if (y < 0.35) {
      out
        .copy(this.hex(GROUND.sandWet))
        .lerp(this.hex2(GROUND.sand), THREE.MathUtils.clamp((y + 0.4) / 0.75, 0, 1));
      if (s.marsh > 0) out.lerp(this.hex2(GROUND.mud), s.marsh * 0.85);
    } else {
      const line = 1.25 + this.edge(x, z, 0.055) * 0.75;
      if (y < line) out.copy(this.hex(GROUND.sand));
      else this.grassColor(out, x, z, s);
    }

    if (y > 0.3) {
      if (s.autumn > 0 && y > 1.2) {
        this.tmp
          .copy(this.hex(GROUND.autumnA))
          .lerp(this.hex2(GROUND.autumnB), this.patch(x, z, 0.02, 17));
        const drift = this.patch(x, z, 0.06, 41);
        if (s.forest > 0.5 && drift > 0.62) {
          this.tmp.lerp(this.hex2(GROUND.litter), (drift - 0.62) * 2.2);
        }
        out.lerp(this.tmp, s.autumn * 0.78);
      }
      if (s.marsh > 0) {
        this.tmp
          .copy(this.hex(GROUND.marshA))
          .lerp(this.hex2(GROUND.marshB), this.patch(x, z, 0.03, 63));
        if (y < 0.45) this.tmp.lerp(this.hex2(GROUND.mud), 0.7);
        out.lerp(this.tmp, s.marsh * 0.82);
      }
    }

    const rockiness =
      THREE.MathUtils.clamp((slope - 0.45) * 2.4, 0, 1) +
      THREE.MathUtils.clamp((y - 15) * 0.09, 0, 0.7);
    if (rockiness > 0) {
      this.tmp
        .copy(this.hex(GROUND.rock))
        .lerp(this.hex2(GROUND.rockDark), this.patch(x, z, 0.05, 91) * 0.85);
      out.lerp(this.tmp, Math.min(1, rockiness));
    }

    const snowLine = this.snowline - 0.4 + this.edge(x, z, 0.05, 7) * 1.6;
    if (y > snowLine) {
      const cliff = THREE.MathUtils.clamp((slope - 0.45) * 2.4, 0, 1);
      this.tmp
        .copy(this.hex(GROUND.snow))
        .lerp(
          this.hex2(GROUND.snowBright),
          THREE.MathUtils.clamp((y - 22) * 0.2, 0, 1),
        );
      out.lerp(this.tmp, 1 - cliff * 0.8);
    }

    washGround(out, s, this.snowline);

    if (slope > 0.5) {
      const k = 1 - THREE.MathUtils.clamp((slope - 0.5) * 0.55, 0, 0.14);
      out.multiplyScalar(k);
    }

    posterize(out);
  }

  private grassColor(
    out: THREE.Color,
    x: number,
    z: number,
    s: RegionSample,
  ): void {
    const y = s.height;
    out
      .copy(this.hex(GROUND.grass))
      .lerp(this.hex2(GROUND.grassLight), this.patch(x, z));
    if (s.forest > 0.55) {
      out.lerp(this.hex2(GROUND.grassDeep), (s.forest - 0.55) * 1.5);
    }
    if (s.meadow > 0.55) {
      out.lerp(this.hex2(GROUND.meadow), (s.meadow - 0.55) * 1.5);
      if (s.meadow > 0.72) {
        out.lerp(this.hex2(GROUND.meadowWarm), (s.meadow - 0.72) * 1.4);
      }
    }
    if (y > 9) out.lerp(this.hex2(GROUND.dry), Math.min(0.55, (y - 9) * 0.055));
  }

  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  private hex(h: number): THREE.Color {
    return this.c1.setHex(h);
  }
  private hex2(h: number): THREE.Color {
    return this.c2.setHex(h);
  }
}

function blankSample(): RegionSample {
  return { height: 0, slope: 0, forest: 0, meadow: 0, autumn: 0, marsh: 0 };
}

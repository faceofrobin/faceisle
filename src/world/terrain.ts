import * as THREE from "../gl";
import { Noise2D } from "../util/noise";
import { Rng } from "../util/random";
import { snapMaterial } from "../gfx/post";
import { GROUND, RegionSample, posterize, washGround } from "./palette";

const SIZE = 680;
const SEGMENTS = 320;

export interface BiomeWeights {
  autumn: number;
  marsh: number;
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
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly islandRadius = 300;
  readonly snowline = 17.5;
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

  constructor(rng: Rng) {
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
    const pr = this.islandRadius * 0.22;
    this.peakX = Math.cos(this.baseAngle + PEAK_ANG) * pr;
    this.peakZ = Math.sin(this.baseAngle + PEAK_ANG) * pr;
    this.peakSite = new THREE.Vector3(
      this.peakX,
      this.heightAt(this.peakX, this.peakZ),
      this.peakZ,
    );
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
    });
    snapMaterial(this.material);
    this.mesh = this.buildMesh();
  }

  heightAt(x: number, z: number): number {
    const dist = Math.sqrt(x * x + z * z);
    if (dist > this.islandRadius * 1.35) return -3.2;

    const n = this.heightNoise;
    const hills = n.fbm(x * 0.012, z * 0.012, 4) * 7.5;
    const massif = Math.max(
      0,
      n.fbm(x * 0.0032 + 13.7, z * 0.0032 - 4.1, 3) * 19,
    );

    const marsh = this.wedgeAt(x, z, dist, MARSH_ANG, MARSH_HALF, true);
    const damped = hills * (1 - 0.5 * marsh) + massif * (1 - 0.85 * marsh);

    const dpx = x - this.peakX;
    const dpz = z - this.peakZ;
    const d2 = dpx * dpx + dpz * dpz;
    const peak = d2 < 30000 ? 24 * Math.exp(-d2 / 3600) : 0;

    const warp =
      this.maskNoise.fbm(x * 0.008 + 71.3, z * 0.008 + 29.9, 3) * 0.22;
    const r = dist / this.islandRadius + warp;
    const falloff = 1 - THREE.MathUtils.smoothstep(r, 0.42, 1.02);
    let h = (damped + peak + 5.5) * falloff * falloff - 3.2;

    if (marsh > 0.001) {
      h = THREE.MathUtils.lerp(h, 0.9, 0.45 * marsh);
      if (h > -0.6) {
        const pool = THREE.MathUtils.smoothstep(
          this.poolNoise.fbm(x * 0.021, z * 0.021, 2),
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
    return THREE.MathUtils.clamp(
      this.forestNoise.fbm(x * 0.011 + 3.1, z * 0.011 - 8.7, 3) * 0.5 + 0.5,
      0,
      1,
    );
  }

  meadowAt(x: number, z: number): number {
    return THREE.MathUtils.clamp(
      this.meadowNoise.fbm(x * 0.016 - 11.3, z * 0.016 + 5.9, 3) * 0.5 + 0.5,
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
    const dist = Math.sqrt(x * x + z * z);
    return {
      autumn: this.wedgeAt(x, z, dist, AUTUMN_ANG, AUTUMN_HALF, false),
      marsh: this.wedgeAt(x, z, dist, MARSH_ANG, MARSH_HALF, true),
    };
  }

  private wedgeAt(
    x: number,
    z: number,
    dist: number,
    center: number,
    half: number,
    avoidPeak: boolean,
  ): number {
    if (dist < 34) return 0;
    let a = Math.atan2(z, x) - this.baseAngle - center;
    a = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    if (a > Math.PI) a = TWO_PI - a;
    if (a > half + EDGE_SOFT + WARP_MAX) return 0;
    const warp =
      this.biomeWarp.fbm(x * 0.005 + 31.7, z * 0.005 - 17.3, 2) * WARP_MAX;
    let w =
      1 -
      THREE.MathUtils.smoothstep(a + warp, half - EDGE_SOFT, half + EDGE_SOFT);
    if (w <= 0) return 0;
    w *= THREE.MathUtils.smoothstep(dist, 34, 80);
    if (avoidPeak && w > 0) {
      const dpx = x - this.peakX;
      const dpz = z - this.peakZ;
      w *= THREE.MathUtils.smoothstep(
        Math.sqrt(dpx * dpx + dpz * dpz),
        100,
        170,
      );
    }
    return w;
  }

  private buildMesh(): THREE.Mesh {
    let geo: THREE.BufferGeometry = new THREE.PlaneGeometry(
      SIZE,
      SIZE,
      SEGMENTS,
      SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }

    geo = geo.toNonIndexed();

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
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private tmp = new THREE.Color();
  private sample: RegionSample = blankSample();

  private patch(x: number, z: number, scale = 0.024, salt = 0): number {
    return THREE.MathUtils.clamp(
      this.tintNoise.fbm(x * scale + salt, z * scale - salt, 2) * 0.8 + 0.5,
      0,
      1,
    );
  }

  private edge(x: number, z: number, scale = 0.05, salt = 0): number {
    return this.edgeNoise.fbm(x * scale + salt, z * scale + salt, 2);
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

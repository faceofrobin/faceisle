import * as THREE from "../gl";
import { Terrain } from "./terrain";
import { DayCycle } from "./daycycle";
import { Rng } from "../util/random";
import { ProximityGrid } from "../util/proximityGrid";
import { Placement, SpriteBatcher } from "../gfx/billboards";
import { snapMaterial } from "../gfx/post";
import { RegionSample, washTint } from "./palette";
import { TreeKind, makeTreeTexture } from "../gfx/sprites/trees";
import {
  makeBushTexture,
  makeFlowerTexture,
  makeGrassTexture,
  makeReedTexture,
  makeMushroomTexture,
} from "../gfx/sprites/flora";

export class Vegetation {
  private sprites = new SpriteBatcher();
  private treeGrid = new ProximityGrid();
  private cherryGrid = new ProximityGrid();
  private flowerGrid = new ProximityGrid();
  readonly flowerSpots: THREE.Vector3[] = [];
  readonly forestSpots: THREE.Vector3[] = [];
  readonly cherrySpots: THREE.Vector3[] = [];
  readonly autumnSpots: THREE.Vector3[] = [];
  readonly marshSpots: THREE.Vector3[] = [];
  readonly poolSpots: THREE.Vector3[] = [];

  private terrain!: Terrain;
  private sample: RegionSample = {
    height: 0,
    slope: 0,
    forest: 0,
    meadow: 0,
    autumn: 0,
    marsh: 0,
  };

  private regionOf(x: number, z: number, y: number): THREE.Color {
    const out = new THREE.Color();
    const t = this.terrain;
    washTint(
      out,
      t.regionAt(x, z, this.sample, y),
      t.snowline,
      0.85,
    );
    return out;
  }

  constructor(scene: THREE.Scene, terrain: Terrain, rng: Rng) {
    this.terrain = terrain;
    const R = terrain.islandRadius;
    const elders = this.placeTrees(scene, terrain, rng, R);
    this.placeBushes(scene, terrain, rng, R);
    this.placeFlowers(scene, terrain, rng, R);
    this.placeGrassAccents(scene, terrain, rng, R);
    this.placeReeds(scene, terrain, rng, R);
    this.buildLilyPads(scene, terrain, rng, R);
    this.placeMushrooms(scene, terrain, rng, elders);
    this.placeDuneGrass(scene, terrain, rng, R);
  }

  private placeTrees(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): { x: number; z: number }[] {
    const treesByKind: Record<TreeKind, Placement[]> = {
      green: [],
      lime: [],
      cherry: [],
      pine: [],
      elder: [],
      rust: [],
      gold: [],
      willow: [],
      snowpine: [],
    };
    const minDist = 3.6;
    const buckets = new Map<number, { x: number; z: number }[]>();
    const bucketKey = (i: number, j: number) => (i + 2048) * 4096 + (j + 2048);
    const tooCloseTo = (x: number, z: number, d: number): boolean => {
      const span = Math.ceil(d / minDist);
      const ci = Math.floor(x / minDist);
      const cj = Math.floor(z / minDist);
      for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
          const b = buckets.get(bucketKey(ci + i, cj + j));
          if (!b) continue;
          for (const pt of b) {
            const dx = pt.x - x;
            const dz = pt.z - z;
            if (dx * dx + dz * dz < d * d) return true;
          }
        }
      }
      return false;
    };

    const insert = (x: number, z: number): void => {
      const ck = bucketKey(Math.floor(x / minDist), Math.floor(z / minDist));
      const bucket = buckets.get(ck);
      if (bucket) bucket.push({ x, z });
      else buckets.set(ck, [{ x, z }]);
    };

    const elders: { x: number; z: number }[] = [];
    for (let i = 0; i < 6000 && elders.length < 16; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 2 || h > 9.5) continue;
      if (terrain.slopeAt(x, z) > 0.35) continue;
      if (terrain.forestAt(x, z) < 0.68) continue;
      const b = terrain.biomeAt(x, z);
      if (b.marsh > 0.35 || b.autumn > 0.5) continue;
      if (
        elders.some(
          (e) => (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z) < 34 * 34,
        )
      )
        continue;
      elders.push({ x, z });
      insert(x, z);
      treesByKind.elder.push({
        x,
        y: h - 0.15,
        z,
        height: rng.range(10.5, 13.5),
        flip: rng.chance(0.5),
        widthMul: rng.range(0.95, 1.12),
        shade: rng.range(0.94, 1.06),
        region: this.regionOf(x, z, h),
      });
      this.treeGrid.add(x, z);
      this.forestSpots.push(new THREE.Vector3(x, h, z));
    }

    let treeCount = 0;
    let attempts = 0;
    while (treeCount < 1500 && attempts < 52000) {
      attempts++;
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 1.4 || h > 15) continue;
      if (terrain.slopeAt(x, z) > 0.42) continue;
      const b = terrain.biomeAt(x, z);
      if (b.marsh > 0.55) continue;
      const forest = terrain.forestAt(x, z);
      if (rng.next() > (forest - 0.42) * 2.4) continue;
      if (tooCloseTo(x, z, minDist)) continue;
      if (
        elders.some(
          (e) => (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z) < 6.5 * 6.5,
        )
      )
        continue;
      treeCount++;
      insert(x, z);

      let kind: TreeKind;
      if (h > 9.5 && rng.chance(0.75)) kind = "pine";
      else if (rng.next() < b.autumn) kind = rng.chance(0.55) ? "rust" : "gold";
      else if (terrain.meadowAt(x, z) > 0.68 && rng.chance(0.3))
        kind = "cherry";
      else kind = rng.chance(0.55) ? "green" : "lime";

      let height: number;
      if (kind === "pine") height = rng.range(7, 11.5);
      else if (kind === "cherry") height = rng.range(5, 8);
      else height = rng.range(5.5, 9.5);
      treesByKind[kind].push({
        x,
        y: h - 0.15,
        z,
        height,
        flip: rng.chance(0.5),
        widthMul:
          kind === "pine" ? rng.range(0.94, 1.08) : rng.range(0.9, 1.14),
        shade: rng.range(0.94, 1.06),
        region: this.regionOf(x, z, h),
      });
      this.treeGrid.add(x, z);
      if (kind === "cherry") {
        this.cherryGrid.add(x, z);
        this.cherrySpots.push(new THREE.Vector3(x, h, z));
      }
      if (kind === "rust" || kind === "gold") {
        this.autumnSpots.push(new THREE.Vector3(x, h, z));
      }
      if (forest > 0.6) this.forestSpots.push(new THREE.Vector3(x, h, z));
    }

    let snowpines = 0;
    for (let i = 0; i < 14000 && snowpines < 90; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 13.5 || h > 20) continue;
      if (terrain.slopeAt(x, z) > 0.55) continue;
      if (tooCloseTo(x, z, 3.0)) continue;
      snowpines++;
      insert(x, z);
      treesByKind.snowpine.push({
        x,
        y: h - 0.15,
        z,
        height: rng.range(5, 8.5),
        flip: rng.chance(0.5),
        widthMul: rng.range(0.92, 1.06),
        shade: rng.range(0.94, 1.06),
        region: this.regionOf(x, z, h),
      });
      this.treeGrid.add(x, z);
    }

    let willows = 0;
    for (let i = 0; i < 22000 && willows < 70; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const b = terrain.biomeAt(x, z);
      if (b.marsh < 0.45) continue;
      const h = terrain.heightAt(x, z);
      if (h < 0.25 || h > 2.2) continue;
      if (terrain.slopeAt(x, z) > 0.35) continue;
      let nearWater = false;
      for (let a = 0; a < 8 && !nearWater; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (
          terrain.heightAt(x + Math.cos(ang) * 3.5, z + Math.sin(ang) * 3.5) <
          -0.15
        )
          nearWater = true;
      }
      if (!nearWater) continue;
      if (tooCloseTo(x, z, 5)) continue;
      willows++;
      insert(x, z);
      treesByKind.willow.push({
        x,
        y: h - 0.15,
        z,
        height: rng.range(6.5, 9.5),
        flip: rng.chance(0.5),
        widthMul: rng.range(1.0, 1.2),
        shade: rng.range(0.94, 1.06),
        region: this.regionOf(x, z, h),
      });
      this.treeGrid.add(x, z);
      this.forestSpots.push(new THREE.Vector3(x, h, z));
      this.marshSpots.push(new THREE.Vector3(x, h, z));
    }

    const variantCount: Record<TreeKind, number> = {
      green: 6,
      lime: 6,
      cherry: 4,
      pine: 4,
      elder: 3,
      rust: 5,
      gold: 5,
      willow: 4,
      snowpine: 3,
    };
    const kinds: TreeKind[] = [
      "green",
      "lime",
      "cherry",
      "pine",
      "elder",
      "rust",
      "gold",
      "willow",
      "snowpine",
    ];
    for (const kind of kinds) {
      const list = treesByKind[kind];
      if (list.length === 0) continue;
      const nv = Math.min(variantCount[kind], list.length);
      for (let v = 0; v < nv; v++) {
        this.sprites.addBatch(
          scene,
          makeTreeTexture(rng, kind),
          list.filter((_, i) => i % nv === v),
        );
      }
    }

    return elders;
  }

  private placeBushes(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): void {
    const bushes: Placement[] = [];
    for (let i = 0; i < 5000 && bushes.length < 380; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 1.1 || h > 12 || terrain.slopeAt(x, z) > 0.48) continue;
      const b = terrain.biomeAt(x, z);
      if (b.marsh > 0.6) continue;
      const forest = terrain.forestAt(x, z);
      if (forest < 0.48 || forest > 0.88) continue;
      if (rng.next() > forest * 0.55) continue;
      bushes.push({
        x,
        y: h - 0.05,
        z,
        height: rng.range(0.95, 1.75),
        flip: rng.chance(0.5),
        widthMul: rng.range(0.85, 1.2),
        shade: rng.range(0.93, 1.07),
        region: this.regionOf(x, z, h),
      });
    }
    for (let v = 0; v < 3; v++) {
      this.sprites.addBatch(
        scene,
        makeBushTexture(rng),
        bushes.filter((_, i) => i % 3 === v),
      );
    }
  }

  private placeFlowers(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): void {
    const flowersByVariant: Placement[][] = [[], [], [], [], []];
    for (let i = 0; i < 14000; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 0.9 || h > 10 || terrain.slopeAt(x, z) > 0.35) continue;
      const meadow = terrain.meadowAt(x, z);
      if (rng.next() > (meadow - 0.68) * 3.4) continue;
      const b = terrain.biomeAt(x, z);
      if (b.marsh > 0.55) continue;
      if (terrain.forestAt(x, z) > 0.58) continue;
      const v = Math.floor(meadow * 31 + x * 0.05) % 5;
      flowersByVariant[v].push({
        x,
        y: h,
        z,
        height: rng.range(0.48, 0.78),
        flip: rng.chance(0.5),
        region: this.regionOf(x, z, h),
      });
      this.flowerGrid.add(x, z);
      if (rng.chance(0.08)) this.flowerSpots.push(new THREE.Vector3(x, h, z));
    }
    for (let i = 0; i < 4000 && this.flowerSpots.length < 28; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 1 || h > 9 || terrain.slopeAt(x, z) > 0.35) continue;
      if (terrain.meadowAt(x, z) < 0.65) continue;
      if (terrain.biomeAt(x, z).marsh > 0.5) continue;
      this.flowerSpots.push(new THREE.Vector3(x, h, z));
    }
    for (let v = 0; v < 5; v++) {
      if (flowersByVariant[v].length > 0)
        this.sprites.addBatch(
          scene,
          makeFlowerTexture(rng, v),
          flowersByVariant[v],
        );
    }
  }

  private placeGrassAccents(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): void {
    const grassA: Placement[] = [];
    const grassB: Placement[] = [];
    const marshGrass: Placement[] = [];
    for (let i = 0; i < 8000 && grassA.length + grassB.length < 45; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 0.85 || h > 1.55 || terrain.slopeAt(x, z) > 0.35) continue;
      if (terrain.biomeAt(x, z).marsh > 0.45) continue;
      const target = rng.chance(0.5) ? grassA : grassB;
      target.push({
        x,
        y: h,
        z,
        height: rng.range(0.4, 0.62),
        flip: rng.chance(0.5),
        shade: rng.range(0.96, 1.04),
        region: this.regionOf(x, z, h),
      });
    }
    this.sprites.addBatch(scene, makeGrassTexture(rng), grassA);
    this.sprites.addBatch(scene, makeGrassTexture(rng), grassB);
    const SEDGE_PALETTE = [0x3f7a3a, 0x528c46, 0x699e52];
    for (let i = 0; i < 6000 && marshGrass.length < 35; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const b = terrain.biomeAt(x, z);
      if (b.marsh < 0.5) continue;
      const h = terrain.heightAt(x, z);
      if (h < 0.15 || h > 1.1 || terrain.slopeAt(x, z) > 0.4) continue;
      let nearWater = false;
      for (let a = 0; a < 6 && !nearWater; a++) {
        const ang = (a / 6) * Math.PI * 2;
        if (
          terrain.heightAt(x + Math.cos(ang) * 3, z + Math.sin(ang) * 3) < -0.1
        )
          nearWater = true;
      }
      if (!nearWater) continue;
      marshGrass.push({
        x,
        y: h,
        z,
        height: rng.range(0.55, 0.9),
        flip: rng.chance(0.5),
        region: this.regionOf(x, z, h),
      });
    }
    this.sprites.addBatch(
      scene,
      makeGrassTexture(rng, SEDGE_PALETTE),
      marshGrass,
    );
  }

  private placeReeds(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): void {
    const reeds: Placement[] = [];
    for (let i = 0; i < 30000 && reeds.length < 380; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 0.1 || h > 0.7) continue;
      if (terrain.slopeAt(x, z) > 0.35) continue;
      let nearWater = false;
      for (let a = 0; a < 8 && !nearWater; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (
          terrain.heightAt(x + Math.cos(ang) * 4, z + Math.sin(ang) * 4) < -0.25
        )
          nearWater = true;
      }
      if (!nearWater) continue;
      let arc30 = 0;
      let arc50 = 0;
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        if (
          terrain.heightAt(x + Math.cos(ang) * 30, z + Math.sin(ang) * 30) <
          -0.2
        )
          arc30++;
        if (
          terrain.heightAt(x + Math.cos(ang) * 50, z + Math.sin(ang) * 50) <
          -0.2
        )
          arc50++;
      }
      if (arc50 > 2 || arc30 > 5) continue;
      const clump = rng.int(3, 6);
      for (let c = 0; c < clump; c++) {
        const rx = x + rng.range(-1.6, 1.6);
        const rz = z + rng.range(-1.6, 1.6);
        const rh = terrain.heightAt(rx, rz);
        if (rh < 0.05 || rh > 0.9) continue;
        reeds.push({
          x: rx,
          y: rh - 0.05,
          z: rz,
          height: rng.range(0.9, 1.6),
          flip: rng.chance(0.5),
          widthMul: rng.range(0.9, 1.15),
          shade: rng.range(0.94, 1.06),
          region: this.regionOf(rx, rz, rh),
        });
      }
      if (terrain.biomeAt(x, z).marsh > 0.25 && rng.chance(0.5)) {
        this.marshSpots.push(new THREE.Vector3(x, h, z));
      }
    }
    for (let v = 0; v < 2; v++) {
      this.sprites.addBatch(
        scene,
        makeReedTexture(rng),
        reeds.filter((_, i) => i % 2 === v),
      );
    }
  }

  private buildLilyPads(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): void {
    const pads: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 22000 && pads.length < 140; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const b = terrain.biomeAt(x, z);
      if (b.marsh < 0.3) continue;
      const h = terrain.heightAt(x, z);
      if (h < -0.5 || h > -0.08) continue;
      let arc30 = 0;
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        if (
          terrain.heightAt(x + Math.cos(ang) * 30, z + Math.sin(ang) * 30) <
          -0.2
        )
          arc30++;
      }
      if (arc30 > 4) continue;
      const r = rng.range(0.28, 0.5);
      if (
        pads.some(
          (p) =>
            (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) <
            (p.r + r + 0.15) ** 2,
        )
      )
        continue;
      pads.push({ x, z, r });
      if (rng.chance(0.1)) {
        this.marshSpots.push(new THREE.Vector3(x, 0, z));
        this.poolSpots.push(new THREE.Vector3(x, 0, z));
      }
    }
    if (pads.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const PAD_A = new THREE.Color(0x4e8a3c);
    const PAD_B = new THREE.Color(0x6aa84e);
    const BLOSSOM = new THREE.Color(0xf6dce8);
    const BLOSSOM_HEART = new THREE.Color(0xf0c25e);
    const col = new THREE.Color();

    const disc = (
      cx: number,
      cz: number,
      y: number,
      r: number,
      segments: number,
      c: THREE.Color,
    ): void => {
      const a0 = rng.range(0, Math.PI * 2);
      for (let s = 0; s < segments; s++) {
        const a1 = a0 + (s / segments) * Math.PI * 2;
        const a2 = a0 + ((s + 1) / segments) * Math.PI * 2;
        positions.push(cx, y, cz);
        positions.push(cx + Math.cos(a2) * r, y, cz + Math.sin(a2) * r);
        positions.push(cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r);
        for (let v = 0; v < 3; v++) colors.push(c.r, c.g, c.b);
      }
    };

    for (const p of pads) {
      col.copy(PAD_A).lerp(PAD_B, rng.next());
      disc(p.x, p.z, 0.02 + rng.next() * 0.02, p.r, 7, col);
      if (rng.chance(0.12)) {
        col.copy(BLOSSOM);
        disc(p.x + p.r * 0.3, p.z, 0.06, 0.13, 5, col);
        col.copy(BLOSSOM_HEART);
        disc(p.x + p.r * 0.3, p.z, 0.08, 0.05, 4, col);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(colors), 3),
    );
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    snapMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.padMaterial = mat;
  }

  private placeMushrooms(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    elders: { x: number; z: number }[],
  ): void {
    const mushrooms: Placement[] = [];
    const mushroomHosts: { x: number; z: number }[] = [...elders];
    for (let i = 0; i < 12 && i < this.autumnSpots.length; i++) {
      const s = rng.pick(this.autumnSpots);
      mushroomHosts.push({ x: s.x, z: s.z });
    }
    for (const e of mushroomHosts) {
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(2.2, 4.5);
        const mx = e.x + Math.cos(a) * d;
        const mz = e.z + Math.sin(a) * d;
        const mh = terrain.heightAt(mx, mz);
        mushrooms.push({
          x: mx,
          y: mh - 0.02,
          z: mz,
          height: rng.range(0.22, 0.38),
          flip: rng.chance(0.5),
          shade: rng.range(0.95, 1.05),
          region: this.regionOf(mx, mz, mh),
        });
      }
    }
    for (let v = 0; v < 2; v++) {
      this.sprites.addBatch(
        scene,
        makeMushroomTexture(rng),
        mushrooms.filter((_, i) => i % 2 === v),
      );
    }
  }

  private placeDuneGrass(
    scene: THREE.Scene,
    terrain: Terrain,
    rng: Rng,
    R: number,
  ): void {
    const DUNE_PALETTE = [0xb5c088, 0xa3b070, 0xc4cf9a];
    const dune: Placement[] = [];
    for (let i = 0; i < 4000 && dune.length < 28; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      if (Math.sqrt(x * x + z * z) < R * 0.55) continue;
      const h = terrain.heightAt(x, z);
      if (h < 0.55 || h > 1.15 || terrain.slopeAt(x, z) > 0.35) continue;
      dune.push({
        x,
        y: h,
        z,
        height: rng.range(0.38, 0.55),
        flip: rng.chance(0.5),
        shade: rng.range(0.94, 1.06),
        region: this.regionOf(x, z, h),
      });
    }
    for (let v = 0; v < 2; v++) {
      this.sprites.addBatch(
        scene,
        makeGrassTexture(rng, DUNE_PALETTE),
        dune.filter((_, i) => i % 2 === v),
      );
    }
  }

  private padMaterial: THREE.MeshBasicMaterial | null = null;

  update(time: number, day: DayCycle, fog: THREE.Fog): void {
    this.sprites.update(time, day.tint, fog);
    this.padMaterial?.color.copy(day.tint);
  }

  treesNear(p: THREE.Vector3, radius = 24): number {
    return this.treeGrid.countNear(p.x, p.z, radius);
  }

  cherriesNear(p: THREE.Vector3, radius = 24): number {
    return this.cherryGrid.countNear(p.x, p.z, radius);
  }

  flowersNear(p: THREE.Vector3, radius = 16): number {
    return this.flowerGrid.countNear(p.x, p.z, radius);
  }
}

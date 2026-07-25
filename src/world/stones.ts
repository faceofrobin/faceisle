import * as THREE from "../gl";
import { Terrain } from "./terrain";
import { Rng } from "../util/random";
import { snapMaterial } from "../gfx/post";


function vhash(x: number, y: number, z: number, salt: number): number {
  let h =
    (Math.round(x * 53) * 374761393 +
      Math.round(y * 53) * 668265263 +
      Math.round(z * 53) * 2246822519 +
      salt) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface StoneSpec {
  geo: THREE.BufferGeometry;
  mossy: number;
  colA?: THREE.Color;
  colB?: THREE.Color;
}

export class Stones {
  cairnSite: THREE.Vector3 | null = null;
  readonly material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, terrain: Terrain, rng: Rng) {
    const ROCK = new THREE.Color(0x8d8578);
    const ROCK_DARK = new THREE.Color(0x6b6459);
    const MOSS = new THREE.Color(0x6e9a4e);
    const LICHEN = new THREE.Color(0x9aa387);
    const R = terrain.islandRadius;
    const specs: StoneSpec[] = [];
    const tmp = new THREE.Matrix4();

    const addBoulder = (
      x: number,
      z: number,
      size: number,
      mossy: number,
    ): void => {
      const h = terrain.heightAt(x, z);
      const geo = new THREE.IcosahedronGeometry(size, 1);
      this.jitter(geo, rng.int(0, 1 << 30), 0.24);
      const sy = size * rng.range(0.62, 0.85);
      tmp.makeScale(rng.range(0.85, 1.25), sy / size, rng.range(0.85, 1.25));
      geo.applyMatrix4(tmp);
      tmp.makeRotationY(rng.range(0, Math.PI * 2));
      geo.applyMatrix4(tmp);
      geo.translate(x, h + sy * rng.range(0.25, 0.45), z);
      specs.push({ geo, mossy });
    };

    let placed = 0;
    for (let i = 0; i < 6000 && placed < 42; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      const slope = terrain.slopeAt(x, z);
      if (h < 7.5 || h > 20 || slope > 0.6) continue;
      if (rng.chance(0.4)) continue;
      addBoulder(x, z, rng.range(0.5, 1.9), rng.range(0, 0.25));
      placed++;
    }
    let erratics = 0;
    for (let i = 0; i < 6000 && erratics < 12; i++) {
      const x = rng.range(-R, R);
      const z = rng.range(-R, R);
      const h = terrain.heightAt(x, z);
      if (h < 2 || h > 7 || terrain.slopeAt(x, z) > 0.25) continue;
      if (terrain.forestAt(x, z) > 0.62) continue;
      if (rng.chance(0.6)) continue;
      addBoulder(x, z, rng.range(0.7, 1.6), rng.range(0.45, 0.8));
      erratics++;
    }

    let peak = { x: 0, z: 0, h: -Infinity };
    for (let i = 0; i < 4000; i++) {
      const x = rng.range(-R * 0.6, R * 0.6);
      const z = rng.range(-R * 0.6, R * 0.6);
      const h = terrain.heightAt(x, z);
      if (h > peak.h) peak = { x, z, h };
    }
    if (peak.h > 6) {
      this.cairnSite = new THREE.Vector3(peak.x, peak.h, peak.z);
      let cy = peak.h - 0.15;
      let size = rng.range(0.85, 1.05);
      const drift = { x: 0, z: 0 };
      while (size > 0.3) {
        const geo = new THREE.IcosahedronGeometry(size, 1);
        this.jitter(geo, rng.int(0, 1 << 30), 0.2);
        const sy = size * 0.42;
        tmp.makeScale(1, sy / size, 1);
        geo.applyMatrix4(tmp);
        tmp.makeRotationY(rng.range(0, Math.PI * 2));
        geo.applyMatrix4(tmp);
        geo.translate(peak.x + drift.x, cy + sy * 0.55, peak.z + drift.z);
        specs.push({ geo, mossy: 0.12 });
        cy += sy * 0.95;
        size *= rng.range(0.68, 0.8);
        drift.x += rng.range(-0.1, 0.1);
        drift.z += rng.range(-0.1, 0.1);
      }
    }

    let vertCount = 0;
    for (const s of specs) vertCount += s.geo.getAttribute("position").count;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const col = new THREE.Color();
    const nrm = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const stone = new THREE.Color();
    const mossed = new THREE.Color();
    let offset = 0;
    for (const s of specs) {
      const pos = s.geo.getAttribute("position") as THREE.BufferAttribute;
      stone.copy(s.colA ?? ROCK).lerp(s.colB ?? ROCK_DARK, rng.next() * 0.6);
      if (rng.chance(0.12) && !s.colA) stone.lerp(LICHEN, 0.4);
      mossed.copy(stone).lerp(MOSS, s.mossy);
      for (let i = 0; i < pos.count; i += 3) {
        va.fromBufferAttribute(pos, i);
        vb.fromBufferAttribute(pos, i + 1);
        vc.fromBufferAttribute(pos, i + 2);
        cb.subVectors(vc, vb);
        ab.subVectors(va, vb);
        nrm.crossVectors(cb, ab).normalize();
        col.copy(nrm.y > 0.45 ? mossed : stone);
        for (let v = 0; v < 3; v++) {
          const k = i + v;
          positions[(offset + k) * 3] = pos.getX(k);
          positions[(offset + k) * 3 + 1] = pos.getY(k);
          positions[(offset + k) * 3 + 2] = pos.getZ(k);
          colors[(offset + k) * 3] = col.r;
          colors[(offset + k) * 3 + 1] = col.g;
          colors[(offset + k) * 3 + 2] = col.b;
        }
      }
      offset += pos.count;
      s.geo.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
    });
    snapMaterial(this.material);
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  private jitter(
    geo: THREE.BufferGeometry,
    salt: number,
    amount: number,
  ): void {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const m = 1 + (vhash(x, y, z, salt) - 0.5) * 2 * amount;
      pos.setXYZ(i, x * m, y * m, z * m);
    }
  }
}

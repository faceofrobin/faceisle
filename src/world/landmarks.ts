import * as THREE from "../gl";
import { Rng } from "../util/random";
import { snapMaterial } from "../gfx/post";
import { Landmark, Terrain, isBuilt } from "./terrain";

/**
 * The landmarks that stand on an island rather than being it.
 *
 * Both are built the way the boulders and the cairn are: flat-shaded triangles
 * with a colour baked per face and no lighting at all. That is the one kind of
 * geometry this game has, and it holds up from any angle — which matters here,
 * because unlike every other object in the world these are large enough to fly
 * around, and a billboard that turns to follow you gives itself away at that
 * size.
 *
 * Neither is detailed. A colossus at the far end of an island is forty pixels
 * tall; what has to be right is the outline and the fact that it is obviously
 * made rather than grown.
 */

const STONE = 0x8d8578;
const STONE_DARK = 0x6b6459;
const STONE_PALE = 0xa39a8a;
const MOSS = 0x5f8a46;
const LICHEN = 0x9aa387;

const BARK = 0x5c4a32;
const BARK_DARK = 0x463829;
const LEAF = [0x2b6b45, 0x24603e, 0x336f4a, 0x2a7550, 0x35913c];

/** Triangles with a colour each, accumulated and handed over as one mesh. */
class Forge {
  private pos: number[] = [];
  private col: number[] = [];
  private c = new THREE.Color();

  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    colour: THREE.Color,
  ): void {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) this.col.push(colour.r, colour.g, colour.b);
  }

  quad(
    p: number[], q: number[], r: number[], s: number[], colour: THREE.Color,
  ): void {
    this.tri(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2], colour);
    this.tri(p[0], p[1], p[2], r[0], r[1], r[2], s[0], s[1], s[2], colour);
  }

  /**
   * A block with a different footprint top and bottom, turned about its own
   * axis. Everything carved here is one of these — plinth, limbs, head, trunk.
   *
   * The face callback is handed the outward normal, because nothing in this
   * game is lit and a flat-shaded solid all one colour is a silhouette rather
   * than a shape. Shading the faces against a fixed sky and a fixed side is
   * what turns six quads into something with a front and a depth.
   */
  block(o: {
    x: number; y0: number; y1: number; z: number;
    w0: number; d0: number; w1: number; d1: number;
    yaw: number; lean?: number; leanZ?: number;
    face: (up: boolean, nx: number, ny: number, nz: number) => THREE.Color;
  }): void {
    const cos = Math.cos(o.yaw);
    const sin = Math.sin(o.yaw);
    const shift = o.lean ?? 0;
    const shiftZ = o.leanZ ?? 0;
    const corner = (w: number, d: number, y: number, i: number, dx: number, dz: number): number[] => {
      const sx = i === 0 || i === 3 ? -w / 2 : w / 2;
      const sz = i < 2 ? -d / 2 : d / 2;
      return [o.x + dx + sx * cos - sz * sin, y, o.z + dz + sx * sin + sz * cos];
    };
    const lo = [0, 1, 2, 3].map((i) => corner(o.w0, o.d0, o.y0, i, 0, 0));
    const hi = [0, 1, 2, 3].map((i) => corner(o.w1, o.d1, o.y1, i, shift, shiftZ));
    // Local outward normals of the four sides, in corner order.
    const local = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const [lx, lz] = local[i];
      const nx = lx * cos - lz * sin;
      const nz = lx * sin + lz * cos;
      this.quad(lo[i], lo[j], hi[j], hi[i], o.face(false, nx, 0, nz));
    }
    this.quad(hi[0], hi[1], hi[2], hi[3], o.face(true, 0, 1, 0));
    this.quad(lo[3], lo[2], lo[1], lo[0], o.face(false, 0, -1, 0));
  }

  /** A lump, for canopy and rubble: an icosahedron pushed out of true. */
  blob(
    x: number, y: number, z: number,
    radius: number, squash: number, salt: number,
    colour: (up: boolean) => THREE.Color,
  ): void {
    const geo = new THREE.IcosahedronGeometry(radius, 1);
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i);
      const py = p.getY(i);
      const pz = p.getZ(i);
      const m = 1 + (hash3(px, py, pz, salt) - 0.5) * 0.5;
      p.setXYZ(i, px * m + x, py * m * squash + y, pz * m + z);
    }
    for (let i = 0; i < p.count; i += 3) {
      const ay = p.getY(i);
      const by = p.getY(i + 1);
      const cy = p.getY(i + 2);
      this.tri(
        p.getX(i), ay, p.getZ(i),
        p.getX(i + 1), by, p.getZ(i + 1),
        p.getX(i + 2), cy, p.getZ(i + 2),
        colour((ay + by + cy) / 3 > y),
      );
    }
    geo.dispose();
  }

  shade(hex: number, toward: number, amount: number): THREE.Color {
    return this.c.setHex(hex).lerp(_tmp.setHex(toward), amount);
  }

  build(): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.col), 3));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
      // Closed solids, so the inside never shows — but a block with a lean can
      // wind the odd face the wrong way, and a hole in a landmark is far worse
      // than the handful of hidden fragments this costs.
      side: THREE.DoubleSide,
    });
    snapMaterial(material);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    return mesh;
  }
}

const _tmp = new THREE.Color();

function hash3(x: number, y: number, z: number, salt: number): number {
  let h =
    (Math.round(x * 53) * 374761393 +
      Math.round(y * 53) * 668265263 +
      Math.round(z * 53) * 2246822519 +
      salt) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Standing where a face would be lit, if anything here were lit. Nothing is,
 * so this is baked in instead: brighter on top, brighter on one side, and a
 * shadowed back. Without it a stack of blocks is one flat silhouette.
 */
function litness(nx: number, ny: number, nz: number): number {
  return 0.72 + 0.24 * Math.max(0, ny) + 0.16 * Math.max(0, nx * 0.6 - nz * 0.8);
}

/**
 * A weathered figure, facing out to sea.
 *
 * Blocky on purpose — the moment it has a face it starts looking like a bad
 * sculpture, and kept to slabs it reads as something carved a very long time
 * ago by people who are not around to be asked about it. Three things do all
 * the work of saying "figure" rather than "pillar", and all three are about
 * the outline rather than the detail: a narrow neck under a head that is far
 * too big, a waist pinched in between a flared hem and wide shoulders, and
 * daylight between the arms and the body. One arm is gone.
 */
function colossus(forge: Forge, rng: Rng, x: number, y: number, z: number, yaw: number): void {
  const worn = (base: number, mossy = 1) =>
    (up: boolean, nx: number, ny: number, nz: number): THREE.Color => {
      const grain = hash3(x + nx * 7, y + ny * 3, z + nz * 5, 31);
      let c = forge.shade(base, grain > 0.5 ? STONE_PALE : STONE_DARK, grain * 0.4);
      // Rain finds the flat tops, so that is the only place anything grows.
      if (up) c = c.lerp(_tmp.setHex(MOSS), (0.3 + grain * 0.22) * mossy);
      else if (grain > 0.9) c = c.lerp(_tmp.setHex(LICHEN), 0.3);
      return c.multiplyScalar(litness(nx, ny, nz));
    };

  // Plinth, stepped so it reads as a base rather than as more of the figure.
  forge.block({
    x, z, y0: y - 2, y1: y + 1.6, w0: 15, d0: 14, w1: 14, d1: 13,
    yaw, face: worn(STONE_DARK),
  });
  forge.block({
    x, z, y0: y + 1.6, y1: y + 3, w0: 12.4, d0: 11.4, w1: 11, d1: 10,
    yaw, face: worn(STONE_DARK),
  });
  // Robe, flaring to the hem.
  forge.block({
    x, z, y0: y + 3, y1: y + 12, w0: 10.2, d0: 8.4, w1: 6.4, d1: 5.4,
    yaw, face: worn(STONE),
  });
  // Waist — the pinch is what stops the whole thing reading as one slab.
  forge.block({
    x, z, y0: y + 12, y1: y + 15, w0: 6.4, d0: 5.4, w1: 5.8, d1: 5,
    yaw, face: worn(STONE),
  });
  // Chest, widening, leaning back a touch so it looks out rather than down.
  forge.block({
    x, z, y0: y + 15, y1: y + 21.4, w0: 5.8, d0: 5, w1: 8, d1: 5.6,
    yaw, leanZ: -0.4, face: worn(STONE),
  });
  // Shoulders: a slab wider than anything above or below it.
  forge.block({
    x, z: z - 0.4, y0: y + 21.4, y1: y + 23.2, w0: 10.8, d0: 5.8, w1: 9.8, d1: 5.2,
    yaw, face: worn(STONE),
  });
  // Neck. Small, and the single most load-bearing block here.
  forge.block({
    x, z: z - 0.5, y0: y + 23.2, y1: y + 24.8, w0: 3, d0: 3, w1: 2.8, d1: 2.8,
    yaw, face: worn(STONE_DARK, 0.4),
  });
  // Head, deliberately too big for the body, the way old monuments are.
  forge.block({
    x, z: z - 0.6, y0: y + 24.8, y1: y + 29.6, w0: 5.2, d0: 4.8, w1: 4.6, d1: 4.4,
    yaw, face: worn(STONE_PALE),
  });
  // A brow over the face, and the shadow it keeps under it.
  forge.block({
    x, z: z - 1.5, y0: y + 28.2, y1: y + 29.4, w0: 5.8, d0: 2.6, w1: 5.4, d1: 2.2,
    yaw, face: worn(STONE),
  });
  forge.block({
    x, z: z - 1.9, y0: y + 26.4, y1: y + 28.2, w0: 4.4, d0: 1.2, w1: 4.4, d1: 1.2,
    yaw, face: worn(STONE_DARK, 0.2),
  });

  // Arms hanging clear of the body — the gap is the point. One is broken off
  // above the elbow, which says "very old" better than any amount of detail.
  const across = Math.cos(yaw);
  const along = Math.sin(yaw);
  for (const dir of [-1, 1]) {
    const broken = dir < 0;
    const reach = 6.9;
    forge.block({
      x: x + across * dir * reach, z: z + along * dir * reach,
      y0: y + (broken ? 15.4 : 6.6), y1: y + 22.2,
      w0: broken ? 2.8 : 2.4, d0: broken ? 2.8 : 2.4, w1: 3.2, d1: 3.2,
      yaw, lean: -across * dir * 0.9, leanZ: -along * dir * 0.9,
      face: worn(broken ? STONE_DARK : STONE),
    });
  }

  // What fell off, lying at the foot of it.
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(8, 15);
    const r = rng.range(1, 2.6);
    forge.blob(
      x + Math.cos(a) * d, y - 0.6 + r * 0.4, z + Math.sin(a) * d,
      r, rng.range(0.5, 0.8), rng.int(0, 1 << 30),
      (up) => forge.shade(STONE_DARK, up ? MOSS : STONE, up ? 0.3 : 0.4),
    );
  }
}

/**
 * One enormous tree, alone.
 *
 * Built rather than billboarded: at fifty metres you can fly a full circle
 * around it, and a flat quad turning to keep facing you would be obvious. The
 * canopy is a handful of squashed lumps, which is how the boulders are made
 * and reads as foliage at any distance worth looking from.
 */
function elder(forge: Forge, rng: Rng, x: number, y: number, z: number): void {
  const bark = (base: number) =>
    (up: boolean, nx: number, ny: number, nz: number): THREE.Color => {
      const grain = hash3(x + nx * 11, y + ny, z + nz * 5, 17);
      const c = forge.shade(base, grain > 0.5 ? BARK : BARK_DARK, grain * 0.6);
      if (up) c.lerp(_tmp.setHex(MOSS), 0.22);
      return c.multiplyScalar(litness(nx, ny, nz));
    };

  // Roots, splayed out and half buried.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const reach = rng.range(5.5, 9);
    forge.block({
      x: x + Math.cos(a) * reach * 0.5, z: z + Math.sin(a) * reach * 0.5,
      y0: y - 1.6, y1: y + rng.range(1.6, 3.4),
      w0: rng.range(2.6, 4), d0: reach, w1: 1.6, d1: reach * 0.5,
      yaw: a, face: bark(BARK_DARK),
    });
  }

  // Trunk, in a few sections so it can taper and lean.
  let ly = y - 1;
  let lw = 7.4;
  let lx = x;
  let lz = z;
  const sections = 5;
  for (let i = 0; i < sections; i++) {
    const top = y + 6 + (i + 1) * 5.4;
    const w = 7.4 * (1 - (i + 1) / (sections + 1.6));
    const dx = rng.range(-0.7, 0.7);
    const dz = rng.range(-0.7, 0.7);
    forge.block({
      x: lx, z: lz, y0: ly, y1: top, w0: lw, d0: lw, w1: w, d1: w,
      yaw: rng.range(0, Math.PI), lean: dx, leanZ: dz,
      face: bark(BARK),
    });
    lx += dx;
    lz += dz;
    ly = top;
    lw = w;
  }

  // Boughs reaching out under the canopy.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const reach = rng.range(9, 15);
    const base = ly - rng.range(2, 9);
    forge.block({
      x: lx + Math.cos(a) * reach * 0.5, z: lz + Math.sin(a) * reach * 0.5,
      y0: base, y1: base + rng.range(3.5, 6.5),
      w0: 2.4, d0: reach, w1: 1.4, d1: reach * 0.7,
      yaw: a, face: bark(BARK_DARK),
    });
  }

  // Canopy: overlapping lumps, widest low down and closing to a crown.
  const crown = ly + 4;
  for (let i = 0; i < 11; i++) {
    const u = i / 10;
    const a = rng.range(0, Math.PI * 2);
    const spread = 15 * (1 - u * 0.72);
    const hex = LEAF[rng.int(0, LEAF.length)];
    forge.blob(
      lx + Math.cos(a) * spread * rng.range(0.2, 1),
      crown + u * 13 + rng.range(-2, 2),
      lz + Math.sin(a) * spread * rng.range(0.2, 1),
      rng.range(7.5, 11.5) * (1 - u * 0.3),
      rng.range(0.62, 0.8),
      rng.int(0, 1 << 30),
      (up) => forge.shade(hex, up ? 0x8fc45a : 0x14301f, up ? 0.26 : 0.3),
    );
  }
}

/** Builds whatever an island's landmark needs, if it needs anything. */
export class Landmarks {
  readonly kind: Landmark;
  readonly site: THREE.Vector3 | null = null;

  constructor(scene: THREE.Object3D, terrain: Terrain, rng: Rng) {
    this.kind = terrain.landmarkKind;
    if (!isBuilt(this.kind)) return;

    const at = terrain.peakSite;
    // Settle it onto the ground it actually stands on rather than the one
    // sample at the centre, so it never floats on a slope.
    let ground = terrain.heightAt(at.x, at.z);
    for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]] as const) {
      ground = Math.min(ground, terrain.heightAt(at.x + dx, at.z + dz));
    }
    this.site = new THREE.Vector3(at.x, ground, at.z);

    const forge = new Forge();
    if (this.kind === "colossus") {
      // Facing away from the middle of its island, so it looks out to sea.
      const yaw = Math.atan2(at.z - terrain.centerZ, at.x - terrain.centerX);
      colossus(forge, rng, at.x, ground, at.z, yaw);
    } else {
      elder(forge, rng, at.x, ground, at.z);
    }
    scene.add(forge.build());
  }
}

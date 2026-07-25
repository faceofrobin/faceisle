import { Matrix4 } from "./math";

/**
 * Geometry containers and the three primitive generators the world needs.
 *
 * The generators reproduce three's vertex ordering, UV orientation and index
 * winding exactly — the game relies on all three (sprite sheets are sampled
 * with v=1 at the top, and face culling depends on winding).
 *
 * Normals are deliberately never generated: nothing in this game is lit, and no
 * shader references `normal` or `normalMatrix`.
 */

export type TypedArray = Float32Array | Uint16Array | Uint32Array | Uint8Array;

export class BufferAttribute {
  array: TypedArray;
  itemSize: number;
  readonly count: number;
  /** Bumped on every `needsUpdate = true` so the renderer can re-upload. */
  version = 0;
  /** Instanced attributes advance once per instance instead of per vertex. */
  readonly isInstanced: boolean = false;

  constructor(array: TypedArray, itemSize: number) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
  }

  set needsUpdate(value: boolean) {
    if (value) this.version++;
  }

  get needsUpdate(): boolean {
    return false;
  }

  getX(i: number): number {
    return this.array[i * this.itemSize];
  }

  getY(i: number): number {
    return this.array[i * this.itemSize + 1];
  }

  getZ(i: number): number {
    return this.array[i * this.itemSize + 2];
  }

  setX(i: number, x: number): this {
    this.array[i * this.itemSize] = x;
    return this;
  }

  setY(i: number, y: number): this {
    this.array[i * this.itemSize + 1] = y;
    return this;
  }

  setZ(i: number, z: number): this {
    this.array[i * this.itemSize + 2] = z;
    return this;
  }

  setXYZ(i: number, x: number, y: number, z: number): this {
    const o = i * this.itemSize;
    this.array[o] = x;
    this.array[o + 1] = y;
    this.array[o + 2] = z;
    return this;
  }
}

export class InstancedBufferAttribute extends BufferAttribute {
  override readonly isInstanced = true;
}

let nextGeometryId = 1;

export class BufferGeometry {
  readonly id = nextGeometryId++;
  attributes: Record<string, BufferAttribute> = {};
  index: BufferAttribute | null = null;
  /** Set on InstancedBufferGeometry; `null` means "not instanced". */
  instanceCount: number | null = null;

  setAttribute(name: string, attribute: BufferAttribute): this {
    this.attributes[name] = attribute;
    return this;
  }

  getAttribute(name: string): BufferAttribute {
    return this.attributes[name];
  }

  setIndex(index: BufferAttribute | null): this {
    this.index = index;
    return this;
  }

  applyMatrix4(m: Matrix4): this {
    const pos = this.attributes.position;
    if (!pos) return this;
    const e = m.elements;
    const a = pos.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i];
      const y = a[i + 1];
      const z = a[i + 2];
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      const iw = w === 1 || w === 0 ? 1 : 1 / w;
      a[i] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * iw;
      a[i + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * iw;
      a[i + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * iw;
    }
    pos.version++;
    return this;
  }

  rotateX(angle: number): this {
    return this.applyMatrix4(_m.makeRotationX(angle));
  }

  translate(x: number, y: number, z: number): this {
    return this.applyMatrix4(_m.makeTranslation(x, y, z));
  }

  /** Expand indexed data into a flat triangle soup, as three does. */
  toNonIndexed(): BufferGeometry {
    if (!this.index) return this;
    const out = new BufferGeometry();
    const idx = this.index.array;
    for (const name of Object.keys(this.attributes)) {
      const src = this.attributes[name];
      const size = src.itemSize;
      const dst = new Float32Array(idx.length * size);
      for (let i = 0; i < idx.length; i++) {
        const from = idx[i] * size;
        const to = i * size;
        for (let k = 0; k < size; k++) dst[to + k] = src.array[from + k];
      }
      out.setAttribute(name, new BufferAttribute(dst, size));
    }
    return out;
  }

  dispose(): void {
    // GL buffers are released by the renderer's resource cache.
  }
}

export class InstancedBufferGeometry extends BufferGeometry {
  override instanceCount: number | null = 0;
}

const _m = new Matrix4();

export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
    super();
    const halfW = width / 2;
    const halfH = height / 2;
    const gridX = Math.floor(widthSegments);
    const gridY = Math.floor(heightSegments);
    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;
    const segW = width / gridX;
    const segH = height / gridY;

    const vertexCount = gridX1 * gridY1;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    let p = 0;
    let u = 0;
    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segH - halfH;
      for (let ix = 0; ix < gridX1; ix++) {
        positions[p++] = ix * segW - halfW;
        positions[p++] = -y;
        positions[p++] = 0;
        uvs[u++] = ix / gridX;
        uvs[u++] = 1 - iy / gridY;
      }
    }

    const indexCount = gridX * gridY * 6;
    const indices =
      vertexCount > 65535
        ? new Uint32Array(indexCount)
        : new Uint16Array(indexCount);
    let n = 0;
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy;
        const b = ix + gridX1 * (iy + 1);
        const c = ix + 1 + gridX1 * (iy + 1);
        const d = ix + 1 + gridX1 * iy;
        indices[n++] = a; indices[n++] = b; indices[n++] = d;
        indices[n++] = b; indices[n++] = c; indices[n++] = d;
      }
    }

    this.setAttribute("position", new BufferAttribute(positions, 3));
    this.setAttribute("uv", new BufferAttribute(uvs, 2));
    this.setIndex(new BufferAttribute(indices, 1));
  }
}

export class SphereGeometry extends BufferGeometry {
  constructor(radius = 1, widthSegments = 32, heightSegments = 16) {
    super();
    const ws = Math.max(3, Math.floor(widthSegments));
    const hs = Math.max(2, Math.floor(heightSegments));

    const positions: number[] = [];
    const indices: number[] = [];
    const grid: number[][] = [];
    let index = 0;

    for (let iy = 0; iy <= hs; iy++) {
      const row: number[] = [];
      const v = iy / hs;
      for (let ix = 0; ix <= ws; ix++) {
        const u = ix / ws;
        positions.push(
          -radius * Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI),
          radius * Math.cos(v * Math.PI),
          radius * Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI),
        );
        row.push(index++);
      }
      grid.push(row);
    }

    for (let iy = 0; iy < hs; iy++) {
      for (let ix = 0; ix < ws; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];
        if (iy !== 0) indices.push(a, b, d);
        if (iy !== hs - 1) indices.push(b, c, d);
      }
    }

    this.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3),
    );
    this.setIndex(
      new BufferAttribute(
        positions.length / 3 > 65535
          ? new Uint32Array(indices)
          : new Uint16Array(indices),
        1,
      ),
    );
  }
}

const ICO_T = (1 + Math.sqrt(5)) / 2;

const ICO_VERTICES = [
  -1, ICO_T, 0, 1, ICO_T, 0, -1, -ICO_T, 0, 1, -ICO_T, 0,
  0, -1, ICO_T, 0, 1, ICO_T, 0, -1, -ICO_T, 0, 1, -ICO_T,
  ICO_T, 0, -1, ICO_T, 0, 1, -ICO_T, 0, -1, -ICO_T, 0, 1,
];

const ICO_INDICES = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
  1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
  4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];

/** Non-indexed triangle soup, matching three's PolyhedronGeometry output. */
export class IcosahedronGeometry extends BufferGeometry {
  constructor(radius = 1, detail = 0) {
    super();
    const out: number[] = [];
    const cols = detail + 1;

    const lerp3 = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      t: number,
    ): [number, number, number] => [
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      az + (bz - az) * t,
    ];

    for (let f = 0; f < ICO_INDICES.length; f += 3) {
      const ia = ICO_INDICES[f] * 3;
      const ib = ICO_INDICES[f + 1] * 3;
      const ic = ICO_INDICES[f + 2] * 3;
      const ax = ICO_VERTICES[ia], ay = ICO_VERTICES[ia + 1], az = ICO_VERTICES[ia + 2];
      const bx = ICO_VERTICES[ib], by = ICO_VERTICES[ib + 1], bz = ICO_VERTICES[ib + 2];
      const cx = ICO_VERTICES[ic], cy = ICO_VERTICES[ic + 1], cz = ICO_VERTICES[ic + 2];

      // Build the subdivided triangular lattice, then emit it as strips.
      const v: [number, number, number][][] = [];
      for (let i = 0; i <= cols; i++) {
        v[i] = [];
        const aj = lerp3(ax, ay, az, cx, cy, cz, i / cols);
        const bj = lerp3(bx, by, bz, cx, cy, cz, i / cols);
        const rows = cols - i;
        for (let j = 0; j <= rows; j++) {
          v[i][j] =
            j === 0 && i === cols
              ? aj
              : lerp3(aj[0], aj[1], aj[2], bj[0], bj[1], bj[2], j / rows);
        }
      }

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2 * (cols - i) - 1; j++) {
          const k = Math.floor(j / 2);
          if (j % 2 === 0) {
            out.push(...v[i][k + 1], ...v[i + 1][k], ...v[i][k]);
          } else {
            out.push(...v[i][k + 1], ...v[i + 1][k + 1], ...v[i + 1][k]);
          }
        }
      }
    }

    const positions = new Float32Array(out.length);
    for (let i = 0; i < out.length; i += 3) {
      const x = out[i];
      const y = out[i + 1];
      const z = out[i + 2];
      const s = radius / Math.sqrt(x * x + y * y + z * z);
      positions[i] = x * s;
      positions[i + 1] = y * s;
      positions[i + 2] = z * s;
    }
    this.setAttribute("position", new BufferAttribute(positions, 3));
  }
}

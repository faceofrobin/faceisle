/**
 * Math primitives. API-compatible with the slice of three.js this game used.
 *
 * Colours are raw linear triples: the game runs with colour management off and
 * a linear output space, so `setHex` is a plain byte→float divide with no
 * transfer-function conversion anywhere.
 */

const DEG2RAD = Math.PI / 180;

export const MathUtils = {
  DEG2RAD,

  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  },

  lerp(x: number, y: number, t: number): number {
    return (1 - t) * x + t * y;
  },

  /** Hermite ramp. Argument order matches three: value first, then edges. */
  smoothstep(x: number, min: number, max: number): number {
    if (x <= min) return 0;
    if (x >= max) return 1;
    const t = (x - min) / (max - min);
    return t * t * (3 - 2 * t);
  },
};

/** Present only so `ColorManagement.enabled = false` keeps working. */
export const ColorManagement = { enabled: false };

export class Vector2 {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: Vector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
}

export class Vector3 {
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Vector3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  add(v: Vector3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  addScaledVector(v: Vector3, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  subVectors(a: Vector3, b: Vector3): this {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  crossVectors(a: Vector3, b: Vector3): this {
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const bx = b.x;
    const by = b.y;
    const bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  multiplyScalar(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  normalize(): this {
    const l = this.length();
    return l > 0 ? this.multiplyScalar(1 / l) : this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  distanceTo(v: Vector3): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  lerp(v: Vector3, alpha: number): this {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }

  lerpVectors(a: Vector3, b: Vector3, alpha: number): this {
    this.x = a.x + (b.x - a.x) * alpha;
    this.y = a.y + (b.y - a.y) * alpha;
    this.z = a.z + (b.z - a.z) * alpha;
    return this;
  }

  fromBufferAttribute(
    attr: { getX(i: number): number; getY(i: number): number; getZ(i: number): number },
    index: number,
  ): this {
    this.x = attr.getX(index);
    this.y = attr.getY(index);
    this.z = attr.getZ(index);
    return this;
  }

  setFromMatrixPosition(m: Matrix4): this {
    const e = m.elements;
    this.x = e[12];
    this.y = e[13];
    this.z = e[14];
    return this;
  }

  /** Full projective transform, including the perspective divide. */
  applyMatrix4(m: Matrix4): this {
    const { x, y, z } = this;
    const e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
}

export class Color {
  r = 1;
  g = 1;
  b = 1;

  constructor(r?: number | Color, g?: number, b?: number) {
    if (r === undefined) return;
    if (typeof r === "object") this.copy(r);
    else if (g === undefined || b === undefined) this.setHex(r);
    else this.setRGB(r, g, b);
  }

  setHex(hex: number): this {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    return this;
  }

  setRGB(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  copy(c: Color): this {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }

  clone(): Color {
    return new Color(this.r, this.g, this.b);
  }

  lerp(c: Color, alpha: number): this {
    this.r += (c.r - this.r) * alpha;
    this.g += (c.g - this.g) * alpha;
    this.b += (c.b - this.b) * alpha;
    return this;
  }

  lerpColors(a: Color, b: Color, alpha: number): this {
    this.r = a.r + (b.r - a.r) * alpha;
    this.g = a.g + (b.g - a.g) * alpha;
    this.b = a.b + (b.b - a.b) * alpha;
    return this;
  }

  multiply(c: Color): this {
    this.r *= c.r;
    this.g *= c.g;
    this.b *= c.b;
    return this;
  }

  multiplyScalar(s: number): this {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
}

export type EulerOrder = "XYZ" | "YXZ";

export class Euler {
  x = 0;
  y = 0;
  z = 0;
  order: EulerOrder = "XYZ";

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}

/** Column-major 4x4, same memory layout as three's `Matrix4.elements`. */
export class Matrix4 {
  elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  identity(): this {
    const e = this.elements;
    e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
    e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  copy(m: Matrix4): this {
    this.elements.set(m.elements);
    return this;
  }

  makeScale(x: number, y: number, z: number): this {
    const e = this.elements;
    e[0] = x; e[4] = 0; e[8] = 0; e[12] = 0;
    e[1] = 0; e[5] = y; e[9] = 0; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = z; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  makeTranslation(x: number, y: number, z: number): this {
    const e = this.elements;
    e[0] = 1; e[4] = 0; e[8] = 0; e[12] = x;
    e[1] = 0; e[5] = 1; e[9] = 0; e[13] = y;
    e[2] = 0; e[6] = 0; e[10] = 1; e[14] = z;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  makeRotationX(theta: number): this {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const e = this.elements;
    e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
    e[1] = 0; e[5] = c; e[9] = -s; e[13] = 0;
    e[2] = 0; e[6] = s; e[10] = c; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  makeRotationY(theta: number): this {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const e = this.elements;
    e[0] = c; e[4] = 0; e[8] = s; e[12] = 0;
    e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
    e[2] = -s; e[6] = 0; e[10] = c; e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }

  /** Only the orders the game actually uses: XYZ (identity-ish) and YXZ. */
  makeRotationFromEuler(euler: Euler): this {
    const e = this.elements;
    const x = euler.x;
    const y = euler.y;
    const z = euler.z;
    const a = Math.cos(x);
    const b = Math.sin(x);
    const c = Math.cos(y);
    const d = Math.sin(y);
    const f = Math.cos(z);
    const g = Math.sin(z);

    if (euler.order === "YXZ") {
      const ce = c * f;
      const cf = c * g;
      const de = d * f;
      const df = d * g;
      e[0] = ce + df * b;
      e[4] = de * b - cf;
      e[8] = a * d;
      e[1] = a * g;
      e[5] = a * f;
      e[9] = -b;
      e[2] = cf * b - de;
      e[6] = df + ce * b;
      e[10] = a * c;
    } else {
      const ae = a * f;
      const af = a * g;
      const be = b * f;
      const bf = b * g;
      e[0] = c * f;
      e[4] = -c * g;
      e[8] = d;
      e[1] = af + be * d;
      e[5] = ae - bf * d;
      e[9] = -b * c;
      e[2] = bf - ae * d;
      e[6] = be + af * d;
      e[10] = a * c;
    }

    e[3] = 0; e[7] = 0; e[11] = 0;
    e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 1;
    return this;
  }

  compose(position: Vector3, rotation: Euler, scale: Vector3): this {
    this.makeRotationFromEuler(rotation);
    const e = this.elements;
    e[0] *= scale.x; e[1] *= scale.x; e[2] *= scale.x;
    e[4] *= scale.y; e[5] *= scale.y; e[6] *= scale.y;
    e[8] *= scale.z; e[9] *= scale.z; e[10] *= scale.z;
    e[12] = position.x;
    e[13] = position.y;
    e[14] = position.z;
    return this;
  }

  multiplyMatrices(a: Matrix4, b: Matrix4): this {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];

    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
  }

  /**
   * Inverse of a rigid transform (rotation + translation, unit scale).
   * That is all a camera ever carries here, so the general cofactor inverse
   * would be wasted work.
   */
  invertRigid(m: Matrix4): this {
    const s = m.elements;
    const t = this.elements;
    t[0] = s[0]; t[4] = s[1]; t[8] = s[2];
    t[1] = s[4]; t[5] = s[5]; t[9] = s[6];
    t[2] = s[8]; t[6] = s[9]; t[10] = s[10];
    const x = s[12];
    const y = s[13];
    const z = s[14];
    t[12] = -(t[0] * x + t[4] * y + t[8] * z);
    t[13] = -(t[1] * x + t[5] * y + t[9] * z);
    t[14] = -(t[2] * x + t[6] * y + t[10] * z);
    t[3] = 0; t[7] = 0; t[11] = 0; t[15] = 1;
    return this;
  }

  makePerspective(
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number,
  ): this {
    const e = this.elements;
    const x = (2 * near) / (right - left);
    const y = (2 * near) / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    const c = -(far + near) / (far - near);
    const d = (-2 * far * near) / (far - near);
    e[0] = x; e[4] = 0; e[8] = a; e[12] = 0;
    e[1] = 0; e[5] = y; e[9] = b; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = c; e[14] = d;
    e[3] = 0; e[7] = 0; e[11] = -1; e[15] = 0;
    return this;
  }

  makeOrthographic(
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number,
  ): this {
    const e = this.elements;
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);
    const x = (right + left) * w;
    const y = (top + bottom) * h;
    const z = (far + near) * p;
    e[0] = 2 * w; e[4] = 0; e[8] = 0; e[12] = -x;
    e[1] = 0; e[5] = 2 * h; e[9] = 0; e[13] = -y;
    e[2] = 0; e[6] = 0; e[10] = -2 * p; e[14] = -z;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
    return this;
  }
}

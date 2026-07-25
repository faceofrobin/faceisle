import * as THREE from '../gl';

/** Default full day/night cycle length in seconds (9 minutes). */
export const DEFAULT_DAY_LENGTH = 540;
export const MIN_DAY_LENGTH = 180;
export const MAX_DAY_LENGTH = 1800;

interface Keyframe {
  t: number;
  skyTop: number;
  horizon: number;
  light: number;
  lightI: number;
  hemiSky: number;
  hemiGround: number;
  cloud: number;
  waterDeep: number;
  waterLight: number;
  tint: number;
  star: number;
}

const KEYS: Keyframe[] = [
  { t: 0.00, skyTop: 0x141a45, horizon: 0x2c3a6e, light: 0xb6c2f0, lightI: 0.4, hemiSky: 0x46538c, hemiGround: 0x2a3158, cloud: 0x3c4a7e, waterDeep: 0x16323a, waterLight: 0x24484e, tint: 0x525c8c, star: 1.0 },
  { t: 0.20, skyTop: 0x2c3468, horizon: 0x6e5f92, light: 0xaab6e8, lightI: 0.28, hemiSky: 0x5e68a4, hemiGround: 0x343a64, cloud: 0x6f6890, waterDeep: 0x1d3c42, waterLight: 0x315258, tint: 0x666a92, star: 0.55 },
  { t: 0.26, skyTop: 0x5a6ab2, horizon: 0xffbe8e, light: 0xffc890, lightI: 0.78, hemiSky: 0xb2aede, hemiGround: 0x6e6c54, cloud: 0xffccb0, waterDeep: 0x2a5a5c, waterLight: 0xc08a72, tint: 0xe8c8ae, star: 0.0 },
  { t: 0.33, skyTop: 0x55a2e2, horizon: 0xcfe8ef, light: 0xfff0d0, lightI: 1.05, hemiSky: 0xb8d4ea, hemiGround: 0x6e8a58, cloud: 0xffffff, waterDeep: 0x2d8078, waterLight: 0x63b39e, tint: 0xffffff, star: 0.0 },
  { t: 0.50, skyTop: 0x3f97e8, horizon: 0xbfe6f2, light: 0xfff6e0, lightI: 1.15, hemiSky: 0xc2ddf0, hemiGround: 0x74925c, cloud: 0xffffff, waterDeep: 0x2e8a80, waterLight: 0x6cbca4, tint: 0xffffff, star: 0.0 },
  { t: 0.66, skyTop: 0x4a8ed8, horizon: 0xe8e2b8, light: 0xffe8b0, lightI: 1.0, hemiSky: 0xb0cce2, hemiGround: 0x6e8a58, cloud: 0xfff4dc, waterDeep: 0x2f8474, waterLight: 0x8cc09c, tint: 0xfff2d8, star: 0.0 },
  { t: 0.74, skyTop: 0x6a5fae, horizon: 0xff9660, light: 0xff9a58, lightI: 0.8, hemiSky: 0xb89ecc, hemiGround: 0x746456, cloud: 0xffb48e, waterDeep: 0x36585c, waterLight: 0xd08a66, tint: 0xf0bc96, star: 0.0 },
  { t: 0.80, skyTop: 0x3a3878, horizon: 0xb06a80, light: 0xc88ba8, lightI: 0.42, hemiSky: 0x7268aa, hemiGround: 0x3e3a5e, cloud: 0x8a6a92, waterDeep: 0x253f48, waterLight: 0x6c5c68, tint: 0x92809e, star: 0.35 },
  { t: 0.87, skyTop: 0x141a45, horizon: 0x2c3a6e, light: 0xb6c2f0, lightI: 0.4, hemiSky: 0x46538c, hemiGround: 0x2a3158, cloud: 0x3c4a7e, waterDeep: 0x16323a, waterLight: 0x24484e, tint: 0x525c8c, star: 1.0 },
];

export class DayCycle {
  t: number;

  readonly skyTop = new THREE.Color();
  readonly horizon = new THREE.Color();
  readonly light = new THREE.Color();
  lightI = 1;
  readonly hemiSky = new THREE.Color();
  readonly hemiGround = new THREE.Color();
  readonly cloud = new THREE.Color();
  readonly waterDeep = new THREE.Color();
  readonly waterLight = new THREE.Color();
  readonly tint = new THREE.Color();
  star = 0;

  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  daylight = 0;

  private _dayLength = DEFAULT_DAY_LENGTH;
  private colA = new THREE.Color();
  private colB = new THREE.Color();

  constructor(startT = 0.29) {
    this.t = startT;
    this.update(0);
  }

  /** Full day/night cycle length in seconds. */
  get dayLength(): number {
    return this._dayLength;
  }

  setDayLength(seconds: number): void {
    this._dayLength = THREE.MathUtils.clamp(
      seconds,
      MIN_DAY_LENGTH,
      MAX_DAY_LENGTH,
    );
  }

  update(dt: number): void {
    this.t = (this.t + dt / this._dayLength) % 1;

    const theta = (this.t - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(theta), Math.sin(theta), 0.35).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    this.daylight = THREE.MathUtils.smoothstep(this.sunDir.y, -0.08, 0.14);

    let a = KEYS[KEYS.length - 1];
    let b = KEYS[0];
    let span = 1 - a.t + b.t;
    let local = this.t >= a.t ? this.t - a.t : this.t + 1 - a.t;
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (this.t >= KEYS[i].t && this.t < KEYS[i + 1].t) {
        a = KEYS[i];
        b = KEYS[i + 1];
        span = b.t - a.t;
        local = this.t - a.t;
        break;
      }
    }
    const f = THREE.MathUtils.smoothstep(local / span, 0, 1);

    this.mix(this.skyTop, a.skyTop, b.skyTop, f);
    this.mix(this.horizon, a.horizon, b.horizon, f);
    this.mix(this.light, a.light, b.light, f);
    this.mix(this.hemiSky, a.hemiSky, b.hemiSky, f);
    this.mix(this.hemiGround, a.hemiGround, b.hemiGround, f);
    this.mix(this.cloud, a.cloud, b.cloud, f);
    this.mix(this.waterDeep, a.waterDeep, b.waterDeep, f);
    this.mix(this.waterLight, a.waterLight, b.waterLight, f);
    this.mix(this.tint, a.tint, b.tint, f);
    this.lightI = THREE.MathUtils.lerp(a.lightI, b.lightI, f);
    this.star = THREE.MathUtils.lerp(a.star, b.star, f);
  }

  private mix(out: THREE.Color, hexA: number, hexB: number, f: number): void {
    this.colA.setHex(hexA);
    this.colB.setHex(hexB);
    out.lerpColors(this.colA, this.colB, f);
  }
}

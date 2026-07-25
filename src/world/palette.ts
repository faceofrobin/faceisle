import * as THREE from "../gl";
import { DITHER_LEVELS } from "../gfx/post";


export const GROUND = {
  grassDeep: 0x2f8a3c,
  grass: 0x5faf34,
  grassLight: 0x7cc23c,
  meadow: 0x93cc3e,
  meadowWarm: 0xb0d244,
  dry: 0xb59a34,

  sand: 0xd6ca74,
  sandWet: 0xb0a356,
  seaFloor: 0xa2925e,

  rock: 0x9c968e,
  rockDark: 0x77726a,

  snow: 0xe6edf3,
  snowBright: 0xf6fafd,

  autumnA: 0x8f8a34,
  autumnB: 0xa87c2c,
  litter: 0xb04a24,

  marshA: 0x4e7a44,
  marshB: 0x3c6440,
  mud: 0x6e6042,
  murk: 0x39563a,
} as const;


export interface RegionSample {
  height: number;
  slope: number;
  forest: number;
  meadow: number;
  autumn: number;
  marsh: number;
}

interface Zone {
  wash: number;
  washAmt: number;
  haze: number;
  hazeAmt: number;
}

const SHORE = 0;
const MEADOW = 1;
const WOOD = 2;
const AUTUMN = 3;
const FEN = 4;
const UPLAND = 5;
const SNOW = 6;
const ZONE_COUNT = 7;

const ZONES: Zone[] = [
  { wash: 0xc6c86c, washAmt: 0.16, haze: 0xe4e4c2, hazeAmt: 0.26 },
  { wash: 0xa8cf46, washAmt: 0.26, haze: 0xd6e6b4, hazeAmt: 0.3 },
  { wash: 0x2f7a44, washAmt: 0.3, haze: 0x8fb0a2, hazeAmt: 0.36 },
  { wash: 0xb0692a, washAmt: 0.44, haze: 0xd0b0a2, hazeAmt: 0.55 },
  { wash: 0x5a7550, washAmt: 0.38, haze: 0xa8b8a4, hazeAmt: 0.44 },
  { wash: 0xa89a64, washAmt: 0.26, haze: 0xa4aac6, hazeAmt: 0.42 },
  { wash: 0xc8d6e2, washAmt: 0.34, haze: 0xc6d4e6, hazeAmt: 0.5 },
];

function ramp(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function zoneWeights(
  out: Float64Array,
  s: RegionSample,
  snowline: number,
): void {
  const temperate = (1 - s.autumn) * (1 - s.marsh);
  const low = 1 - ramp(s.height, 0.6, 2.2);

  out[SHORE] = low * temperate;
  out[MEADOW] =
    ramp(s.meadow, 0.56, 0.82) * (1 - ramp(s.forest, 0.5, 0.75)) * temperate;
  out[WOOD] = ramp(s.forest, 0.5, 0.82) * temperate;
  out[AUTUMN] = s.autumn;
  out[FEN] = s.marsh;
  out[UPLAND] =
    ramp(s.height, 8.5, 16) * (1 - ramp(s.height, snowline - 2, snowline + 3));
  out[SNOW] = ramp(s.height, snowline - 2, snowline + 3);
}

const scratchW = new Float64Array(ZONE_COUNT);
const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

function blendZones(
  outCol: THREE.Color,
  s: RegionSample,
  snowline: number,
  pick: (z: Zone) => number,
  amount: (z: Zone) => number,
): number {
  zoneWeights(scratchW, s, snowline);
  let total = 0;
  let amt = 0;
  outCol.setRGB(0, 0, 0);
  for (let i = 0; i < ZONE_COUNT; i++) {
    const w = scratchW[i];
    if (w <= 0.0001) continue;
    scratchA.setHex(pick(ZONES[i]));
    outCol.r += scratchA.r * w;
    outCol.g += scratchA.g * w;
    outCol.b += scratchA.b * w;
    total += w;
    amt += amount(ZONES[i]) * w;
  }
  if (total <= 0.0001) return 0;
  outCol.r /= total;
  outCol.g /= total;
  outCol.b /= total;
  return amt / Math.max(1, total);
}

const pickWash = (z: Zone): number => z.wash;
const amtWash = (z: Zone): number => z.washAmt;
const pickHaze = (z: Zone): number => z.haze;
const amtHaze = (z: Zone): number => z.hazeAmt;

export function washGround(
  out: THREE.Color,
  s: RegionSample,
  snowline: number,
  scale = 1,
): void {
  const amt = blendZones(scratchB, s, snowline, pickWash, amtWash);
  if (amt > 0.0001) out.lerp(scratchB, amt * scale);
}

export function washTint(
  out: THREE.Color,
  s: RegionSample,
  snowline: number,
  scale = 1,
): void {
  const amt = blendZones(scratchB, s, snowline, pickWash, amtWash) * scale;
  out.setRGB(1, 1, 1);
  if (amt <= 0.0001) return;
  normalize(scratchB);
  out.lerp(scratchB, amt);
}

export function hazeTint(
  out: THREE.Color,
  s: RegionSample,
  snowline: number,
  scale = 1,
): void {
  const amt = blendZones(scratchB, s, snowline, pickHaze, amtHaze) * scale;
  out.setRGB(1, 1, 1);
  if (amt <= 0.0001) return;
  normalize(scratchB);
  out.lerp(scratchB, amt);
}

function normalize(c: THREE.Color): void {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  if (l < 0.02) return;
  c.r /= l;
  c.g /= l;
  c.b /= l;
}

export function posterize(c: THREE.Color, steps = DITHER_LEVELS - 1): void {
  c.r = Math.round(c.r * steps) / steps;
  c.g = Math.round(c.g * steps) / steps;
  c.b = Math.round(c.b * steps) / steps;
}

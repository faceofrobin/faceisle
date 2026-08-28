import { PixelSprite, RGB, Stamp, rgb, stamped } from "./painter";

/**
 * Wings, seen from inside the act of flight.
 *
 * They are deliberately not assigned to a species. The silhouette remains
 * organic enough to communicate lift, while broad monochrome panels replace
 * literal feathers. The result is part wing, part graphic shadow: a temporary
 * form through which the player climbs toward The Face.
 */

export const WING_FRAMES = 6;
export const WING_W = 132;
export const WING_H = 104;
/** Where the shoulder sits in the sprite. Every frame turns about this. */
const PIVOT_X = 14;
const PIVOT_Y = 88;

/** Sweep of the arm, in radians above and below level. */
const UP = 0.78;
const DOWN = -0.36;

/** The upright wing's own bitmap. */
const LW = 118;
const LH = 62;
const ROOT_Y = 46;

const EDGE = rgb(0x080808);
const PLANE = rgb(0x2f2f2f);
const SHEEN = rgb(0x686868);
const PALE = rgb(0xb8b8b8);

/** Leading edge — the top of the wing, in bitmap rows (smaller is higher). */
function lead(u: number): number {
  return ROOT_Y - (4 + 30 * Math.sin(Math.min(1, u * 1.12) * Math.PI * 0.58));
}

/** Depth of the wing below its leading edge. */
function chord(u: number): number {
  const swell = Math.sin(Math.min(1, u * 3.4) * Math.PI * 0.5);
  return 3 + 40 * swell * Math.pow(1 - u, 0.62);
}

/** Where the hand starts, and the point the primaries radiate from. */
const WRIST_U = 0.42;
const WRIST_X = WRIST_U * (LW - 1);

/** The upright wing. */
function upright(): Stamp {
  const px = new Stamp(LW, LH);
  const put = (x: number, y: number, c: RGB): void => px.set(x, y, c);

  for (let x = 0; x < LW; x++) {
    const u = x / (LW - 1);
    const top = lead(u);
    const deep = chord(u);
    for (let y = Math.floor(top); y <= top + deep; y++) {
      const d = (y - top) / Math.max(1, deep);

      // Four broad tonal panels suggest motion and structure without drawing
      // individual feathers or claiming a particular animal.
      const panel = Math.floor((u * 2.4 + d) * 4) & 1;
      put(
        x,
        y,
        d < 0.1 ? EDGE : d > 0.86 ? PALE : d > 0.58 ? SHEEN : panel ? PLANE : EDGE,
      );
    }
  }

  // A black structural band keeps the form from becoming a flat gray paddle.
  for (let x = 0; x < WRIST_X; x++) {
    const u = x / (LW - 1);
    const top = lead(u);
    const deep = chord(u);
    for (let y = Math.floor(top + deep * 0.3); y <= top + deep * 0.55; y++) {
      if (px.at(x, Math.round(y))) put(x, y, EDGE);
    }
  }

  return px;
}

/** One right wing per frame, from the top of the upstroke to the bottom. */
export function makeWingTextures(): PixelSprite[] {
  const wing = upright();
  const out: PixelSprite[] = [];
  for (let f = 0; f < WING_FRAMES; f++) {
    const t = f / (WING_FRAMES - 1);
    out.push(
      stamped(wing, {
        width: WING_W,
        height: WING_H,
        pivot: [0, ROOT_Y],
        at: [PIVOT_X, PIVOT_Y],
        angle: UP + (DOWN - UP) * t,
      }),
    );
  }
  return out;
}

import { PixelSprite, RGB, Stamp, rgb, stamped } from "./painter";

/**
 * The raven's wing, seen from inside the bird.
 *
 * Drawn once, upright, as a filled outline — a leading edge arcing up out of
 * the shoulder, a trailing edge sweeping back, and slits radiating from the
 * wrist that separate the primaries — then turned about the shoulder for each
 * frame of the stroke. Cutting the feathers out of a solid wing is what makes
 * it a wing; building it up from strokes instead reads as a handful of knives.
 *
 * Sized so that on screen it lands near one texel per pixel of the game's
 * internal buffer, like every other sprite here. Magnifying a small sprite to
 * fill this much of the frame is what made earlier attempts look like blades.
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

const QUILL = rgb(0x151925);
const FEATHER = rgb(0x262c3e);
const SHEEN = rgb(0x3d4563);
const PALE = rgb(0x596489);

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
const WRIST_Y = lead(WRIST_U) + chord(WRIST_U) * 0.42;

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

      // Out past the wrist the wing is a hand of primaries. The gaps between
      // them radiate from the wrist and open toward the trailing edge, so the
      // tip comes out scalloped rather than blunt — and you see sky through
      // it, which is most of what says "feathers" at this size.
      if (u > WRIST_U) {
        const a = Math.atan2(y - WRIST_Y, x - WRIST_X + 0.001);
        const slot = (a + 1.2) / 0.36;
        const gap = Math.abs(slot - Math.round(slot));
        const reach = (u - WRIST_U) / (1 - WRIST_U);
        if (gap < 0.05 + 0.2 * reach) continue;
      }

      put(x, y, d < 0.1 ? QUILL : d > 0.86 ? PALE : d > 0.62 ? SHEEN : FEATHER);
    }
  }

  // Coverts: a darker band lying over the arm, so the wing has a near edge and
  // a far one instead of being one flat silhouette.
  for (let x = 0; x < WRIST_X; x++) {
    const u = x / (LW - 1);
    const top = lead(u);
    const deep = chord(u);
    for (let y = Math.floor(top + deep * 0.3); y <= top + deep * 0.55; y++) {
      if (px.at(x, Math.round(y))) put(x, y, QUILL);
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

import * as THREE from '../../gl';
import { hash2 } from '../../util/random';


export interface PixelSprite {
  texture: THREE.Texture;
  width: number;
  height: number;
}

export type RGB = [number, number, number];

export function rgb(hex: number): RGB {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export class Painter {
  readonly w: number;
  readonly h: number;
  private data: Uint8ClampedArray;
  private canvas: HTMLCanvasElement;
  private img: ImageData;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = new ImageData(w, h);
    this.data = this.img.data;
  }

  set(x: number, y: number, c: RGB): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }

  filled(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] > 0;
  }

  toSprite(): PixelSprite {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.img, 0, 0);
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return { texture, width: this.w, height: this.h };
  }
}

/**
 * A little bitmap drawn once and then stamped out at an angle.
 *
 * Anything that turns — a wing through its stroke, say — is drawn upright here
 * and baked into a frame per angle. Turning the drawing rather than the quad is
 * what keeps every frame's pixels square to the screen, which the rest of this
 * game's art also is.
 */
export class Stamp {
  readonly w: number;
  readonly h: number;
  private cells: (RGB | null)[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = new Array(w * h).fill(null);
  }

  set(x: number, y: number, c: RGB): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.cells[iy * this.w + ix] = c;
  }

  at(x: number, y: number): RGB | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.cells[y * this.w + x];
  }
}

export interface StampOptions {
  width: number;
  height: number;
  /** Point in the stamp that lands on `at`; defaults to its middle. */
  pivot?: [number, number];
  /** Where in the sprite the pivot lands; defaults to the sprite's middle. */
  at?: [number, number];
  /** Radians. Positive lifts the stamp's +x end toward the top of the frame. */
  angle?: number;
  /** Face the other way. */
  mirror?: boolean;
}

/**
 * Stamp a bitmap into a sprite, turned. Sampled backwards from the sprite, so
 * every pixel is filled exactly once and the turn leaves no gaps.
 */
export function stamped(stamp: Stamp, o: StampOptions): PixelSprite {
  const [px, py] = o.pivot ?? [stamp.w / 2, stamp.h / 2];
  const [ax, ay] = o.at ?? [o.width / 2, o.height / 2];
  const angle = o.angle ?? 0;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const p = new Painter(o.width, o.height);

  for (let y = 0; y < o.height; y++) {
    for (let x = 0; x < o.width; x++) {
      const dx = (o.mirror ? o.width - 1 - x : x) - ax;
      // Sprite rows run downward, so lifting the +x end means flipping y here.
      const dy = ay - y;
      const c = stamp.at(
        Math.round(px + dx * cos - dy * sin),
        Math.round(py - (dx * sin + dy * cos)),
      );
      if (c) p.set(x, y, c);
    }
  }
  return p.toSprite();
}

export interface Blob {
  cx: number;
  cy: number;
  r: number;
}

export function inBlobs(blobs: Blob[], x: number, y: number, salt: number, jitter = 0.22, sx = 1): boolean {
  for (const b of blobs) {
    const dx = (x - b.cx) / sx;
    const dy = y - b.cy;
    const edge = b.r * (1 - jitter / 2 + hash2(x + salt, y - salt) * jitter);
    if (dx * dx + dy * dy < edge * edge) return true;
  }
  return false;
}

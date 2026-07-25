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

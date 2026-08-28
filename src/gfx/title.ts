import * as THREE from "../gl";
import { sampleFaceDistance } from "../world/faceTerrainMask";
import { Painter, RGB, rgb } from "./sprites/painter";
import { TARGET_ROWS } from "./post";

const GLYPHS: Record<string, string[]> = {
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
};

export class TitleScreen {
  readonly scene = new THREE.Scene();
  private dimMat: THREE.MeshBasicMaterial;
  private logoMat: THREE.MeshBasicMaterial;
  private logo: THREE.Mesh;
  private logoW: number;
  private logoH: number;
  private fade = 0;
  private leaving = false;
  private age = 0;

  constructor() {
    this.dimMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      toneMapped: false,
    });
    const dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dimMat);
    dim.frustumCulled = false;
    dim.renderOrder = 0;
    this.scene.add(dim);

    const logoSprite = paintFaceisle();
    this.logoW = logoSprite.width;
    this.logoH = logoSprite.height;
    this.logoMat = new THREE.MeshBasicMaterial({
      map: logoSprite.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      toneMapped: false,
    });
    this.logo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.logoMat);
    this.logo.frustumCulled = false;
    this.logo.renderOrder = 1;
    this.logo.position.set(0, 0.16, -0.5);
    this.scene.add(this.logo);

    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width: number, height: number): void {
    const rows = Math.min(TARGET_ROWS, height);
    const cols = Math.round((width / height) * rows);
    const ls = Math.min(1, (cols * 0.9) / this.logoW);
    this.logo.scale.set(
      (2 * this.logoW * ls) / cols,
      (2 * this.logoH * ls) / rows,
      1,
    );
  }

  dismiss(): void {
    this.leaving = true;
  }

  get visible(): boolean {
    return this.fade > 0.002;
  }

  update(dt: number): void {
    this.age += dt;
    const target = this.leaving ? 0 : 1;
    const rate = this.leaving ? 2.8 : 1.1;
    this.fade += (target - this.fade) * (1 - Math.exp(-rate * dt * 3.2));
    const appear = Math.min(1, this.age / 1.1);
    const eased = appear * appear * (3 - 2 * appear);
    this.logoMat.opacity = this.fade * eased;
    this.dimMat.opacity = this.fade * eased * 0.48;
    this.scene.visible = this.visible;
  }
}

function paintFaceisle(): { texture: THREE.Texture; width: number; height: number } {
  const w = 292;
  const h = 76;
  const p = new Painter(w, h);
  const black = rgb(0x050505);
  const gray = rgb(0x777777);
  const white = rgb(0xf5f5f5);

  paintFace(p, 8, 9, 58, black, white);
  paintWord(p, "FACEISLE", 78, 23, 4, gray, white);

  for (let x = 78; x < 282; x++) {
    p.set(x, 58, x % 7 < 4 ? white : gray);
  }

  return { ...p.toSprite(), width: w, height: h };
}

function paintFace(
  p: Painter,
  left: number,
  top: number,
  size: number,
  water: RGB,
  land: RGB,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const nz = ((y + 0.5) / size) * 2 - 1;
      p.set(left + x, top + y, sampleFaceDistance(nx, nz) >= 0 ? land : water);
    }
  }
}

function paintWord(
  p: Painter,
  word: string,
  left: number,
  top: number,
  scale: number,
  shadow: RGB,
  ink: RGB,
): void {
  let cursor = left;
  for (const char of word) {
    const glyph = GLYPHS[char];
    paintGlyph(p, glyph, cursor + 1, top + 1, scale, shadow);
    paintGlyph(p, glyph, cursor, top, scale, ink);
    cursor += 6 * scale;
  }
}

function paintGlyph(
  p: Painter,
  glyph: string[],
  left: number,
  top: number,
  scale: number,
  color: RGB,
): void {
  for (let row = 0; row < glyph.length; row++) {
    for (let col = 0; col < glyph[row].length; col++) {
      if (glyph[row][col] !== "1") continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          p.set(left + col * scale + x, top + row * scale + y, color);
        }
      }
    }
  }
}

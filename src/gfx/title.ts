import * as THREE from "../gl";
import { Painter, RGB, rgb } from "./sprites/painter";
import { TARGET_ROWS } from "./post";

type Pt = [number, number];

const S = 1.1;

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
      color: 0x081120,
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

    const logoSprite = paintIsle();
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
    this.logo.position.set(0, 0.18, -0.5);
    this.scene.add(this.logo);

    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width: number, height: number): void {
    const rows = Math.min(TARGET_ROWS, height);
    const cols = Math.round((width / height) * rows);
    const ls = Math.min(1, (cols * 0.88) / this.logoW);
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
    this.dimMat.opacity = this.fade * eased * 0.42;
    this.scene.visible = this.visible;
  }
}

function paintIsle(): { texture: THREE.Texture; width: number; height: number } {
  const w = Math.round(240 * S);
  const h = Math.round(106 * S);
  const p = new Painter(w, h);

  // Flat poster colors from the world palette / daycycle.
  const outline = rgb(0x141a45);
  const fill = rgb(0xf2f6e8);
  const sun = rgb(0xffc890);
  const wave = rgb(0x7fc8e8);

  const r = 6.2 * S;

  const iX = 40;
  const sX = 82;
  const lX = 130;
  const eX = 172;

  const strokes: { pts: Pt[]; radius: number }[] = [
    { pts: sc([[iX, 28], [iX, 68]]), radius: r },

    {
      pts: sc([
        ...cubic([sX + 20, 30], [sX + 20, 22], [sX - 14, 22], [sX - 14, 34], 14),
        ...cubic([sX - 14, 34], [sX - 14, 42], [sX + 20, 40], [sX + 20, 50], 14).slice(1),
        ...cubic([sX + 20, 50], [sX + 20, 66], [sX - 14, 66], [sX - 14, 58], 14).slice(1),
      ]),
      radius: r,
    },

    { pts: sc([[lX, 10], [lX, 68]]), radius: r },

    {
      pts: sc([
        ...cubic([eX + 28, 40], [eX + 8, 20], [eX - 14, 22], [eX - 14, 48], 18),
        ...cubic([eX - 14, 48], [eX - 14, 72], [eX + 8, 72], [eX + 28, 60], 18).slice(1),
      ]),
      radius: r * 0.95,
    },
    { pts: sc([[eX - 14, 48], [eX + 24, 48]]), radius: r * 0.9 },
  ];

  const wavePts: Pt[] = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    wavePts.push([(92 + t * 60) * S, (89 + Math.sin(t * Math.PI * 3) * 2.3) * S]);
  }
  const waveR = 2.4 * S;

  const dot = { x: iX * S, y: 14 * S, r: 4.6 * S };
  const outlineGrow = 1.6 * S;

  // Crisp navy outline, then solid fills — no shadow, no gradient.
  fillDisc(p, dot.x, dot.y, dot.r + outlineGrow, outline);
  for (const s of strokes) stroke(p, s.pts, s.radius + outlineGrow, outline);
  stroke(p, wavePts, waveR + outlineGrow, outline);

  for (const s of strokes) stroke(p, s.pts, s.radius, fill);
  fillDisc(p, dot.x, dot.y, dot.r, sun);
  stroke(p, wavePts, waveR, wave);

  return { ...p.toSprite(), width: w, height: h };
}

function sc(pts: Pt[]): Pt[] {
  return pts.map(([x, y]) => [x * S, y * S] as Pt);
}

function fillDisc(
  p: Painter,
  cx: number,
  cy: number,
  radius: number,
  color: RGB,
): void {
  const pad = Math.ceil(radius + 1);
  const r2 = radius * radius;
  for (let y = Math.floor(cy) - pad; y <= Math.ceil(cy) + pad; y++) {
    for (let x = Math.floor(cx) - pad; x <= Math.ceil(cx) + pad; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy < r2) p.set(x, y, color);
    }
  }
}

function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * a[0] +
        3 * u * u * t * c1[0] +
        3 * u * t * t * c2[0] +
        t * t * t * b[0],
      u * u * u * a[1] +
        3 * u * u * t * c1[1] +
        3 * u * t * t * c2[1] +
        t * t * t * b[1],
    ]);
  }
  return out;
}

function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx - px;
  const qy = a[1] + t * dy - py;
  return Math.hypot(qx, qy);
}

function distPoly(px: number, py: number, pts: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, distToSeg(px, py, pts[i], pts[i + 1]));
  }
  return d;
}

function stroke(p: Painter, pts: Pt[], radius: number, color: RGB): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const pad = Math.ceil(radius + 1);
  const x0 = Math.floor(minX) - pad;
  const y0 = Math.floor(minY) - pad;
  const x1 = Math.ceil(maxX) + pad;
  const y1 = Math.ceil(maxY) + pad;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (distPoly(x + 0.5, y + 0.5, pts) < radius) p.set(x, y, color);
    }
  }
}

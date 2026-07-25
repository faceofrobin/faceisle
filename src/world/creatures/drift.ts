import * as THREE from '../../gl';
import { Rng } from '../../util/random';

export interface DriftOptions {
  hex: number;
  size: number;
  perAnchor: number;
  max: number;
  jitter: number;
  speed: number;
  span: number;
  drop: number;
  cycleLen: number;
  sway: number;
}

export function createDrift(scene: THREE.Scene, rng: Rng, anchors: THREE.Vector3[], opt: DriftOptions): Drift | null {
  if (anchors.length === 0) return null;
  return new Drift(scene, rng, anchors, opt);
}

export class Drift {
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  private anchor: Float32Array;
  private seed: Float32Array;
  private opt: DriftOptions;

  constructor(scene: THREE.Scene, rng: Rng, anchors: THREE.Vector3[], opt: DriftOptions) {
    this.opt = opt;
    const P = Math.min(opt.max, anchors.length * opt.perAnchor);
    this.anchor = new Float32Array(P * 3);
    this.seed = new Float32Array(P);
    const pos = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      const c = rng.pick(anchors);
      this.anchor[i * 3] = c.x + rng.range(-opt.jitter, opt.jitter);
      this.anchor[i * 3 + 1] = c.y;
      this.anchor[i * 3 + 2] = c.z + rng.range(-opt.jitter, opt.jitter);
      this.seed[i] = rng.range(0, 100);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({
      color: opt.hex,
      size: opt.size,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(time: number, tint: THREE.Color, intensity = 1): void {
    this.points.visible = intensity > 0.02;
    if (!this.points.visible) return;
    this.mat.opacity = 0.95 * intensity;
    const opt = this.opt;
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.seed.length; i++) {
      const seed = this.seed[i];
      const cycle = (time * opt.speed + seed) % opt.cycleLen;
      const f = Math.min(1, cycle);
      const ax = this.anchor[i * 3];
      const ay = this.anchor[i * 3 + 1];
      const az = this.anchor[i * 3 + 2];
      pos.setXYZ(
        i,
        ax + Math.sin(time * 0.9 + seed * 3) * opt.sway + f * 1.6,
        ay + opt.drop - f * opt.span + Math.sin(time * 2.2 + seed) * 0.15,
        az + Math.cos(time * 0.7 + seed * 2) * opt.sway,
      );
    }
    pos.needsUpdate = true;
    this.mat.color.setHex(opt.hex).multiply(tint);
  }
}

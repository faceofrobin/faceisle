import * as THREE from "../gl";
import { PixelSprite } from "./sprites/painter";
import { WING_FRAMES, makeWingTextures } from "./sprites/wing";
import { TARGET_ROWS } from "./post";

/** Share of the frame's height one wing takes. */
const SCREEN_SHARE = 0.5;

/**
 * The raven, seen from inside it.
 *
 * There is no bird model, because the game is first person and never leaves
 * it. What sells the change of shape is what a bird would actually have at the
 * edge of its vision: the inner wing sweeping up past the shoulder and back
 * down, one on each side, leaning with the roll. The left wing is the right
 * one with a negative width — which reverses its winding, so the material has
 * to be double-sided or it culls away entirely.
 */
export class RavenView {
  readonly scene = new THREE.Scene();

  private left: THREE.Mesh;
  private right: THREE.Mesh;
  private mats: THREE.MeshBasicMaterial[] = [];
  private frames: PixelSprite[];
  private cols = 1;
  private rows = 1;
  private shown = -1;

  constructor() {
    this.frames = makeWingTextures();
    for (const frame of this.frames) {
      this.mats.push(
        new THREE.MeshBasicMaterial({
          map: frame.texture,
          transparent: true,
          alphaTest: 0.5,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );
    }
    this.left = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mats[0]);
    this.right = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mats[0]);
    this.left.frustumCulled = false;
    this.right.frustumCulled = false;
    this.scene.add(this.left);
    this.scene.add(this.right);
    this.scene.visible = false;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width: number, height: number): void {
    this.rows = Math.min(TARGET_ROWS, height);
    this.cols = Math.round((width / height) * this.rows);
  }

  /**
   * `morph` fades the wings in as the shape changes; `beat` runs 1 → 0 across
   * one wingbeat; `roll` leans them with the horizon.
   */
  update(morph: number, beat: number, roll: number, tint: THREE.Color): void {
    this.scene.visible = morph > 0.02;
    if (!this.scene.visible) return;

    // The upstroke is quick and the downstroke lingers, which is the shape of
    // a real beat and the difference between flapping and waving.
    const swing = beat > 0.62 ? (1 - beat) / 0.38 : beat / 0.62;
    const frame = THREE.MathUtils.clamp(
      Math.round((1 - swing) * (WING_FRAMES - 1)),
      0,
      WING_FRAMES - 1,
    );
    if (frame !== this.shown) {
      this.shown = frame;
      this.left.material = this.mats[frame];
      this.right.material = this.mats[frame];
    }
    for (const mat of this.mats) {
      mat.opacity = morph;
      mat.color.copy(tint);
    }
    this.layout(morph, roll, swing);
  }

  private layout(morph: number, roll: number, swing: number): void {
    const sprite = this.frames[0];
    // Sized against the short edge, so the wings keep their share of the frame
    // whatever shape the window is — and land near one texel to the pixel.
    const scale = (this.rows * SCREEN_SHARE) / sprite.height;
    const w = (2 * sprite.width * scale) / this.cols;
    const h = (2 * sprite.height * scale) / this.rows;

    // The shoulders sit outside the lower corners, so only the inner part of
    // each wing is ever in frame. They ride down a little on the downstroke,
    // and slide in from the edges as the shape settles.
    const x = 0.72 + (1 - morph) * 0.45;
    const y = -0.98 - swing * 0.05 - (1 - morph) * 0.35;

    this.left.scale.set(-w, h, 1);
    this.right.scale.set(w, h, 1);
    this.left.position.set(-x, y - roll * 0.3, -0.5);
    this.right.position.set(x, y + roll * 0.3, -0.5);
  }
}

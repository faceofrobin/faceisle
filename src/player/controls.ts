import * as THREE from "three";
import { Terrain } from "../world/terrain";
import { footstepCrossing, headBobVertical } from "./headBob";

const EYE_HEIGHT = 1.65;
const WALK_SPEED = 4.1;
const STROLL_SPEED = 2.1;
/** Baseline mouse-look scale at 100% in settings. */
export const DEFAULT_LOOK_SENSITIVITY = 0.0021;

export class Controls {
  readonly position = new THREE.Vector3();
  onFootstep: (() => void) | null = null;
  onFirstInteract: (() => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;
  get hasInteracted(): boolean {
    return this.interacted;
  }
  get enabled(): boolean {
    return this._enabled;
  }
  get touchMode(): boolean {
    return this._touchMode;
  }

  private camera: THREE.PerspectiveCamera;
  private terrain: Terrain;
  private dom: HTMLElement;
  private yaw: number;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private keys = new Set<string>();
  private locked = false;
  private interacted = false;
  private _enabled = true;
  private _touchMode = false;
  private touchAxes = { x: 0, y: 0 };
  private bobPhase = 0;
  private smoothedGround: number;
  private idleDrift = 0;
  private lookSensitivity = DEFAULT_LOOK_SENSITIVITY;
  private invertY = false;
  moving = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    terrain: Terrain,
    spawn: THREE.Vector3,
    yaw: number,
  ) {
    this.camera = camera;
    this.terrain = terrain;
    this.dom = dom;
    this.position.copy(spawn);
    this.yaw = yaw;
    this.smoothedGround = terrain.heightAt(spawn.x, spawn.z);

    camera.rotation.order = "YXZ";

    dom.addEventListener("click", () => {
      this.beginPlay();
      if (!this._touchMode && !this.locked) dom.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === dom;
      this.onLockChange?.(this.locked);
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.locked || !this._enabled) return;
      this.lookBy(e.movementX, e.movementY);
    });

    window.addEventListener("keydown", (e) => {
      if (!this._enabled) return;
      if (e.code.startsWith("Arrow")) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.touchAxes.x = 0;
      this.touchAxes.y = 0;
    });
  }

  setTouchMode(on: boolean): void {
    this._touchMode = on;
  }

  /** Start audio / dismiss title on first gesture (click, tap, or stick). */
  beginPlay(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onFirstInteract?.();
  }

  /** Virtual stick: x = strafe (−1..1), y = forward (−1..1). */
  setTouchAxes(x: number, y: number): void {
    this.touchAxes.x = THREE.MathUtils.clamp(x, -1, 1);
    this.touchAxes.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  /** Apply a look delta in screen pixels (mouse movement or touch drag). */
  lookBy(dx: number, dy: number): void {
    if (!this._enabled || !this.interacted) return;
    const sens = this.lookSensitivity;
    const pitchSign = this.invertY ? 1 : -1;
    this.yaw -= dx * sens;
    this.pitch += dy * sens * pitchSign;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    if (!on) {
      this.keys.clear();
      this.touchAxes.x = 0;
      this.touchAxes.y = 0;
    }
  }

  /** Re-enter look mode after a menu closes (needs a user gesture). */
  requestLock(): void {
    if (this._touchMode || this.locked) return;
    void this.dom.requestPointerLock();
  }

  /** Mouse-look speed as a multiplier of the default (1 = unchanged). */
  setLookSensitivity(multiplier: number): void {
    const m = THREE.MathUtils.clamp(multiplier, 0.25, 2);
    this.lookSensitivity = DEFAULT_LOOK_SENSITIVITY * m;
  }

  /** Invert vertical look (mouse up looks down). */
  setInvertY(on: boolean): void {
    this.invertY = on;
  }

  /** Absolute look pitch in radians (clamped). Used by `?pitch=` / shot framing. */
  setPitch(radians: number): void {
    this.pitch = THREE.MathUtils.clamp(radians, -1.45, 1.45);
  }

  /** Absolute look yaw in radians. Used by shot framing. */
  setYaw(radians: number): void {
    this.yaw = radians;
  }

  update(dt: number): void {
    if (!this.interacted) {
      this.idleDrift += dt;
      this.yaw += Math.sin(this.idleDrift * 0.13) * 0.014 * dt * 8;
    }

    const k = this.keys;
    let fwd = 0;
    let strafe = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) strafe -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) strafe += 1;
    fwd += this.touchAxes.y;
    strafe += this.touchAxes.x;

    const inputLen = Math.hypot(fwd, strafe);
    const inputScale = inputLen > 1e-6 ? Math.min(1, inputLen) / inputLen : 0;
    fwd *= inputScale;
    strafe *= inputScale;

    const speed =
      k.has("ShiftLeft") || k.has("ShiftRight") ? STROLL_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const target = new THREE.Vector3(
      (-sin * fwd + cos * strafe) * speed,
      0,
      (-cos * fwd - sin * strafe) * speed,
    );

    const accel = target.lengthSq() > 0 ? 6 : 8;
    this.velocity.lerp(target, Math.min(1, accel * dt));

    const next = this.position.clone().addScaledVector(this.velocity, dt);
    if (this.walkable(next.x, next.z)) {
      this.position.x = next.x;
      this.position.z = next.z;
    } else if (this.walkable(next.x, this.position.z)) {
      this.position.x = next.x;
    } else if (this.walkable(this.position.x, next.z)) {
      this.position.z = next.z;
    }

    const r = Math.hypot(this.position.x, this.position.z);
    const maxR = this.terrain.islandRadius * 1.25;
    if (r > maxR) {
      this.position.x *= maxR / r;
      this.position.z *= maxR / r;
    }

    const ground = Math.max(
      this.terrain.heightAt(this.position.x, this.position.z),
      -0.35,
    );
    this.smoothedGround +=
      (ground - this.smoothedGround) * Math.min(1, 10 * dt);

    const speedNow = this.velocity.length();
    this.moving +=
      (THREE.MathUtils.clamp(speedNow / WALK_SPEED, 0, 1) - this.moving) *
      Math.min(1, 6 * dt);
    const prevBob = Math.sin(this.bobPhase);
    this.bobPhase += speedNow * dt * 1.85;
    const bob = Math.sin(this.bobPhase);
    if (footstepCrossing(prevBob, bob, this.moving)) this.onFootstep?.();

    this.position.y =
      this.smoothedGround + EYE_HEIGHT + headBobVertical(bob, this.moving);

    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private walkable(x: number, z: number): boolean {
    return this.terrain.heightAt(x, z) > -0.35;
  }
}

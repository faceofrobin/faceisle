import * as THREE from "../gl";
import { Archipelago } from "../world/archipelago";
import { Flight, FlightEvent, PERCH_HEIGHT, SEA_LEVEL } from "./flight";
import { footstepCrossing, headBobVertical } from "./headBob";

const EYE_HEIGHT = PERCH_HEIGHT;
const WALK_SPEED = 4.1;
const STROLL_SPEED = 2.1;
/** Baseline mouse-look scale at 100% in settings. */
export const DEFAULT_LOOK_SENSITIVITY = 0.0021;

/** Seconds before a launch can be undone by touching the ground again. */
const LAUNCH_GRACE = 0.45;
/** How long the change of shape takes, either way. */
const MORPH_UP = 0.5;
const MORPH_DOWN = 0.8;

export type Mode = "walk" | "raven";

export class Controls {
  readonly position = new THREE.Vector3();
  readonly flight = new Flight();
  onFootstep: (() => void) | null = null;
  onFirstInteract: (() => void) | null = null;
  /** Fired on every canvas click / unlock gesture (including after start). */
  onGesture: (() => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;
  onWingbeat: (() => void) | null = null;
  onSkim: (() => void) | null = null;
  onTakeOff: (() => void) | null = null;
  onLand: (() => void) | null = null;

  get hasInteracted(): boolean {
    return this.interacted;
  }
  get enabled(): boolean {
    return this._enabled;
  }
  get touchMode(): boolean {
    return this._touchMode;
  }
  get flying(): boolean {
    return this.mode === "raven";
  }
  /** 0 walking, 1 fully a raven. Drives the wings and the widening view. */
  get morph(): number {
    return this._morph;
  }
  /** Height above whatever is directly underneath — ground, or the sea. */
  get altitude(): number {
    const under = Math.max(this.groundHere, SEA_LEVEL);
    return Math.max(0, this.position.y - under - EYE_HEIGHT);
  }

  private camera: THREE.PerspectiveCamera;
  private world: Archipelago;
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
  private touchFlap = false;
  private bobPhase = 0;
  private smoothedGround: number;
  private idleDrift = 0;
  private lookSensitivity = DEFAULT_LOOK_SENSITIVITY;
  private invertY = false;
  private mode: Mode = "walk";
  private _morph = 0;
  private airborne = 0;
  private groundHere = 0;
  private lastYaw: number;
  private glideSway = 0;
  private sway = 0;
  private events: FlightEvent[] = [];
  moving = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    world: Archipelago,
    spawn: THREE.Vector3,
    yaw: number,
  ) {
    this.camera = camera;
    this.world = world;
    this.dom = dom;
    this.position.copy(spawn);
    this.yaw = yaw;
    this.lastYaw = yaw;
    this.smoothedGround = world.heightAt(spawn.x, spawn.z);
    this.groundHere = this.smoothedGround;

    camera.rotation.order = "YXZ";

    dom.addEventListener("click", () => {
      this.beginPlay();
      this.onGesture?.();
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
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
      // First key also counts as the unlock gesture (WASD before clicking).
      if (
        !this.interacted &&
        (e.code.startsWith("Key") ||
          e.code.startsWith("Arrow") ||
          e.code === "Space" ||
          e.code === "ShiftLeft" ||
          e.code === "ShiftRight")
      ) {
        this.beginPlay();
      }
      if (e.code === "Space" && !e.repeat) this.pressFly();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.touchAxes.x = 0;
      this.touchAxes.y = 0;
      this.touchFlap = false;
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

  /** The touch fly button, held. On the ground, the first press takes off. */
  setFlap(on: boolean): void {
    if (on && !this.touchFlap) {
      this.beginPlay();
      this.pressFly();
    }
    this.touchFlap = on;
  }

  /** Space, or the fly button: leave the ground if still on it. */
  private pressFly(): void {
    if (!this._enabled || this.mode === "raven") return;
    this.mode = "raven";
    this.airborne = 0;
    this.flight.launch(this.yaw, this.position);
    this.bobPhase = 0;
    this.onTakeOff?.();
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
      this.touchFlap = false;
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

    this.groundHere = this.world.heightAt(this.position.x, this.position.z);
    const target = this.mode === "raven" ? 1 : 0;
    const rate = target > this._morph ? MORPH_UP : MORPH_DOWN;
    this._morph += (target - this._morph) * (1 - Math.exp(-dt / rate * 2.2));

    if (this.mode === "raven") this.fly(dt);
    else this.walk(dt);

    this.camera.position.copy(this.position);
    this.camera.position.y += this.sway * this._morph;
    this.camera.rotation.set(this.pitch, this.yaw, this.flight.roll * this._morph);
  }

  private walk(dt: number): void {
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

    // Walking is bounded by the island you are on, not by the world. The way
    // to the next one is up.
    const here = this.world.nearest(this.position.x, this.position.z).site;
    const dx = this.position.x - here.centerX;
    const dz = this.position.z - here.centerZ;
    const r = Math.hypot(dx, dz);
    const maxR = here.radius * 1.25;
    if (r > maxR) {
      this.position.x = here.centerX + (dx * maxR) / r;
      this.position.z = here.centerZ + (dz * maxR) / r;
    }

    const ground = Math.max(
      this.world.heightAt(this.position.x, this.position.z),
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
  }

  private fly(dt: number): void {
    if (!this._enabled) return;
    this.airborne += dt;

    const k = this.keys;
    let trim = 0;
    let slip = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) trim += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) trim -= 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) slip -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) slip += 1;
    trim = THREE.MathUtils.clamp(trim + this.touchAxes.y, -1, 1);
    slip = THREE.MathUtils.clamp(slip + this.touchAxes.x, -1, 1);

    const flap = this.touchFlap || k.has("Space");
    const stoop = k.has("ShiftLeft") || k.has("ShiftRight");

    this.flight.turnRate = (this.yaw - this.lastYaw) / Math.max(dt, 1e-4);
    this.lastYaw = this.yaw;

    this.events.length = 0;
    this.flight.step(
      dt,
      { yaw: this.yaw, pitch: this.pitch, trim, slip, flap, stoop },
      this.position,
      this.groundHere,
      this.events,
    );
    for (const event of this.events) {
      if (event === "beat") this.onWingbeat?.();
      else this.onSkim?.();
    }

    this.velocity.copy(this.flight.velocity);
    this.moving = 1;

    // The body rises on each downbeat and breathes slowly between them, so a
    // glide is never quite still. Applied to the eye, not to the physics.
    this.glideSway += dt;
    this.sway =
      Math.sin(this.glideSway * 1.6) * 0.05 + this.flight.beatPhase * 0.14;

    // Coming down onto land ends the flight — unless the wings are still
    // going, which is how you skim a hilltop without being grounded by it.
    if (
      this.airborne > LAUNCH_GRACE &&
      !flap &&
      this.flight.hasLanded(this.position, this.groundHere)
    ) {
      this.land();
    }
  }

  private land(): void {
    this.mode = "walk";
    this.smoothedGround = this.groundHere;
    this.position.y = this.groundHere + EYE_HEIGHT;
    this.velocity.set(0, 0, 0);
    this.bobPhase = 0;
    this.moving = 0;
    this.onLand?.();
  }

  private walkable(x: number, z: number): boolean {
    return this.world.heightAt(x, z) > -0.35;
  }
}

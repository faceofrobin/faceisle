import * as THREE from "../gl";

/** Level airspeed with the wings out and nothing asked of them. */
const CRUISE = 23;
/** How hard pitch trades height for speed. Diving is fast, climbing is not. */
const PITCH_TRADE = 26;
const MIN_SPEED = 8;
const MAX_SPEED = 52;
/** Metres a second lost to a flat glide. Small — crossings should be gentle. */
const SINK = 2.3;
/** Climb rate a held wingbeat adds on top of whatever pitch is doing. */
const LIFT = 9.5;
/** One wingbeat, in seconds. Sets the sound, the wings and the body's bob. */
export const BEAT = 0.52;
/** Ceiling. High enough to see three islands, low enough to still see one. */
const CEILING = 330;
const CEILING_SOFT = 60;
/** Held-shift stoop: wings folded, straight down, fast. */
const STOOP_SINK = 26;

/** Lift-off gives the first beat for free, so a tap actually leaves the ground. */
const LAUNCH_UP = 7.5;
const LAUNCH_FORWARD = 6;

/** Sea level plus this and a raven is landing rather than flying. */
export const PERCH_HEIGHT = 1.65;
/** Ground this low is water; a raven touches it and beats away again. */
const WATER_LINE = 0.12;
/** The sea's own surface. Everything below it is under water, not ground. */
export const SEA_LEVEL = 0;
const SKIM_BOUNCE = 6.5;

export interface FlightInput {
  /** Where the head is pointing. Heading and climb both come from here. */
  yaw: number;
  pitch: number;
  /** −1 back to 1 forward: tuck for speed, spread to slow down. */
  trim: number;
  /** −1 left to 1 right: sideslip, and what banks the horizon. */
  slip: number;
  /** Beating the wings. */
  flap: boolean;
  /** Wings folded — a dive with no lift at all. */
  stoop: boolean;
}

export type FlightEvent = "beat" | "skim";

/**
 * A raven's flight, kept forgiving.
 *
 * The model is one trade repeated: point down and you gain speed and lose
 * height, point up and you spend speed to climb, and a wingbeat buys height
 * outright. Nothing here can stall or spin — the worst a player can do is sink
 * to the sea, and the sea beats them back into the air. What that leaves is
 * the one decision worth having on a long crossing: climb now and glide, or
 * stay low and keep beating.
 */
export class Flight {
  readonly velocity = new THREE.Vector3();
  /** View roll. Turning banks the horizon; it is most of what sells flying. */
  roll = 0;
  /** 0 at rest, 1 mid-beat. Drives the wings, the sound and the body's rise. */
  beatPhase = 0;
  /** Metres a second through the air, for wind volume and field of view. */
  get airspeed(): number {
    return this.speed;
  }

  private speed = CRUISE;
  private beatClock = 0;
  private beating = false;
  private skimCooldown = 0;

  /** Enter the air with one beat already spent. */
  launch(yaw: number, from: THREE.Vector3): void {
    this.speed = CRUISE * 0.7;
    this.velocity.set(
      -Math.sin(yaw) * LAUNCH_FORWARD,
      LAUNCH_UP,
      -Math.cos(yaw) * LAUNCH_FORWARD,
    );
    this.roll = 0;
    this.beatClock = 0;
    this.beatPhase = 1;
    this.beating = true;
    void from;
  }

  /**
   * Advance one frame. Returns the events the frame produced so the caller can
   * make a noise about them without this knowing anything about audio.
   */
  step(
    dt: number,
    input: FlightInput,
    position: THREE.Vector3,
    ground: number,
    events: FlightEvent[],
  ): void {
    const { yaw, pitch } = input;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    // Airspeed chases what this attitude is worth. Nose down is a gift of
    // speed; nose up is paid for out of it.
    let wanted = CRUISE - sinPitch * PITCH_TRADE + input.trim * 5;
    if (input.stoop) wanted += 14;
    wanted = THREE.MathUtils.clamp(wanted, MIN_SPEED, MAX_SPEED);
    this.speed += (wanted - this.speed) * (1 - Math.exp(-dt * 1.6));

    this.beating = input.flap && !input.stoop;
    if (this.beating) {
      this.beatClock -= dt;
      if (this.beatClock <= 0) {
        this.beatClock += BEAT;
        events.push("beat");
        this.beatPhase = 1;
      }
    } else {
      this.beatClock = 0;
    }
    this.beatPhase = Math.max(0, this.beatPhase - dt / BEAT);

    const horizontal = cosPitch * this.speed;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const target = _target.set(
      forwardX * horizontal + -forwardZ * input.slip * 7,
      sinPitch * this.speed - SINK,
      forwardZ * horizontal + forwardX * input.slip * 7,
    );
    if (this.beating) target.y += LIFT;
    if (input.stoop) target.y -= STOOP_SINK;

    // Above the ceiling the air simply stops holding. No wall, no message —
    // the climb just runs out, which is the only way to say "high enough"
    // without breaking the spell.
    const over = position.y - (CEILING - CEILING_SOFT);
    if (over > 0) {
      target.y -= (over / CEILING_SOFT) * (LIFT + SINK) * 1.2;
    }

    // Heavy enough to feel like a body, light enough to answer the head.
    this.velocity.lerp(target, 1 - Math.exp(-dt * 2.6));
    position.addScaledVector(this.velocity, dt);

    // Banking: mostly from sideslip, a little from how fast the head is
    // turning, so a long curve leans into itself.
    const wantRoll = -input.slip * 0.34 - THREE.MathUtils.clamp(this.turnRate, -1, 1) * 0.2;
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-dt * 3.4));

    // Where the sea covers the ground, the surface is the floor — otherwise a
    // raven crossing deep water would sink to the sea bed to skim it.
    const surface = Math.max(ground, SEA_LEVEL);
    const floor = surface + PERCH_HEIGHT;
    this.skimCooldown = Math.max(0, this.skimCooldown - dt);
    if (position.y <= floor && this.velocity.y <= 0) {
      position.y = floor;
      if (ground <= WATER_LINE) {
        // A raven does not land on water. It touches, and beats away again.
        this.velocity.y = SKIM_BOUNCE;
        this.speed = Math.max(this.speed, CRUISE * 0.8);
        this.beatPhase = 1;
        if (this.skimCooldown <= 0) {
          this.skimCooldown = 0.45;
          events.push("skim");
        }
      }
    }
  }

  /** Landed if the ground is under the feet and it is not sea. */
  hasLanded(position: THREE.Vector3, ground: number): boolean {
    return ground > WATER_LINE && position.y <= ground + PERCH_HEIGHT + 0.01;
  }

  /** Set by the controls each frame, in radians a second. */
  turnRate = 0;
}

const _target = new THREE.Vector3();

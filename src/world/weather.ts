import * as THREE from "three";
import { DayCycle } from "./daycycle";
import { Rng } from "../util/random";


type Spell = "clear" | "cloudy";

export class Weather {
  cloudiness = 0.2;
  windX = 1;
  windZ = 0;
  windSpeed = 2.5;

  private spell: Spell = "clear";
  private spellTimer = 0;
  private targetCloud = 0.2;
  private windAngle: number;
  private windPhase: number;
  private time = 0;
  private rng: Rng;

  constructor(rng: Rng, forced: string | null = null) {
    this.rng = rng;
    this.windAngle = rng.range(0, Math.PI * 2);
    this.windPhase = rng.range(0, Math.PI * 2);

    if (forced === "clear" || forced === "cloudy") {
      this.enterSpell(forced);
      this.spellTimer = Infinity;
    } else {
      this.enterSpell(rng.chance(0.65) ? "clear" : "cloudy");
    }
    this.cloudiness = this.targetCloud;
  }

  get gloom(): number {
    const cover = THREE.MathUtils.smoothstep(this.cloudiness, 0.35, 0.95);
    return cover * 0.55;
  }

  update(dt: number): void {
    this.time += dt;

    this.spellTimer -= dt;
    if (this.spellTimer <= 0) this.enterSpell(this.nextSpell());

    const cloudEase = 1 - Math.exp(-dt / 22);
    this.cloudiness += (this.targetCloud - this.cloudiness) * cloudEase;

    this.windAngle += Math.sin(this.time * 0.021 + this.windPhase) * 0.045 * dt;
    this.windX = Math.cos(this.windAngle);
    this.windZ = Math.sin(this.windAngle);
    this.windSpeed = 2.2 + this.cloudiness * 3.2;
  }

  apply(day: DayCycle): void {
    const g = this.gloom;
    if (g > 0.001) {
      this.grayLerp(day.skyTop, g * 1.05, 0.82);
      this.grayLerp(day.horizon, g * 0.85, 0.92);
      this.grayLerp(day.light, g * 0.8, 0.82);
      this.grayLerp(day.cloud, g * 0.85, 0.72);
      this.grayLerp(day.hemiSky, g * 0.6, 0.88);
      this.grayLerp(day.hemiGround, g * 0.5, 0.9);
      this.grayLerp(day.waterDeep, g * 0.55, 0.9);
      this.grayLerp(day.waterLight, g * 0.55, 0.88);
      this.grayLerp(day.tint, g * 0.5, 0.93);
      day.lightI *= 1 - g * 0.45;
    }
    day.star *=
      1 - THREE.MathUtils.smoothstep(this.cloudiness, 0.35, 0.9) * 0.92;
  }

  private grayCol = new THREE.Color();

  private grayLerp(c: THREE.Color, amount: number, dim: number): void {
    const l = (c.r * 0.32 + c.g * 0.5 + c.b * 0.18) * dim;
    this.grayCol.setRGB(l * 0.96, l * 0.99, l * 1.05);
    c.lerp(this.grayCol, Math.min(1, amount));
  }

  private nextSpell(): Spell {
    return this.spell === "clear" ? "cloudy" : "clear";
  }

  private enterSpell(spell: Spell): void {
    this.spell = spell;
    switch (spell) {
      case "clear":
        this.targetCloud = this.rng.range(0.08, 0.32);
        this.spellTimer = this.rng.range(120, 260);
        break;
      case "cloudy":
        this.targetCloud = this.rng.range(0.45, 0.85);
        this.spellTimer = this.rng.range(70, 160);
        break;
    }
  }
}

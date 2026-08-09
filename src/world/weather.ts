import * as THREE from "../gl";
import { DayCycle } from "./daycycle";
import { Rng } from "../util/random";

type Spell = "clear" | "cloudy" | "rain";

export class Weather {
  cloudiness = 0.2;
  /** 0 dry … 1 steady rain. Eases in and out with the spell. */
  rain = 0;
  windX = 1;
  windZ = 0;
  windSpeed = 2.5;

  private spell: Spell = "clear";
  private spellTimer = 0;
  private targetCloud = 0.2;
  private targetRain = 0;
  private windAngle: number;
  private windPhase: number;
  private time = 0;
  private rng: Rng;

  constructor(rng: Rng, forced: string | null = null) {
    this.rng = rng;
    this.windAngle = rng.range(0, Math.PI * 2);
    this.windPhase = rng.range(0, Math.PI * 2);

    if (forced === "clear" || forced === "cloudy" || forced === "rain") {
      this.enterSpell(forced);
      this.spellTimer = Infinity;
    } else {
      this.enterSpell(rng.chance(0.65) ? "clear" : "cloudy");
    }
    this.cloudiness = this.targetCloud;
    this.rain = this.targetRain;
  }

  get gloom(): number {
    const cover = THREE.MathUtils.smoothstep(this.cloudiness, 0.35, 0.95);
    return cover * 0.55 + this.rain * 0.28;
  }

  update(dt: number): void {
    this.time += dt;

    this.spellTimer -= dt;
    if (this.spellTimer <= 0) this.enterSpell(this.nextSpell());

    const cloudEase = 1 - Math.exp(-dt / 22);
    this.cloudiness += (this.targetCloud - this.cloudiness) * cloudEase;

    // Rain arrives faster than cloud cover so streaks show soon after the sky greys.
    const rainEase = 1 - Math.exp(-dt / (this.targetRain > this.rain ? 9 : 14));
    this.rain += (this.targetRain - this.rain) * rainEase;

    this.windAngle += Math.sin(this.time * 0.021 + this.windPhase) * 0.045 * dt;
    this.windX = Math.cos(this.windAngle);
    this.windZ = Math.sin(this.windAngle);
    this.windSpeed = 2.2 + this.cloudiness * 3.2 + this.rain * 1.4;
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

    // Rain pushes the sky a notch darker so the streaks read against it.
    const r = this.rain;
    if (r > 0.001) {
      day.skyTop.multiplyScalar(1 - r * 0.22);
      day.horizon.multiplyScalar(1 - r * 0.12);
      this.grayLerp(day.skyTop, r * 0.55, 0.62);
      this.grayLerp(day.horizon, r * 0.4, 0.78);
      day.star *= 1 - r * 0.85;
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
    if (this.spell === "clear") {
      return this.rng.chance(0.72) ? "cloudy" : "clear";
    }
    if (this.spell === "cloudy") {
      const roll = this.rng.next();
      if (roll < 0.38) return "rain";
      if (roll < 0.78) return "clear";
      return "cloudy";
    }
    return this.rng.chance(0.7) ? "cloudy" : "clear";
  }

  private enterSpell(spell: Spell): void {
    this.spell = spell;
    switch (spell) {
      case "clear":
        this.targetCloud = this.rng.range(0.08, 0.32);
        this.targetRain = 0;
        this.spellTimer = this.rng.range(120, 260);
        break;
      case "cloudy":
        this.targetCloud = this.rng.range(0.45, 0.85);
        this.targetRain = 0;
        this.spellTimer = this.rng.range(70, 160);
        break;
      case "rain":
        this.targetCloud = this.rng.range(0.72, 0.95);
        this.targetRain = 1;
        this.spellTimer = this.rng.range(55, 140);
        break;
    }
  }
}

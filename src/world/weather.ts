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
  /** Spell locked by `?weather=` for the whole visit. */
  private held: Spell | null = null;
  /** Gameplay setting: keep raining until turned off. */
  private alwaysRain = false;

  constructor(rng: Rng, forced: string | null = null) {
    this.rng = rng;
    this.windAngle = rng.range(0, Math.PI * 2);
    this.windPhase = rng.range(0, Math.PI * 2);

    if (forced === "clear" || forced === "cloudy" || forced === "rain") {
      this.held = forced;
      this.enterSpell(forced);
      this.spellTimer = Infinity;
    } else {
      this.enterSpell(rng.chance(0.65) ? "clear" : "cloudy");
    }
    this.cloudiness = this.targetCloud;
    this.rain = this.targetRain;
  }

  /** Prefer rain for the rest of the visit, or release back to weather / URL hold. */
  setAlwaysRain(on: boolean): void {
    if (this.alwaysRain === on) return;
    this.alwaysRain = on;
    if (on) {
      this.enterSpell("rain");
      this.spellTimer = Infinity;
      return;
    }
    if (this.held) {
      this.enterSpell(this.held);
      this.spellTimer = Infinity;
      return;
    }
    this.enterSpell("cloudy");
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
    const r = this.rain;
    // Rain paints its own sky — don't also flatten that into dead grey.
    const skyG = g * (1 - r * 0.8);
    if (g > 0.001) {
      this.grayLerp(day.skyTop, skyG * 1.05, 0.82);
      this.grayLerp(day.horizon, skyG * 0.85, 0.92);
      this.grayLerp(day.light, g * 0.7, 0.88);
      this.grayLerp(day.cloud, g * (1 - r * 0.55) * 0.85, 0.78);
      this.grayLerp(day.hemiSky, skyG * 0.6, 0.88);
      this.grayLerp(day.hemiGround, g * 0.45, 0.92);
      this.grayLerp(day.waterDeep, g * (1 - r * 0.6) * 0.5, 0.92);
      this.grayLerp(day.waterLight, g * (1 - r * 0.6) * 0.5, 0.9);
      this.grayLerp(day.tint, g * (1 - r * 0.5) * 0.4, 0.96);
      day.lightI *= 1 - g * (0.38 - r * 0.08);
    }

    if (r > 0.001) {
      // Soft storm in the same family as midday blue + teal sea: periwinkle
      // slate above, misty green-grey at the rim, so the island greens still sing.
      // A little of the day's colour stays in so dawn and dusk keep their warmth.
      this.mood.setRGB(0.36, 0.46, 0.58);
      this.mood.lerp(day.skyTop, 0.24);
      day.skyTop.lerp(this.mood, r * 0.72);

      this.mood.setRGB(0.62, 0.70, 0.72);
      this.mood.lerp(day.horizon, 0.3);
      day.horizon.lerp(this.mood, r * 0.58);

      this.mood.setRGB(0.56, 0.61, 0.68);
      day.cloud.lerp(this.mood, r * 0.52);

      this.mood.setRGB(0.42, 0.52, 0.62);
      day.hemiSky.lerp(this.mood, r * 0.45);

      this.mood.setRGB(0.16, 0.36, 0.38);
      day.waterDeep.lerp(this.mood, r * 0.3);
      this.mood.setRGB(0.34, 0.54, 0.52);
      day.waterLight.lerp(this.mood, r * 0.22);

      this.mood.setRGB(0.84, 0.88, 0.9);
      day.tint.lerp(this.mood, r * 0.16);

      day.star *= 1 - r * 0.85;
    }

    day.star *=
      1 - THREE.MathUtils.smoothstep(this.cloudiness, 0.35, 0.9) * 0.92;
  }

  private grayCol = new THREE.Color();
  private mood = new THREE.Color();

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

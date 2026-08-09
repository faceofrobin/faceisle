import * as THREE from "../gl";
import { DayCycle } from "./daycycle";
import { Weather } from "./weather";
import { SNAP_GLSL } from "../gfx/post";

/** Half-width of the streak volume around the camera (metres). */
const WRAP = 28;
/** Rain fills a column around the eye so it reads on the ground and in the air. */
const Y_ABOVE = 14;
const Y_BELOW = 12;
const STREAKS = 280;
const IMPACTS = 48;

type HeightAt = (x: number, z: number) => number;

const STREAK_VERT = `
attribute float aLen;
varying float vFade;
varying vec2 vScreenUp;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(2.0, -mv.z);
  // Chunky vertical dashes — tall enough to read as rain, wide enough after
  // the pixel pass that they don't vanish into single-texel noise.
  gl_PointSize = clamp(aLen * 280.0 / dist, 6.0, 20.0);
  gl_Position = projectionMatrix * mv;
  vFade = clamp(1.2 - dist / 55.0, 0.15, 1.0);
  // World-up in view space, flipped into gl_PointCoord (y grows downward).
  vec3 viewUp = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
  vScreenUp = length(viewUp.xy) > 1e-4
    ? normalize(vec2(viewUp.x, -viewUp.y))
    : vec2(0.0, -1.0);
}
`;

const STREAK_FRAG = `
uniform vec3 uColor;
uniform float uAlpha;
varying float vFade;
varying vec2 vScreenUp;
${SNAP_GLSL}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // Align the strip with world vertical so banking tilts the rain with the horizon.
  vec2 up = vScreenUp;
  vec2 right = vec2(-up.y, up.x);
  vec2 local = vec2(dot(c, right), dot(c, up));
  if (abs(local.x) > 0.16 || abs(local.y) > 0.48) discard;
  float tip = 1.0 - abs(local.y) * 0.55;
  float a = uAlpha * vFade * tip;
  if (a < 0.02) discard;
  gl_FragColor = vec4(snapFlat(uColor), a);
}
`;

const IMPACT_VERT = `
attribute float aSize;
attribute float aLife;
varying float vLife;
varying vec2 vScreenUp;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(1.5, -mv.z);
  gl_PointSize = clamp(aSize * 220.0 / dist, 3.5, 14.0);
  gl_Position = projectionMatrix * mv;
  vec3 viewUp = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
  vScreenUp = length(viewUp.xy) > 1e-4
    ? normalize(vec2(viewUp.x, -viewUp.y))
    : vec2(0.0, -1.0);
}
`;

const IMPACT_FRAG = `
uniform vec3 uColor;
uniform float uAlpha;
varying float vLife;
varying vec2 vScreenUp;
${SNAP_GLSL}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // Fleck stays world-horizontal (perpendicular to world-up on screen).
  vec2 up = vScreenUp;
  vec2 right = vec2(-up.y, up.x);
  vec2 local = vec2(dot(c, right), dot(c, up));
  if (abs(local.y) > 0.16 || abs(local.x) > 0.46) discard;
  float a = uAlpha * vLife;
  if (a < 0.03) discard;
  gl_FragColor = vec4(snapFlat(uColor), a);
}
`;

/**
 * Camera-following rain: abstract falling streaks plus sparse ground/water hits.
 * World-scoped (lives next to sky/water), never parented to a streaming island.
 */
export class Rain {
  private streaks: THREE.Points;
  private streakGeo: THREE.BufferGeometry;
  private streakMat: THREE.ShaderMaterial;
  private streakPos: Float32Array;
  private streakVel: Float32Array;
  private streakLen: Float32Array;

  private impacts: THREE.Points;
  private impactGeo: THREE.BufferGeometry;
  private impactMat: THREE.ShaderMaterial;
  private impactPos: Float32Array;
  private impactLife: Float32Array;
  private impactSize: Float32Array;
  private impactAge: Float32Array;
  private impactSpan: Float32Array;

  private heightAt: HeightAt;
  private spawnTimer = 0;
  private hitTint = new THREE.Color(0.9, 0.94, 1);

  constructor(scene: THREE.Scene, heightAt: HeightAt) {
    this.heightAt = heightAt;

    this.streakPos = new Float32Array(STREAKS * 3);
    this.streakVel = new Float32Array(STREAKS);
    this.streakLen = new Float32Array(STREAKS);
    for (let i = 0; i < STREAKS; i++) {
      this.streakPos[i * 3] = (Math.random() * 2 - 1) * WRAP;
      this.streakPos[i * 3 + 1] = (Math.random() * 2 - 1) * Y_ABOVE;
      this.streakPos[i * 3 + 2] = (Math.random() * 2 - 1) * WRAP;
      this.streakVel[i] = 14 + Math.random() * 18;
      this.streakLen[i] = 0.55 + Math.random() * 0.7;
    }
    this.streakGeo = new THREE.BufferGeometry();
    this.streakGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.streakPos, 3),
    );
    this.streakGeo.setAttribute(
      "aLen",
      new THREE.BufferAttribute(this.streakLen, 1),
    );
    this.streakMat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0.72, 0.78, 0.88) },
        uAlpha: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.streaks = new THREE.Points(this.streakGeo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    scene.add(this.streaks);

    this.impactPos = new Float32Array(IMPACTS * 3);
    this.impactLife = new Float32Array(IMPACTS);
    this.impactSize = new Float32Array(IMPACTS);
    this.impactAge = new Float32Array(IMPACTS);
    this.impactSpan = new Float32Array(IMPACTS);
    for (let i = 0; i < IMPACTS; i++) {
      this.impactLife[i] = 0;
      this.impactAge[i] = Math.random();
      this.impactSpan[i] = 0.12 + Math.random() * 0.18;
      this.impactSize[i] = 0.35 + Math.random() * 0.45;
    }
    this.impactGeo = new THREE.BufferGeometry();
    this.impactGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.impactPos, 3),
    );
    this.impactGeo.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.impactSize, 1),
    );
    this.impactGeo.setAttribute(
      "aLife",
      new THREE.BufferAttribute(this.impactLife, 1),
    );
    this.impactMat = new THREE.ShaderMaterial({
      vertexShader: IMPACT_VERT,
      fragmentShader: IMPACT_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0.85, 0.9, 0.98) },
        uAlpha: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.impacts = new THREE.Points(this.impactGeo, this.impactMat);
    this.impacts.frustumCulled = false;
    this.impacts.visible = false;
    scene.add(this.impacts);
  }

  update(
    dt: number,
    eye: THREE.Vector3,
    day: DayCycle,
    weather: Weather,
  ): void {
    const amount = weather.rain;
    const show = amount > 0.02;
    this.streaks.visible = show;
    this.impacts.visible = show;
    if (!show) {
      this.streakMat.uniforms.uAlpha.value = 0;
      this.impactMat.uniforms.uAlpha.value = 0;
      return;
    }

    const wx = weather.windX * weather.windSpeed * 0.35;
    const wz = weather.windZ * weather.windSpeed * 0.35;
    const fallMul = 0.55 + amount * 0.9;

    const yTop = eye.y + Y_ABOVE;
    const yBot = eye.y - Y_BELOW;
    const pos = this.streakGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < STREAKS; i++) {
      let x = this.streakPos[i * 3] + wx * dt;
      let y = this.streakPos[i * 3 + 1] - this.streakVel[i] * fallMul * dt;
      let z = this.streakPos[i * 3 + 2] + wz * dt;

      if (y < yBot) {
        y = yTop - Math.random() * 2;
        x = eye.x + (Math.random() * 2 - 1) * WRAP;
        z = eye.z + (Math.random() * 2 - 1) * WRAP;
      } else if (y > yTop + 4) {
        // Climbing left drops stranded under the camera — pull them back into view.
        y = yBot + Math.random() * (Y_ABOVE + Y_BELOW);
      }

      if (x - eye.x > WRAP) x -= WRAP * 2;
      else if (x - eye.x < -WRAP) x += WRAP * 2;
      if (z - eye.z > WRAP) z -= WRAP * 2;
      else if (z - eye.z < -WRAP) z += WRAP * 2;

      this.streakPos[i * 3] = x;
      this.streakPos[i * 3 + 1] = y;
      this.streakPos[i * 3 + 2] = z;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;

    // Spawn hits a little faster than they die so the ground always peppers.
    this.spawnTimer -= dt;
    const spawnEvery = 1 / (10 + amount * 28);
    while (this.spawnTimer <= 0) {
      this.spawnTimer += spawnEvery;
      this.placeImpact(eye);
    }

    const iPos = this.impactGeo.getAttribute("position") as THREE.BufferAttribute;
    const iLife = this.impactGeo.getAttribute("aLife") as THREE.BufferAttribute;
    for (let i = 0; i < IMPACTS; i++) {
      if (this.impactLife[i] <= 0) continue;
      this.impactAge[i] += dt;
      const t = this.impactAge[i] / this.impactSpan[i];
      if (t >= 1) {
        this.impactLife[i] = 0;
        iLife.setX(i, 0);
        continue;
      }
      // Peak early, fade out — a tick, not a linger.
      const life = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      this.impactLife[i] = life;
      iLife.setX(i, life);
      iPos.setXYZ(
        i,
        this.impactPos[i * 3],
        this.impactPos[i * 3 + 1],
        this.impactPos[i * 3 + 2],
      );
    }
    iPos.needsUpdate = true;
    iLife.needsUpdate = true;

    // Soft pale dashes — light enough on the storm slate, not icy white.
    const streakCol = this.streakMat.uniforms.uColor.value as THREE.Color;
    streakCol.setRGB(0.78, 0.84, 0.9).lerp(day.horizon, 0.3);
    streakCol.multiplyScalar(0.88 + day.daylight * 0.14);

    const hitCol = this.impactMat.uniforms.uColor.value as THREE.Color;
    hitCol.copy(day.light).multiplyScalar(1.35).lerp(this.hitTint, 0.45);
    hitCol.multiplyScalar(0.7 + day.daylight * 0.45);

    this.streakMat.uniforms.uAlpha.value = 0.16 + amount * 0.38;
    this.impactMat.uniforms.uAlpha.value = 0.28 + amount * 0.42;
  }

  private placeImpact(eye: THREE.Vector3): void {
    let slot = -1;
    for (let i = 0; i < IMPACTS; i++) {
      if (this.impactLife[i] <= 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return;

    // Prefer near the player so hits read; a few land farther for depth.
    const near = Math.random() < 0.7;
    const r = near ? 2 + Math.random() * 12 : 10 + Math.random() * 18;
    const a = Math.random() * Math.PI * 2;
    const x = eye.x + Math.cos(a) * r;
    const z = eye.z + Math.sin(a) * r;
    const h = this.heightAt(x, z);
    // Ocean and ponds sit at y = 0; land gets a fleck just above the mesh.
    const y = h < 0.08 ? 0.04 : h + 0.05;

    this.impactPos[slot * 3] = x;
    this.impactPos[slot * 3 + 1] = y;
    this.impactPos[slot * 3 + 2] = z;
    this.impactAge[slot] = 0;
    this.impactSpan[slot] = 0.1 + Math.random() * 0.16;
    this.impactSize[slot] = (h < 0.08 ? 0.5 : 0.32) + Math.random() * 0.4;
    this.impactLife[slot] = 0.01;

    const iPos = this.impactGeo.getAttribute("position") as THREE.BufferAttribute;
    const iLife = this.impactGeo.getAttribute("aLife") as THREE.BufferAttribute;
    const iSize = this.impactGeo.getAttribute("aSize") as THREE.BufferAttribute;
    iPos.setXYZ(slot, x, y, z);
    iLife.setX(slot, 0.01);
    iSize.setX(slot, this.impactSize[slot]);
    iSize.needsUpdate = true;
  }
}

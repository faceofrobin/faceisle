import * as THREE from '../gl';
import { DayCycle } from './daycycle';
import { Weather } from './weather';
import { Rng } from '../util/random';
import { makeCloudTexture } from '../gfx/sprites/clouds';

const CLOUD_WRAP = 500;

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;
}
`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uMoonAlpha;
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -1.0, 1.0);


  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.65));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-h * 4.0, 0.0, 1.0));


  float sunAng = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
  float disc = 1.0 - smoothstep(0.055, 0.065, sunAng);
  float glow = pow(clamp(dot(dir, uSunDir), 0.0, 1.0), 6.0) * 0.22;
  float horizonBoost = 1.0 + (1.0 - clamp(uSunDir.y * 4.0, 0.0, 1.0)) * 0.35;
  col += uSunColor * (disc + glow) * horizonBoost;


  float moonAng = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
  float moon = (1.0 - smoothstep(0.035, 0.041, moonAng)) * uMoonAlpha;
  vec3 offDir = normalize(uMoonDir + vec3(0.018, 0.012, 0.0));
  float bite = (1.0 - smoothstep(0.026, 0.034, acos(clamp(dot(dir, offDir), -1.0, 1.0)))) * uMoonAlpha;
  col = mix(col, vec3(0.91, 0.93, 1.0), clamp(moon - bite * 0.55, 0.0, 1.0));
  col += vec3(0.35, 0.38, 0.5) * pow(clamp(dot(dir, uMoonDir), 0.0, 1.0), 24.0) * uMoonAlpha * 0.4;

  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
varying float vTwinkle;
void main() {
  vTwinkle = 0.65 + 0.35 * sin(uTime * 1.7 + aPhase);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * mv;
}
`;

const STAR_FRAG = `
uniform float uAlpha;
varying float vTwinkle;
void main() {
  if (uAlpha < 0.01) discard;
  gl_FragColor = vec4(vec3(0.92, 0.94, 1.0), uAlpha * vTwinkle);
}
`;

export class Sky {
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.ShaderMaterial;
  private clouds: THREE.Sprite[] = [];
  private cloudMats: THREE.SpriteMaterial[] = [];
  private cloudPos: THREE.Vector2[] = [];
  private cloudDrift: number[] = [];
  private cloudHeights: number[] = [];
  private cloudCover: number[] = [];
  private cloudBaseW: number[] = [];
  private bankAngles: number[] = [];
  private bankRadii: number[] = [];
  private farStart = 0;

  constructor(scene: THREE.Scene, rng: Rng) {
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uMoonAlpha: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    const N = 650;
    const positions = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const phases = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const az = rng.range(0, Math.PI * 2);
      const el = Math.asin(rng.range(0.03, 1));
      const r = 870;
      positions[i * 3] = Math.cos(el) * Math.cos(az) * r;
      positions[i * 3 + 1] = Math.sin(el) * r;
      positions[i * 3 + 2] = Math.cos(el) * Math.sin(az) * r;
      sizes[i] = rng.chance(0.12) ? 2.5 : 1.5;
      phases[i] = rng.range(0, Math.PI * 2);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    const cloudTextures = [makeCloudTexture(rng, 0), makeCloudTexture(rng, 1), makeCloudTexture(rng, 2)];
    const addCloud = (map: THREE.Texture, w: number, ySquash: number, height: number, cover: number): void => {
      const mat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(w, w * ySquash, 1);
      this.cloudHeights.push(height);
      this.cloudCover.push(cover);
      this.cloudBaseW.push(w);
      sprite.renderOrder = -8;
      this.clouds.push(sprite);
      this.cloudMats.push(mat);
      scene.add(sprite);
    };
    for (let i = 0; i < 64; i++) {
      addCloud(rng.pick(cloudTextures), rng.range(55, 130), 0.42, rng.range(95, 175), rng.range(0.02, 0.85));
      this.cloudPos.push(new THREE.Vector2(rng.range(-CLOUD_WRAP, CLOUD_WRAP), rng.range(-CLOUD_WRAP, CLOUD_WRAP)));
      this.cloudDrift.push(rng.range(0.6, 1.5));
    }
    this.farStart = this.clouds.length;
    for (let i = 0; i < 10; i++) {
      addCloud(rng.pick(cloudTextures), rng.range(150, 280), 0.3, rng.range(25, 65), rng.range(-0.4, 0.35));
      this.bankAngles.push(rng.range(0, Math.PI * 2));
      this.bankRadii.push(rng.range(480, 760));
    }
  }

  update(day: DayCycle, camPos: THREE.Vector3, time: number, dt: number, weather: Weather): void {
    this.dome.position.copy(camPos);
    this.stars.position.set(camPos.x, 0, camPos.z);

    const u = this.domeMat.uniforms;
    (u.uTop.value as THREE.Color).copy(day.skyTop);
    (u.uHorizon.value as THREE.Color).copy(day.horizon);
    (u.uSunDir.value as THREE.Vector3).copy(day.sunDir);
    (u.uSunColor.value as THREE.Color).copy(day.light);
    (u.uMoonDir.value as THREE.Vector3).copy(day.moonDir);
    u.uMoonAlpha.value = day.star;

    this.starMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uAlpha.value = day.star;

    const wx = weather.windX * weather.windSpeed;
    const wz = weather.windZ * weather.windSpeed;
    for (let i = 0; i < this.farStart; i++) {
      const p = this.cloudPos[i];
      p.x += wx * this.cloudDrift[i] * dt;
      p.y += wz * this.cloudDrift[i] * dt;
      if (p.x - camPos.x > CLOUD_WRAP) p.x -= CLOUD_WRAP * 2;
      else if (p.x - camPos.x < -CLOUD_WRAP) p.x += CLOUD_WRAP * 2;
      if (p.y - camPos.z > CLOUD_WRAP) p.y -= CLOUD_WRAP * 2;
      else if (p.y - camPos.z < -CLOUD_WRAP) p.y += CLOUD_WRAP * 2;
      this.clouds[i].position.set(p.x, this.cloudHeights[i], p.y);
      const w = this.cloudBaseW[i] * (1 + weather.cloudiness * 0.55);
      this.clouds[i].scale.set(w, w * 0.42, 1);
    }
    for (let i = this.farStart; i < this.clouds.length; i++) {
      const b = i - this.farStart;
      this.bankAngles[b] += dt * 0.0025 * (1 + (b % 3) * 0.4);
      const a = this.bankAngles[b];
      this.clouds[i].position.set(
        camPos.x + Math.cos(a) * this.bankRadii[b],
        this.cloudHeights[i],
        camPos.z + Math.sin(a) * this.bankRadii[b],
      );
    }

    for (let i = 0; i < this.clouds.length; i++) {
      const vis = THREE.MathUtils.clamp((weather.cloudiness - this.cloudCover[i]) / 0.18, 0, 1);
      this.cloudMats[i].opacity = vis;
      this.clouds[i].visible = vis > 0.01;
      this.cloudMats[i].color.copy(day.cloud);
      if (i >= this.farStart) this.cloudMats[i].color.lerp(day.horizon, 0.45);
    }
  }
}

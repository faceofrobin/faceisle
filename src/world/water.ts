import * as THREE from "../gl";
import { DayCycle } from "./daycycle";
import { Terrain } from "./terrain";
import { SNAP_GLSL } from "../gfx/post";

const HEIGHT_TEX_SIZE = 256;
const HEIGHT_EXTENT = 260;
const HEIGHT_RANGE = 8;

const VERT = `
varying vec3 vWorld;
varying float vFogDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uGlitter;
uniform vec2 uCamPos;
uniform sampler2D uHeight;
uniform float uInvExtent;
varying vec3 vWorld;
varying float vFogDepth;
${SNAP_GLSL}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 p = vWorld.xz;

  vec2 pc = floor(p * 0.85) / 0.85;

  vec2 huv = clamp(p * uInvExtent * 0.5 + 0.5, 0.0, 1.0);
  float th = texture2D(uHeight, huv).r * ${HEIGHT_RANGE}.0 - ${HEIGHT_RANGE / 2}.0;
  float depth = -th;


  float rimJit = (hash(pc * 1.3) - 0.5) * 0.5;
  float shallow = 1.0 - smoothstep(0.55, 1.15 + rimJit, depth);
  vec3 col = mix(uDeep, mix(uDeep, uLight, 0.72), shallow);


  float w1 = sin(pc.x * 0.020 + pc.y * 0.006 + uTime * 0.11);
  float w2 = sin(pc.y * 0.016 - pc.x * 0.004 - uTime * 0.08);
  float und = (w1 + w2 * 0.8) * 0.5 + 0.5;
  float open = smoothstep(0.3, 1.5, depth);
  float nearFade = 1.0 - smoothstep(65.0, 230.0, vFogDepth);
  col = mix(col, mix(uDeep, uLight, 0.5), und * 0.16 * open * nearFade);


  float distWash = smoothstep(40.0, 200.0, vFogDepth);
  col = mix(col, mix(uLight, uHorizon, 0.72), distWash * 0.4 * open);


  vec2 toFrag = p - uCamPos;
  vec2 dirF = toFrag / max(length(toFrag), 0.001);
  vec2 sunAz = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float lane = pow(max(dot(dirF, sunAz), 0.0), 5.0);
  col = mix(col, mix(col, uSunColor, 0.6), lane * uGlitter * 0.3 * open);


  float f = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(snapFlat(mix(col, uFogColor, f)), 1.0);
}
`;

export class Water {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const heightTex = this.bakeHeightTexture(terrain);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uDeep: { value: new THREE.Color() },
        uLight: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFogNear: { value: 40 },
        uFogFar: { value: 320 },
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uGlitter: { value: 0 },
        uCamPos: { value: new THREE.Vector2() },
        uHeight: { value: heightTex },
        uInvExtent: { value: 1 / HEIGHT_EXTENT },
      },
    });
    const geo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  private bakeHeightTexture(terrain: Terrain): THREE.DataTexture {
    const N = HEIGHT_TEX_SIZE;
    const data = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = (j / (N - 1)) * 2 * HEIGHT_EXTENT - HEIGHT_EXTENT;
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 * HEIGHT_EXTENT - HEIGHT_EXTENT;
        const h = THREE.MathUtils.clamp(
          terrain.heightAt(x, z),
          -HEIGHT_RANGE / 2,
          HEIGHT_RANGE / 2,
        );
        data[j * N + i] = Math.round(
          ((h + HEIGHT_RANGE / 2) / HEIGHT_RANGE) * 255,
        );
      }
    }
    const tex = new THREE.DataTexture(
      data,
      N,
      N,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  update(
    time: number,
    day: DayCycle,
    fog: THREE.Fog,
    camPos: THREE.Vector3,
  ): void {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    (u.uDeep.value as THREE.Color).copy(day.waterDeep);
    (u.uLight.value as THREE.Color).copy(day.waterLight);
    (u.uHorizon.value as THREE.Color).copy(day.horizon);
    (u.uFogColor.value as THREE.Color).copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
    (u.uSunDir.value as THREE.Vector3).copy(day.sunDir);
    (u.uSunColor.value as THREE.Color).copy(day.light);
    (u.uCamPos.value as THREE.Vector2).set(camPos.x, camPos.z);
    const sunLow = THREE.MathUtils.clamp(1 - day.sunDir.y * 3.4, 0, 1);
    u.uGlitter.value = day.daylight * (0.12 + 0.88 * sunLow);
  }
}

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

/**
 * Water, painted rather than simulated.
 *
 * A pond in this style is one flat colour. A sea is three or four: a pale
 * shelf hugging the land, the deep beyond it, and a step or two of haze on the
 * way to the horizon — each one a solid tone with a hard edge, none of them
 * blending into the next. There is no undulating light field, no fresnel, no
 * sun path and no glitter, because none of those things survive being flat:
 * they are all gradients, and a gradient on water is the one thing that drags
 * the whole island back toward looking rendered.
 *
 * Two details carry all of it:
 *
 *  - The coastline is decided per chunky cell, so it comes out as stair-
 *    stepped teeth. That ragged edge is most of what reads as "hand-drawn".
 *  - Sparse white dashes, a hand's width each, drifting slowly. They are the
 *    only moving thing on the surface and the only pixels that aren't one of
 *    the four flat tones.
 */
const FRAG = `
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
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

  // Chunky cells, and a random shove of a couple of metres per cell. The shove
  // moves the point we *ask the depth map about* — not the depth we compare it
  // to. That distinction is the whole coastline: offsetting the position gives
  // teeth a fixed couple of metres wide whether the beach shelves steeply or
  // runs out flat for fifty, while offsetting the depth smears the edge into a
  // field of speckle everywhere the bottom is gentle.
  vec2 cell = floor(p / 2.2);
  vec2 wob = (vec2(hash(cell), hash(cell + 17.3)) - 0.5) * 3.4;
  vec2 huv = clamp((p + wob) * uInvExtent * 0.5 + 0.5, 0.0, 1.0);
  float th = texture2D(uHeight, huv).r * ${HEIGHT_RANGE}.0 - ${HEIGHT_RANGE / 2}.0;
  float depth = -th;

  // One flat colour. No pale shallow band: Proteus's water meets the sand on a
  // hard edge and stays the same tone right up to it, and the moment you add a
  // lighter rim the sea starts looking lit rather than painted.
  vec3 col = uDeep;
  float open = step(1.1, depth);

  // Only the far distance moves off that tone, and then in flat steps rather
  // than a wash — the boundaries nudged per cell so the rings read as drawn
  // edges instead of the contour lines they really are.
  vec3 far = mix(uLight, uHorizon, 0.55);
  float band = floor(clamp((vFogDepth + (hash(cell + 5.1) - 0.5) * 14.0) / 130.0, 0.0, 2.0));
  col = mix(col, far, band * 0.13);

  // Foam: short bright dashes on open water, drifting a fraction of a metre a
  // second. The only moving thing on the surface, and the only pixels that
  // aren't one of the flat tones.
  vec2 dp = vec2(p.x * 0.42, p.y * 0.22) + vec2(uTime * 0.05, 0.0);
  vec2 dloc = fract(dp);
  float dash = step(0.94, hash(floor(dp)))
             * step(dloc.x, 0.5)
             * step(abs(dloc.y - 0.5), 0.06);
  // Foam is the day's own light, pushed up until it clips — white at noon,
  // cream at sunset, a dull blue-grey at midnight. Mixing toward pure white
  // instead would leave the sea glowing after dark.
  col = mix(col, min(vec3(1.0), uLight * 1.9), dash * open);

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

  /**
   * The surface takes its whole palette from the day cycle — `waterDeep` and
   * `waterLight` already swing warm at dawn and near-black at midnight, so the
   * sea changes colour through the day without the shader knowing where the
   * sun is.
   */
  update(time: number, day: DayCycle, fog: THREE.Fog): void {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    (u.uDeep.value as THREE.Color).copy(day.waterDeep);
    (u.uLight.value as THREE.Color).copy(day.waterLight);
    (u.uHorizon.value as THREE.Color).copy(day.horizon);
    (u.uFogColor.value as THREE.Color).copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
  }
}

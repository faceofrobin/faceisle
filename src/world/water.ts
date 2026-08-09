import * as THREE from "../gl";
import { DayCycle } from "./daycycle";
import { Archipelago } from "./archipelago";
import { Island } from "./island";
import { SNAP_GLSL } from "../gfx/post";

/**
 * The coastline is read from a height field baked around the player rather
 * than around one island. 384 texels over a 760 m window is 1.98 m each —
 * about one cell of the shader's chunky grid, which is what the teeth need.
 */
const HEIGHT_TEX_SIZE = 384;
const HEIGHT_EXTENT = 380;
const HEIGHT_RANGE = 8;
/** Re-bake once the player has walked far enough for the window to matter. */
const REBAKE_AT = 90;
/** Rows per slice; the whole bake is ~150k height samples, so it is spread. */
const BAKE_ROWS = 12;

/** Half-width of the surface. It follows the camera, so this is the horizon. */
const PLANE_REACH = 1800;

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
uniform vec2 uHeightCenter;
uniform float uInvExtent;
uniform float uAerial;
uniform float uRain;
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
  vec2 huv = (p + wob - uHeightCenter) * uInvExtent * 0.5 + 0.5;
  // Past the baked window there is nothing but open sea. Clamping to the edge
  // texel instead would drag the nearest coastline out to the horizon.
  float inside = step(0.0, huv.x) * step(huv.x, 1.0)
               * step(0.0, huv.y) * step(huv.y, 1.0);
  float th = texture2D(uHeight, clamp(huv, 0.0, 1.0)).r * ${HEIGHT_RANGE}.0 - ${HEIGHT_RANGE / 2}.0;
  float depth = mix(${HEIGHT_RANGE / 2}.0, -th, inside);

  // One flat colour. No pale shallow band: Proteus's water meets the sand on a
  // hard edge and stays the same tone right up to it, and the moment you add a
  // lighter rim the sea starts looking lit rather than painted.
  vec3 col = uDeep;
  float open = step(1.1, depth);

  // Only the far distance moves off that tone, and then in flat steps rather
  // than a wash — the boundaries nudged per cell so the rings read as drawn
  // edges instead of the contour lines they really are.
  //
  // Both parts are for an eye at head height, where the steps land as broad
  // rings on the water. Seen from the air the rings turn edge-on: a whole ring
  // collapses into a pixel row, and the per-cell nudge that made it look drawn
  // shatters it into a field of horizontal dashes. So the bands go as you
  // climb, and the sea below becomes the one flat tone it should have been.
  vec3 far = mix(uLight, uHorizon, 0.55);
  float jitter = (hash(cell + 5.1) - 0.5) * 14.0 * (1.0 - uAerial);
  float band = floor(clamp((vFogDepth + jitter) / 130.0, 0.0, 2.0));
  col = mix(col, far, band * 0.13 * (1.0 - uAerial));

  // Foam: short bright dashes on open water, drifting a fraction of a metre a
  // second. The only moving thing on the surface, and the only pixels that
  // aren't one of the flat tones.
  vec2 dp = vec2(p.x * 0.42, p.y * 0.22) + vec2(uTime * 0.05, 0.0);
  vec2 dloc = fract(dp);
  // Rain lifts the foam a little — denser dashes, still sparse and hard-edged.
  float dash = step(0.94 - uRain * 0.06, hash(floor(dp)))
             * step(dloc.x, 0.5)
             * step(abs(dloc.y - 0.5), 0.06 + uRain * 0.02);
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
  private world: Archipelago;

  /**
   * Two buffers: the shader keeps reading the last finished window while the
   * next one fills in behind it. Swapping the centre and the pixels together
   * is what makes the move invisible — both windows agree about the height
   * everywhere they overlap, because it comes from the same analytic terrain.
   */
  private tex: THREE.DataTexture;
  private front: Uint8Array;
  private back: Uint8Array;
  private bakeRow = HEIGHT_TEX_SIZE;
  private bakeX = 0;
  private bakeZ = 0;
  private bakeIslands: Island[] = [];
  private centerX = 0;
  private centerZ = 0;

  constructor(scene: THREE.Object3D, world: Archipelago, x: number, z: number) {
    this.world = world;
    const N = HEIGHT_TEX_SIZE;
    this.front = new Uint8Array(N * N);
    this.back = new Uint8Array(N * N);
    this.tex = new THREE.DataTexture(
      this.front,
      N,
      N,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;

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
        uHeight: { value: this.tex },
        uHeightCenter: { value: new THREE.Vector2(x, z) },
        uInvExtent: { value: 1 / HEIGHT_EXTENT },
        uAerial: { value: 0 },
        uRain: { value: 0 },
      },
    });
    const geo = new THREE.PlaneGeometry(PLANE_REACH * 2, PLANE_REACH * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // The first window is baked outright — there is a loading bar to hide it,
    // and the shore has to be right in the very first frame.
    this.beginBake(x, z);
    while (this.bakeRow < HEIGHT_TEX_SIZE) this.bakeSlice(HEIGHT_TEX_SIZE);
    this.commitBake();
  }

  private beginBake(x: number, z: number): void {
    this.bakeX = x;
    this.bakeZ = z;
    this.bakeRow = 0;
    this.world.islandsNear(x, z, HEIGHT_EXTENT * 1.5, this.bakeIslands);
  }

  private bakeSlice(rows: number): void {
    const N = HEIGHT_TEX_SIZE;
    const end = Math.min(N, this.bakeRow + rows);
    const step = (2 * HEIGHT_EXTENT) / (N - 1);
    const x0 = this.bakeX - HEIGHT_EXTENT;
    const z0 = this.bakeZ - HEIGHT_EXTENT;
    for (let j = this.bakeRow; j < end; j++) {
      const z = z0 + j * step;
      for (let i = 0; i < N; i++) {
        const x = x0 + i * step;
        let h = -HEIGHT_RANGE / 2;
        for (const island of this.bakeIslands) {
          if (!island.terrain.covers(x, z)) continue;
          const sample = island.terrain.heightAt(x, z);
          if (sample > h) h = sample;
        }
        h = THREE.MathUtils.clamp(h, -HEIGHT_RANGE / 2, HEIGHT_RANGE / 2);
        this.back[j * N + i] = Math.round(
          ((h + HEIGHT_RANGE / 2) / HEIGHT_RANGE) * 255,
        );
      }
    }
    this.bakeRow = end;
  }

  /**
   * Show the finished window. Centre and pixels change in the same frame, and
   * both windows agree about the height everywhere they overlap — they read
   * the same analytic terrain — so the coastline does not move at the swap.
   */
  private commitBake(): void {
    const shown = this.front;
    this.front = this.back;
    // The buffer the texture was reading has been uploaded; it becomes the one
    // the next bake fills. A bake never starts in the same frame as a commit.
    this.back = shown;
    (this.tex.image as { data: ArrayBufferView | null }).data = this.front;
    this.tex.needsUpdate = true;
    this.centerX = this.bakeX;
    this.centerZ = this.bakeZ;
    (this.mat.uniforms.uHeightCenter.value as THREE.Vector2).set(
      this.centerX,
      this.centerZ,
    );
  }

  /**
   * The surface takes its whole palette from the day cycle — `waterDeep` and
   * `waterLight` already swing warm at dawn and near-black at midnight, so the
   * sea changes colour through the day without the shader knowing where the
   * sun is.
   */
  update(
    time: number,
    day: DayCycle,
    fog: THREE.Fog,
    eye: THREE.Vector3,
    rain = 0,
  ): void {
    // World-space shading, so sliding the quad under the camera is seamless.
    this.mesh.position.set(eye.x, 0, eye.z);
    this.mat.uniforms.uAerial.value = THREE.MathUtils.clamp(
      (eye.y - 30) / 90,
      0,
      1,
    );

    if (this.bakeRow < HEIGHT_TEX_SIZE) {
      this.bakeSlice(BAKE_ROWS);
      if (this.bakeRow >= HEIGHT_TEX_SIZE) this.commitBake();
    } else if (Math.hypot(eye.x - this.centerX, eye.z - this.centerZ) > REBAKE_AT) {
      this.beginBake(eye.x, eye.z);
    }

    const u = this.mat.uniforms;
    u.uTime.value = time;
    (u.uDeep.value as THREE.Color).copy(day.waterDeep);
    (u.uLight.value as THREE.Color).copy(day.waterLight);
    (u.uHorizon.value as THREE.Color).copy(day.horizon);
    (u.uFogColor.value as THREE.Color).copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
    u.uRain.value = rain;
  }
}

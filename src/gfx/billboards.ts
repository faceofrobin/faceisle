import * as THREE from '../gl';
import { PixelSprite } from './sprites/painter';
import { SNAP_GLSL } from './post';

const VERT = `
attribute vec3 aOffset;
attribute vec2 aScale;
attribute float aPhase;
attribute float aShade;
attribute vec3 aRegion;
uniform float uTime;
uniform float uWind;
varying vec2 vUv;
varying float vFogDepth;
varying float vShade;
varying vec3 vRegion;
void main() {
  vUv = uv;
  vShade = aShade;
  vRegion = aRegion;
  vec3 toCam = cameraPosition - aOffset;
  vec3 horiz = vec3(toCam.x, 0.0, toCam.z);
  float hl = length(horiz);
  vec3 fwd = hl > 1e-4 ? horiz / hl : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(fwd.z, 0.0, -fwd.x);
  float sway = sin(uTime * 1.4 + aPhase) * uWind * position.y * abs(aScale.y) * 0.05;
  vec2 plane = position.xy * aScale;
  vec3 world = aOffset + right * (plane.x + sway) + vec3(0.0, plane.y, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform sampler2D uMap;
uniform vec3 uTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vFogDepth;
varying float vShade;
varying vec3 vRegion;
${SNAP_GLSL}
void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.5) discard;
  vec3 col = tex.rgb * uTint * vRegion * vShade;
  float f = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(snapFlat(mix(col, uFogColor, f)), 1.0);
}
`;

export interface Placement {
  x: number;
  y: number;
  z: number;
  height: number;
  flip: boolean;
  widthMul?: number;
  shade?: number;
  region?: THREE.Color;
}

export class SpriteBatcher {
  private uniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 40 },
    uFogFar: { value: 320 },
  };

  addBatch(scene: THREE.Object3D, sprite: PixelSprite, items: Placement[]): void {
    if (items.length === 0) return;
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = items.length;

    const offsets = new Float32Array(items.length * 3);
    const scales = new Float32Array(items.length * 2);
    const phases = new Float32Array(items.length);
    const shades = new Float32Array(items.length);
    const regions = new Float32Array(items.length * 3);
    const aspect = sprite.width / sprite.height;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      offsets[i * 3] = it.x;
      offsets[i * 3 + 1] = it.y;
      offsets[i * 3 + 2] = it.z;
      scales[i * 2] = it.height * aspect * (it.widthMul ?? 1) * (it.flip ? -1 : 1);
      scales[i * 2 + 1] = it.height;
      phases[i] = (it.x * 13.7 + it.z * 7.3) % (Math.PI * 2);
      shades[i] = it.shade ?? 1;
      regions[i * 3] = it.region ? it.region.r : 1;
      regions[i * 3 + 1] = it.region ? it.region.g : 1;
      regions[i * 3 + 2] = it.region ? it.region.b : 1;
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 2));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shades, 1));
    geo.setAttribute('aRegion', new THREE.InstancedBufferAttribute(regions, 3));

    const u = this.uniforms;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: sprite.texture },
        uTime: u.uTime,
        uWind: u.uWind,
        uTint: u.uTint,
        uFogColor: u.uFogColor,
        uFogNear: u.uFogNear,
        uFogFar: u.uFogFar,
      },
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  update(time: number, tint: THREE.Color, fog: THREE.Fog): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uTint.value.copy(tint);
    this.uniforms.uFogColor.value.copy(fog.color);
    this.uniforms.uFogNear.value = fog.near;
    this.uniforms.uFogFar.value = fog.far;
  }
}

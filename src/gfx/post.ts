import * as THREE from '../gl';

export const TARGET_ROWS = 270;

export const DITHER_LEVELS = 22;

const LADDER = DITHER_LEVELS - 1;

export const SNAP_GLSL = `
vec3 snapFlat(vec3 c) {
  return floor(c * ${LADDER}.0 + 0.5) / ${LADDER}.0;
}
`;

/**
 * Posterise a built-in material's final colour onto the same ladder the dither
 * pass uses, so flat-shaded geometry lands on the palette before downsampling.
 * Applied after fog, which is what keeps distant terrain banding consistently.
 */
export function snapMaterial(mat: THREE.Material): void {
  mat.snap = LADDER;
}

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
uniform sampler2D uMap;
uniform sampler2D uDither;
uniform vec2 uRes;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(uMap, vUv).rgb;

  float d = texture2D(uDither, vUv * uRes / 8.0).r;
  float levels = ${DITHER_LEVELS}.0;
  c = clamp(c + (d - 0.5) / levels, 0.0, 1.0);
  c = floor(c * (levels - 1.0) + 0.5) / (levels - 1.0);
  gl_FragColor = vec4(c, 1.0);
}
`;

function bayer8(): Uint8Array {
  let m = [[0, 2], [3, 1]];
  for (let size = 2; size < 8; size *= 2) {
    const next: number[][] = [];
    for (let y = 0; y < size * 2; y++) next.push(new Array(size * 2));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + size] = v + 2;
        next[y + size][x] = v + 3;
        next[y + size][x + size] = v + 1;
      }
    }
    m = next;
  }
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) out[y * 8 + x] = Math.round((m[y][x] / 64) * 255);
  }
  return out;
}

export class PixelatePass {
  private rt: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;

  constructor(width: number, height: number) {
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });

    const dither = new THREE.DataTexture(bayer8(), 8, 8, THREE.RedFormat, THREE.UnsignedByteType);
    dither.magFilter = THREE.NearestFilter;
    dither.minFilter = THREE.NearestFilter;
    dither.wrapS = THREE.RepeatWrapping;
    dither.wrapT = THREE.RepeatWrapping;
    dither.needsUpdate = true;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: this.rt.texture },
        uDither: { value: dither },
        uRes: { value: new THREE.Vector2(2, 2) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);

    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    const rows = Math.min(TARGET_ROWS, height);
    const cols = Math.round((width / height) * rows);
    this.rt.setSize(cols, rows);
    (this.mat.uniforms.uRes.value as THREE.Vector2).set(cols, rows);
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    overlay?: THREE.Scene | null,
  ): void {
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, camera);
    if (overlay) {
      const prev = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(overlay, this.quadCam);
      renderer.autoClear = prev;
    }
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }
}

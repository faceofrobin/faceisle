import * as THREE from '../../gl';
import { Rng } from '../../util/random';

const FIREFLY_VERT = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(186.0 * aSize / -mv.z, 2.5, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FIREFLY_FRAG = `
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float glow = pow(max(0.0, 1.0 - r), 1.2);
  if (glow < 0.02) discard;
  float core = smoothstep(0.6, 0.0, r);
  gl_FragColor = vec4(vColor * (0.75 + core * 0.8), glow);
}
`;

export class Fireflies {
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private home: Float32Array;
  private phase: Float32Array;
  private base: Float32Array;

  constructor(scene: THREE.Scene, forestSpots: THREE.Vector3[], rng: Rng) {
    const anchors = forestSpots.length > 0 ? forestSpots : [new THREE.Vector3()];
    const N = 230;
    this.home = new Float32Array(N * 3);
    this.phase = new Float32Array(N);
    this.base = new Float32Array(N * 3);
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rng.pick(anchors);
      this.home[i * 3] = a.x + rng.range(-9, 9);
      this.home[i * 3 + 1] = a.y + rng.range(0.6, 2.8);
      this.home[i * 3 + 2] = a.z + rng.range(-9, 9);
      this.phase[i] = rng.range(0, Math.PI * 2);
      positions[i * 3] = this.home[i * 3];
      positions[i * 3 + 1] = this.home[i * 3 + 1];
      positions[i * 3 + 2] = this.home[i * 3 + 2];
      if (rng.chance(0.55)) {
        this.base[i * 3] = 1.0;
        this.base[i * 3 + 1] = 0.86;
        this.base[i * 3 + 2] = 0.38;
      } else {
        this.base[i * 3] = 0.72;
        this.base[i * 3 + 1] = 1.0;
        this.base[i * 3 + 2] = 0.45;
      }
      sizes[i] = rng.range(0.42, 0.68);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: FIREFLY_VERT,
      fragmentShader: FIREFLY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(time: number, daylight: number): void {
    const night = 1 - daylight;
    this.points.visible = night > 0.4;
    if (!this.points.visible) return;
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.geo.getAttribute('aColor') as THREE.BufferAttribute;
    for (let i = 0; i < this.phase.length; i++) {
      const ph = this.phase[i];
      pos.setXYZ(
        i,
        this.home[i * 3] + Math.sin(time * 0.5 + ph) * 1.6,
        this.home[i * 3 + 1] + Math.sin(time * 0.9 + ph * 2.1) * 0.7,
        this.home[i * 3 + 2] + Math.cos(time * 0.4 + ph * 1.3) * 1.6,
      );
      const pulse = Math.pow(Math.max(0, Math.sin(time * 1.1 + ph * 3)), 1.2) * night;
      col.setXYZ(i, this.base[i * 3] * pulse, this.base[i * 3 + 1] * pulse, this.base[i * 3 + 2] * pulse);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

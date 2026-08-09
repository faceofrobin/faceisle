/**
 * A small WebGL2 renderer covering exactly what this game draws: flat-shaded
 * meshes, camera-facing sprites, points, and custom shader materials — with
 * linear fog and no lighting, shadows, loaders, or animation system.
 *
 * The API mirrors the slice of three.js the game previously used, so world and
 * gameplay code reads the same. Behaviour that affects the look is reproduced
 * deliberately rather than approximated: cylindrical sprite billboarding
 * (world-up, yaw toward camera), point-size attenuation relative to canvas
 * height, fog as a smoothstep between near and far, and three's
 * opaque/transparent sort order.
 */

export { ColorManagement, Color, Euler, MathUtils, Matrix4, Vector2, Vector3 } from "./math";

export {
  AdditiveBlending,
  BackSide,
  ClampToEdgeWrapping,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearSRGBColorSpace,
  NearestFilter,
  NoBlending,
  NormalBlending,
  RGBAFormat,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
} from "./constants";

export { CanvasTexture, DataTexture, Texture } from "./texture";

export {
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  SphereGeometry,
} from "./geometry";

export {
  Material,
  MeshBasicMaterial,
  PointsMaterial,
  ShaderMaterial,
  SpriteMaterial,
} from "./material";
export type { Uniform, Uniforms } from "./material";

export {
  Camera,
  Clock,
  Fog,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  Scene,
  Sprite,
} from "./objects";

export { WebGLRenderTarget, WebGLRenderer } from "./renderer";

import { FrontSide, NormalBlending } from "./constants";
import { Color } from "./math";
import { Texture } from "./texture";

export interface Uniform {
  value: unknown;
}

export type Uniforms = Record<string, Uniform>;

let nextMaterialId = 1;

export abstract class Material {
  readonly id = nextMaterialId++;
  abstract readonly type: "basic" | "shader" | "sprite" | "points";

  transparent = false;
  opacity = 1;
  depthTest = true;
  depthWrite = true;
  side: number = FrontSide;
  blending: number = NormalBlending;
  /** Whether scene fog applies. Defaults differ per subclass, as in three. */
  fog = false;
  alphaTest = 0;
  visible = true;
  /** Accepted and ignored — output is linear with no tone mapping. */
  toneMapped = true;
  /**
   * Posterisation ladder applied as the last step in the fragment shader.
   * 0 disables it. Set via `snapMaterial()`.
   */
  snap = 0;

  /** Bumped whenever a change invalidates the compiled program. */
  version = 0;

  dispose(): void {
    // Programs are owned and reused by the renderer's cache.
  }
}

interface BasicParams {
  color?: number | Color;
  map?: Texture | null;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  side?: number;
  blending?: number;
  fog?: boolean;
  alphaTest?: number;
  toneMapped?: boolean;
}

export class MeshBasicMaterial extends Material {
  override readonly type = "basic" as const;
  color = new Color(1, 1, 1);
  map: Texture | null = null;
  vertexColors = false;

  constructor(params: BasicParams = {}) {
    super();
    this.fog = true;
    applyParams(this, params as Record<string, unknown>);
  }
}

interface SpriteParams {
  color?: number | Color;
  map?: Texture | null;
  transparent?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  fog?: boolean;
  alphaTest?: number;
  blending?: number;
}

export class SpriteMaterial extends Material {
  override readonly type = "sprite" as const;
  color = new Color(1, 1, 1);
  map: Texture | null = null;

  constructor(params: SpriteParams = {}) {
    super();
    this.fog = true;
    applyParams(this, params as Record<string, unknown>);
  }
}

interface PointsParams {
  color?: number | Color;
  size?: number;
  sizeAttenuation?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  fog?: boolean;
  blending?: number;
}

export class PointsMaterial extends Material {
  override readonly type = "points" as const;
  color = new Color(1, 1, 1);
  size = 1;
  sizeAttenuation = true;

  constructor(params: PointsParams = {}) {
    super();
    this.fog = true;
    applyParams(this, params as Record<string, unknown>);
  }
}

interface ShaderParams {
  vertexShader?: string;
  fragmentShader?: string;
  uniforms?: Uniforms;
  transparent?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  side?: number;
  blending?: number;
  fog?: boolean;
  alphaTest?: number;
}

export class ShaderMaterial extends Material {
  override readonly type = "shader" as const;
  vertexShader = "void main() { gl_Position = vec4(position, 1.0); }";
  fragmentShader = "void main() { gl_FragColor = vec4(1.0); }";
  uniforms: Uniforms = {};

  constructor(params: ShaderParams = {}) {
    super();
    applyParams(this, params as Record<string, unknown>);
  }
}

function applyParams(target: Material, params: Record<string, unknown>): void {
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === undefined) continue;
    const current = (target as unknown as Record<string, unknown>)[key];
    if (current instanceof Color) {
      if (typeof value === "number") current.setHex(value);
      else if (value instanceof Color) current.copy(value);
      continue;
    }
    (target as unknown as Record<string, unknown>)[key] = value;
  }
}

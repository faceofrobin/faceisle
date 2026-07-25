import { BufferAttribute, BufferGeometry } from "./geometry";
import { Material } from "./material";
import { Color, Euler, Matrix4, MathUtils, Vector3 } from "./math";

let nextObjectId = 1;

export class Object3D {
  readonly id = nextObjectId++;
  readonly position = new Vector3();
  readonly rotation = new Euler();
  readonly scale = new Vector3(1, 1, 1);
  readonly matrixWorld = new Matrix4();
  visible = true;
  renderOrder = 0;
  /** Accepted for API parity; this renderer draws everything submitted. */
  frustumCulled = true;
  children: Object3D[] = [];
  parent: Object3D | null = null;

  add(object: Object3D): this {
    object.parent = this;
    this.children.push(object);
    return this;
  }

  remove(object: Object3D): this {
    const i = this.children.indexOf(object);
    if (i !== -1) {
      this.children.splice(i, 1);
      object.parent = null;
    }
    return this;
  }

  updateMatrixWorld(): void {
    this.matrixWorld.compose(this.position, this.rotation, this.scale);
    if (this.parent) {
      _tmpMatrix.copy(this.matrixWorld);
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, _tmpMatrix);
    }
    for (const child of this.children) child.updateMatrixWorld();
  }
}

const _tmpMatrix = new Matrix4();

export class Fog {
  readonly color: Color;
  near: number;
  far: number;

  constructor(color: number | Color = 0xffffff, near = 1, far = 1000) {
    this.color = color instanceof Color ? color.clone() : new Color(color);
    this.near = near;
    this.far = far;
  }
}

export class Scene extends Object3D {
  readonly isScene = true;
  fog: Fog | null = null;
}

export class Mesh extends Object3D {
  readonly isMesh = true;
  geometry: BufferGeometry;
  material: Material;

  constructor(geometry: BufferGeometry, material: Material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

export class Points extends Object3D {
  readonly isPoints = true;
  geometry: BufferGeometry;
  material: Material;

  constructor(geometry: BufferGeometry, material: Material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

/** Shared unit quad for every sprite, matching three's layout and winding. */
function makeSpriteGeometry(): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
      3,
    ),
  );
  geo.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  );
  geo.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  return geo;
}

let spriteGeometry: BufferGeometry | null = null;

export class Sprite extends Object3D {
  readonly isSprite = true;
  readonly geometry: BufferGeometry;
  material: Material;

  constructor(material: Material) {
    super();
    spriteGeometry ??= makeSpriteGeometry();
    this.geometry = spriteGeometry;
    this.material = material;
  }
}

export class Camera extends Object3D {
  readonly isCamera = true;
  readonly projectionMatrix = new Matrix4();
  readonly matrixWorldInverse = new Matrix4();

  override updateMatrixWorld(): void {
    super.updateMatrixWorld();
    this.matrixWorldInverse.invertRigid(this.matrixWorld);
  }
}

export class PerspectiveCamera extends Camera {
  fov: number;
  aspect: number;
  near: number;
  far: number;

  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix(): void {
    const top = this.near * Math.tan(MathUtils.DEG2RAD * 0.5 * this.fov);
    const height = 2 * top;
    const width = this.aspect * height;
    const left = -0.5 * width;
    this.projectionMatrix.makePerspective(
      left,
      left + width,
      top,
      top - height,
      this.near,
      this.far,
    );
  }
}

export class OrthographicCamera extends Camera {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;

  constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2000) {
    super();
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix(): void {
    this.projectionMatrix.makeOrthographic(
      this.left,
      this.right,
      this.top,
      this.bottom,
      this.near,
      this.far,
    );
  }
}

export class Clock {
  private prev = 0;
  private running = false;

  getDelta(): number {
    const now = performance.now();
    if (!this.running) {
      this.running = true;
      this.prev = now;
      return 0;
    }
    const delta = (now - this.prev) / 1000;
    this.prev = now;
    return delta;
  }
}

import {
  ClampToEdgeWrapping,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
} from "./constants";

export type TextureSource =
  | HTMLCanvasElement
  | { data: ArrayBufferView | null; width: number; height: number }
  | null;

let nextTextureId = 1;

export class Texture {
  readonly id = nextTextureId++;
  image: TextureSource;
  magFilter: number = LinearFilter;
  minFilter: number = LinearFilter;
  wrapS: number = ClampToEdgeWrapping;
  wrapT: number = ClampToEdgeWrapping;
  format: number = RGBAFormat;
  type: number = UnsignedByteType;
  generateMipmaps = false;
  flipY = true;
  unpackAlignment = 4;
  needsUpdate = false;
  /** Set by the renderer when this texture is backed by a render target. */
  isRenderTargetTexture = false;

  constructor(image: TextureSource = null) {
    this.image = image;
  }

  dispose(): void {
    // GL deletion is handled by the renderer's resource cache.
  }
}

export class CanvasTexture extends Texture {
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.needsUpdate = true;
  }
}

export class DataTexture extends Texture {
  constructor(
    data: ArrayBufferView | null,
    width: number,
    height: number,
    format: number = RGBAFormat,
    type: number = UnsignedByteType,
  ) {
    super({ data, width, height });
    this.format = format;
    this.type = type;
    // three's DataTexture defaults differ from the base Texture defaults.
    this.magFilter = NearestFilter;
    this.minFilter = NearestFilter;
    this.flipY = false;
    this.unpackAlignment = 1;
    this.needsUpdate = true;
  }
}

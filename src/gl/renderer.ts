import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  LinearFilter,
  NearestFilter,
  NormalBlending,
  RedFormat,
  RepeatWrapping,
} from "./constants";
import { BufferAttribute, BufferGeometry } from "./geometry";
import {
  Material,
  MeshBasicMaterial,
  PointsMaterial,
  ShaderMaterial,
  SpriteMaterial,
} from "./material";
import { Color, Matrix4, Vector2, Vector3 } from "./math";
import { Camera, Object3D, Points, Scene } from "./objects";
import { buildSource } from "./shaders";
import { Texture } from "./texture";

export interface RenderTargetOptions {
  minFilter?: number;
  magFilter?: number;
  depthBuffer?: boolean;
}

export class WebGLRenderTarget {
  width: number;
  height: number;
  readonly texture = new Texture(null);
  readonly depthBuffer: boolean;
  /** Bumped on resize so the renderer knows to reallocate. */
  version = 0;

  constructor(width: number, height: number, options: RenderTargetOptions = {}) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.depthBuffer = options.depthBuffer !== false;
    this.texture.isRenderTargetTexture = true;
    this.texture.flipY = false;
    this.texture.minFilter = options.minFilter ?? LinearFilter;
    this.texture.magFilter = options.magFilter ?? LinearFilter;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.version++;
  }

  dispose(): void {
    // Framebuffer resources are released by the renderer's cache.
  }
}

interface ProgramInfo {
  id: number;
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  attributes: Map<string, number>;
}

interface TargetInfo {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  depth: WebGLRenderbuffer | null;
  version: number;
}

interface Renderable {
  object: Object3D;
  geometry: BufferGeometry;
  material: Material;
  z: number;
}

export interface RendererParameters {
  antialias?: boolean;
  powerPreference?: WebGLPowerPreference;
  alpha?: boolean;
}

const _projScreen = new Matrix4();
const _modelView = new Matrix4();
const _vector = new Vector3();

/** Emit a GLSL float literal — bare integers would be an `int` in GLSL ES 1.0. */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function painterSort(a: Renderable, b: Renderable): number {
  if (a.object.renderOrder !== b.object.renderOrder) {
    return a.object.renderOrder - b.object.renderOrder;
  }
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.z !== b.z) return a.z - b.z;
  return a.object.id - b.object.id;
}

function reversePainterSort(a: Renderable, b: Renderable): number {
  if (a.object.renderOrder !== b.object.renderOrder) {
    return a.object.renderOrder - b.object.renderOrder;
  }
  if (a.z !== b.z) return b.z - a.z;
  return a.object.id - b.object.id;
}

export class WebGLRenderer {
  readonly domElement: HTMLCanvasElement;
  autoClear = true;
  /** Accepted and ignored; output is written linearly with no conversion. */
  outputColorSpace = "srgb-linear";

  private gl: WebGL2RenderingContext;
  private pixelRatio = 1;
  private width = 1;
  private height = 1;

  private programs = new Map<string, ProgramInfo>();
  private nextProgramId = 1;
  private buffers = new Map<BufferAttribute, { buffer: WebGLBuffer; version: number }>();
  private indexBuffers = new Map<BufferAttribute, WebGLBuffer>();
  /** Geometry id → program id → VAO, so a geometry's VAOs can be found to free. */
  private vaos = new Map<number, Map<number, WebGLVertexArrayObject>>();
  private textures = new Map<Texture, WebGLTexture>();
  private targets = new Map<WebGLRenderTarget, TargetInfo>();

  private currentProgram: WebGLProgram | null = null;
  private currentTarget: WebGLRenderTarget | null = null;
  private textureUnit = 0;

  // Mirrored GL state, so redundant transitions are skipped.
  private stateBlending = -1;
  private stateBlendEnabled = false;
  private stateCull = true;
  private stateFrontFaceCW = false;
  private stateDepthTest = true;
  private stateDepthMask = true;

  private opaque: Renderable[] = [];
  private transparent: Renderable[] = [];

  constructor(parameters: RendererParameters = {}) {
    this.domElement = document.createElement("canvas");
    const gl = this.domElement.getContext("webgl2", {
      alpha: parameters.alpha ?? false,
      depth: true,
      stencil: false,
      antialias: parameters.antialias ?? false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: parameters.powerPreference ?? "default",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.clearColor(0, 0, 0, 0);
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
    this.setSize(this.width, this.height);
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.domElement.width = Math.floor(width * this.pixelRatio);
    this.domElement.height = Math.floor(height * this.pixelRatio);
    this.domElement.style.width = `${width}px`;
    this.domElement.style.height = `${height}px`;
  }

  setAnimationLoop(callback: (() => void) | null): void {
    if (!callback) return;
    const tick = (): void => {
      callback();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  setRenderTarget(target: WebGLRenderTarget | null): void {
    const gl = this.gl;
    this.currentTarget = target;
    if (target) {
      const info = this.acquireTarget(target);
      gl.bindFramebuffer(gl.FRAMEBUFFER, info.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.domElement.width, this.domElement.height);
    }
  }

  clear(): void {
    const gl = this.gl;
    if (!this.stateDepthMask) {
      gl.depthMask(true);
      this.stateDepthMask = true;
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  render(scene: Scene, camera: Camera): void {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();

    _projScreen.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );

    this.opaque.length = 0;
    this.transparent.length = 0;
    this.collect(scene);
    this.opaque.sort(painterSort);
    this.transparent.sort(reversePainterSort);

    if (this.autoClear) this.clear();

    for (const item of this.opaque) this.draw(item, scene, camera);
    for (const item of this.transparent) this.draw(item, scene, camera);
  }

  private collect(object: Object3D): void {
    if (!object.visible) return;
    const holder = object as unknown as {
      geometry?: BufferGeometry;
      material?: Material;
    };
    if (holder.geometry && holder.material && holder.material.visible) {
      _vector.setFromMatrixPosition(object.matrixWorld);
      _vector.applyMatrix4(_projScreen);
      const item: Renderable = {
        object,
        geometry: holder.geometry,
        material: holder.material,
        z: _vector.z,
      };
      if (holder.material.transparent) this.transparent.push(item);
      else this.opaque.push(item);
    }
    for (const child of object.children) this.collect(child);
  }

  // ---- programs ---------------------------------------------------------

  private definesFor(material: Material, scene: Scene): string {
    if (material.type === "shader") return "";
    const lines: string[] = [];
    const withMap = material as unknown as { map?: Texture | null };
    if (material.type !== "points" && withMap.map) lines.push("#define USE_MAP");
    if (material.type === "basic" && (material as MeshBasicMaterial).vertexColors) {
      lines.push("#define USE_COLOR");
    }
    if (material.fog && scene.fog) lines.push("#define USE_FOG");
    if (material.alphaTest > 0) {
      lines.push(`#define ALPHATEST ${glslFloat(material.alphaTest)}`);
    }
    if (material.snap > 0) {
      lines.push(`#define SNAP ${glslFloat(material.snap)}`);
    }
    if (material.type === "points" && (material as PointsMaterial).sizeAttenuation) {
      lines.push("#define SIZE_ATTENUATION");
    }
    return lines.length ? `${lines.join("\n")}\n` : "";
  }

  private getProgram(material: Material, scene: Scene): ProgramInfo {
    const defines = this.definesFor(material, scene);
    const key =
      material.type === "shader"
        ? `s|${(material as ShaderMaterial).vertexShader}|${(material as ShaderMaterial).fragmentShader}`
        : `${material.type}|${defines}`;

    const cached = this.programs.get(key);
    if (cached) return cached;

    const shaderMat = material as ShaderMaterial;
    const source = buildSource(
      material.type,
      defines,
      shaderMat.vertexShader,
      shaderMat.fragmentShader,
    );
    const info = this.compile(source.vertex, source.fragment);
    this.programs.set(key, info);
    return info;
  }

  private compile(vertexSource: string, fragmentSource: string): ProgramInfo {
    const gl = this.gl;
    const program = gl.createProgram();
    const vs = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms = new Map<string, WebGLUniformLocation>();
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, "");
      const location = gl.getUniformLocation(program, info.name);
      if (location) uniforms.set(name, location);
    }

    const attributes = new Map<string, number>();
    const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < attribCount; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (!info) continue;
      attributes.set(info.name, gl.getAttribLocation(program, info.name));
    }

    return { id: this.nextProgramId++, program, uniforms, attributes };
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      throw new Error(`Shader compile failed: ${log}\n${source}`);
    }
    return shader;
  }

  // ---- buffers ----------------------------------------------------------

  private syncBuffer(attribute: BufferAttribute): WebGLBuffer {
    const gl = this.gl;
    let entry = this.buffers.get(attribute);
    if (!entry) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, attribute.array, gl.STATIC_DRAW);
      entry = { buffer, version: attribute.version };
      this.buffers.set(attribute, entry);
      return buffer;
    }
    if (entry.version !== attribute.version) {
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, attribute.array);
      entry.version = attribute.version;
    }
    return entry.buffer;
  }

  private getVao(
    geometry: BufferGeometry,
    program: ProgramInfo,
  ): WebGLVertexArrayObject {
    const gl = this.gl;
    let byProgram = this.vaos.get(geometry.id);
    if (!byProgram) {
      byProgram = new Map();
      this.vaos.set(geometry.id, byProgram);
    }
    const cached = byProgram.get(program.id);
    if (cached) return cached;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    for (const [name, location] of program.attributes) {
      const attribute = geometry.attributes[name];
      if (!attribute || location < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.syncBuffer(attribute));
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, attribute.itemSize, gl.FLOAT, false, 0, 0);
      if (attribute.isInstanced) gl.vertexAttribDivisor(location, 1);
    }

    if (geometry.index) {
      let indexBuffer = this.indexBuffers.get(geometry.index);
      if (!indexBuffer) {
        indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.index.array, gl.STATIC_DRAW);
        this.indexBuffers.set(geometry.index, indexBuffer);
      } else {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      }
    }

    gl.bindVertexArray(null);
    byProgram.set(program.id, vao);
    return vao;
  }

  // ---- releasing --------------------------------------------------------

  /**
   * Hand a geometry's GL objects back to the driver.
   *
   * The caches above are keyed by object identity and never expire on their
   * own, which costs nothing for a world built once at boot. Islands stream in
   * and out, so theirs have to be freed explicitly — a full island's terrain is
   * ~15 MB of vertex buffers, and a few crossings would exhaust the GPU.
   *
   * Only call this for geometry the caller owns outright. Sprites all share one
   * quad, so releasing a sprite's geometry would blank every other sprite.
   */
  releaseGeometry(geometry: BufferGeometry): void {
    const gl = this.gl;
    const byProgram = this.vaos.get(geometry.id);
    if (byProgram) {
      for (const vao of byProgram.values()) gl.deleteVertexArray(vao);
      this.vaos.delete(geometry.id);
    }
    for (const name in geometry.attributes) {
      const entry = this.buffers.get(geometry.attributes[name]);
      if (!entry) continue;
      gl.deleteBuffer(entry.buffer);
      this.buffers.delete(geometry.attributes[name]);
    }
    if (geometry.index) {
      const buffer = this.indexBuffers.get(geometry.index);
      if (buffer) {
        gl.deleteBuffer(buffer);
        this.indexBuffers.delete(geometry.index);
      }
    }
  }

  releaseTexture(texture: Texture): void {
    const handle = this.textures.get(texture);
    if (!handle) return;
    this.gl.deleteTexture(handle);
    this.textures.delete(texture);
  }

  // ---- textures ---------------------------------------------------------

  private glFilter(filter: number): number {
    return filter === NearestFilter ? this.gl.NEAREST : this.gl.LINEAR;
  }

  private glWrap(wrap: number): number {
    return wrap === RepeatWrapping ? this.gl.REPEAT : this.gl.CLAMP_TO_EDGE;
  }

  private bindTexture(texture: Texture, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);

    let handle = this.textures.get(texture);
    const isNew = !handle;
    if (!handle) {
      handle = gl.createTexture();
      this.textures.set(texture, handle);
    }
    gl.bindTexture(gl.TEXTURE_2D, handle);

    if (isNew || texture.needsUpdate) {
      if (!texture.isRenderTargetTexture) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment);
        const image = texture.image;
        if (image && "data" in image) {
          const red = texture.format === RedFormat;
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            red ? gl.R8 : gl.RGBA8,
            image.width,
            image.height,
            0,
            red ? gl.RED : gl.RGBA,
            gl.UNSIGNED_BYTE,
            image.data as ArrayBufferView,
          );
        } else if (image) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image as HTMLCanvasElement,
          );
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.glFilter(texture.magFilter));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.glFilter(texture.minFilter));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.glWrap(texture.wrapS));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.glWrap(texture.wrapT));
      texture.needsUpdate = false;
    }
  }

  private acquireTarget(target: WebGLRenderTarget): TargetInfo {
    const gl = this.gl;
    let info = this.targets.get(target);

    if (!info) {
      const texture = gl.createTexture();
      this.textures.set(target.texture, texture);
      info = {
        framebuffer: gl.createFramebuffer(),
        texture,
        depth: target.depthBuffer ? gl.createRenderbuffer() : null,
        version: -1,
      };
      this.targets.set(target, info);
    }

    if (info.version !== target.version) {
      gl.bindTexture(gl.TEXTURE_2D, info.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        target.width,
        target.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      const tex = target.texture;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.glFilter(tex.magFilter));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.glFilter(tex.minFilter));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.glWrap(tex.wrapS));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.glWrap(tex.wrapT));

      gl.bindFramebuffer(gl.FRAMEBUFFER, info.framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        info.texture,
        0,
      );
      if (info.depth) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, info.depth);
        // 24-bit, not 16. At sixteen bits the depth resolution a few hundred
        // metres out is tens of metres, which is more than the three metres
        // between the sea surface and the sea floor beneath it — the sea floor
        // then punches through the water in stripes. It never showed while the
        // fog stopped at 330 m; from the air it is the whole horizon.
        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          gl.DEPTH_COMPONENT24,
          target.width,
          target.height,
        );
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          gl.DEPTH_ATTACHMENT,
          gl.RENDERBUFFER,
          info.depth,
        );
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      info.version = target.version;
    }

    return info;
  }

  // ---- state ------------------------------------------------------------

  private applyState(material: Material): void {
    const gl = this.gl;

    const cull = material.side !== DoubleSide;
    if (cull !== this.stateCull) {
      if (cull) gl.enable(gl.CULL_FACE);
      else gl.disable(gl.CULL_FACE);
      this.stateCull = cull;
    }

    const frontFaceCW = material.side === BackSide;
    if (frontFaceCW !== this.stateFrontFaceCW) {
      gl.frontFace(frontFaceCW ? gl.CW : gl.CCW);
      this.stateFrontFaceCW = frontFaceCW;
    }

    const blending =
      material.blending === NormalBlending && !material.transparent
        ? -1
        : material.blending;
    if (blending !== this.stateBlending) {
      if (blending === -1) {
        if (this.stateBlendEnabled) {
          gl.disable(gl.BLEND);
          this.stateBlendEnabled = false;
        }
      } else {
        if (!this.stateBlendEnabled) {
          gl.enable(gl.BLEND);
          this.stateBlendEnabled = true;
        }
        if (blending === AdditiveBlending) {
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        } else {
          gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
        }
      }
      this.stateBlending = blending;
    }

    if (material.depthTest !== this.stateDepthTest) {
      if (material.depthTest) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
      this.stateDepthTest = material.depthTest;
    }

    if (material.depthWrite !== this.stateDepthMask) {
      gl.depthMask(material.depthWrite);
      this.stateDepthMask = material.depthWrite;
    }
  }

  // ---- uniforms ---------------------------------------------------------

  private setUniform(
    program: ProgramInfo,
    name: string,
    value: unknown,
  ): void {
    const location = program.uniforms.get(name);
    if (!location) return;
    const gl = this.gl;

    if (typeof value === "number") {
      gl.uniform1f(location, value);
    } else if (value instanceof Color) {
      gl.uniform3f(location, value.r, value.g, value.b);
    } else if (value instanceof Vector3) {
      gl.uniform3f(location, value.x, value.y, value.z);
    } else if (value instanceof Vector2) {
      gl.uniform2f(location, value.x, value.y);
    } else if (value instanceof Texture) {
      const unit = this.textureUnit++;
      this.bindTexture(value, unit);
      gl.uniform1i(location, unit);
    } else if (value instanceof Matrix4) {
      gl.uniformMatrix4fv(location, false, value.elements);
    } else if (typeof value === "boolean") {
      gl.uniform1i(location, value ? 1 : 0);
    }
  }

  // ---- draw -------------------------------------------------------------

  private draw(item: Renderable, scene: Scene, camera: Camera): void {
    const gl = this.gl;
    const { object, geometry, material } = item;
    const program = this.getProgram(material, scene);

    if (program.program !== this.currentProgram) {
      gl.useProgram(program.program);
      this.currentProgram = program.program;
    }
    this.textureUnit = 0;
    this.applyState(material);

    _modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    this.setUniform(program, "modelMatrix", object.matrixWorld);
    this.setUniform(program, "modelViewMatrix", _modelView);
    this.setUniform(program, "projectionMatrix", camera.projectionMatrix);
    this.setUniform(program, "viewMatrix", camera.matrixWorldInverse);
    if (program.uniforms.has("cameraPosition")) {
      _vector.setFromMatrixPosition(camera.matrixWorld);
      this.setUniform(program, "cameraPosition", _vector);
    }

    if (material.type === "shader") {
      const uniforms = (material as ShaderMaterial).uniforms;
      for (const name of Object.keys(uniforms)) {
        this.setUniform(program, name, uniforms[name].value);
      }
    } else {
      const tinted = material as MeshBasicMaterial | SpriteMaterial | PointsMaterial;
      this.setUniform(program, "diffuse", tinted.color);
      this.setUniform(program, "opacity", material.opacity);
      const mapped = material as MeshBasicMaterial | SpriteMaterial;
      if (mapped.map) this.setUniform(program, "map", mapped.map);
      if (material.fog && scene.fog) {
        this.setUniform(program, "fogColor", scene.fog.color);
        this.setUniform(program, "fogNear", scene.fog.near);
        this.setUniform(program, "fogFar", scene.fog.far);
      }
      if (material.type === "points") {
        const points = material as PointsMaterial;
        this.setUniform(program, "size", points.size * this.pixelRatio);
        // Matches three: attenuation is relative to the canvas height, not the
        // active render target, which is what gives the drifting motes their
        // chunky on-screen size once the scene is downsampled.
        this.setUniform(program, "scale", this.height * 0.5);
      }
    }

    // Refresh any dynamic attribute data before the VAO is bound: rebinding
    // ARRAY_BUFFER is not captured by VAO state, but ELEMENT_ARRAY_BUFFER is.
    for (const name of program.attributes.keys()) {
      const attribute = geometry.attributes[name];
      if (attribute) this.syncBuffer(attribute);
    }

    gl.bindVertexArray(this.getVao(geometry, program));

    const instances = geometry.instanceCount;
    const mode = (object as Points).isPoints ? gl.POINTS : gl.TRIANGLES;

    if (geometry.index) {
      const type =
        geometry.index.array instanceof Uint32Array
          ? gl.UNSIGNED_INT
          : gl.UNSIGNED_SHORT;
      const count = geometry.index.array.length;
      if (instances !== null) {
        gl.drawElementsInstanced(mode, count, type, 0, instances);
      } else {
        gl.drawElements(mode, count, type, 0);
      }
    } else {
      const count = geometry.attributes.position.count;
      if (instances !== null) {
        gl.drawArraysInstanced(mode, 0, count, instances);
      } else {
        gl.drawArrays(mode, 0, count);
      }
    }

    gl.bindVertexArray(null);
  }
}

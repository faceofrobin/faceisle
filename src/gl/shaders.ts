/**
 * Shader sources for the built-in material types, plus the uniform/attribute
 * prelude that user `ShaderMaterial` code is compiled against.
 *
 * Fog matches three's linear `Fog`: a *smoothstep* between near and far. The
 * game's own shaders use a plain clamped ramp instead, so the two must not be
 * unified — the difference is visible on the terrain horizon.
 */

const PRECISION = "precision highp float;\nprecision highp int;\n";

/** Injected into every ShaderMaterial, mirroring three's built-in prelude. */
const SHADER_MATERIAL_VERTEX_PRELUDE = `
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
attribute vec3 position;
attribute vec2 uv;
`;

const FOG_FRAGMENT = `
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
#endif
`;

const FOG_FRAGMENT_PARS = `
#ifdef USE_FOG
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying float vFogDepth;
#endif
`;

const SNAP_FRAGMENT = `
#ifdef SNAP
  gl_FragColor.rgb = floor(gl_FragColor.rgb * SNAP + 0.5) / SNAP;
#endif
`;

const BASIC_VERTEX = `
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
#ifdef USE_MAP
attribute vec2 uv;
varying vec2 vUv;
#endif
#ifdef USE_COLOR
attribute vec3 color;
varying vec3 vColor;
#endif
#ifdef USE_FOG
varying float vFogDepth;
#endif
void main() {
  #ifdef USE_MAP
    vUv = uv;
  #endif
  #ifdef USE_COLOR
    vColor = color;
  #endif
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`;

const BASIC_FRAGMENT = `
uniform vec3 diffuse;
uniform float opacity;
#ifdef USE_MAP
uniform sampler2D map;
varying vec2 vUv;
#endif
#ifdef USE_COLOR
varying vec3 vColor;
#endif
${FOG_FRAGMENT_PARS}
void main() {
  vec4 c = vec4(diffuse, opacity);
  #ifdef USE_MAP
    c *= texture2D(map, vUv);
  #endif
  #ifdef USE_COLOR
    c.rgb *= vColor;
  #endif
  #ifdef ALPHATEST
    if (c.a < ALPHATEST) discard;
  #endif
  gl_FragColor = c;
${FOG_FRAGMENT}
${SNAP_FRAGMENT}
}
`;

// Billboards the same way three's sprite shader does: take the object origin
// straight out of the model-view matrix and offset in view space, so the quad
// always faces the camera without any per-sprite CPU work.
const SPRITE_VERTEX = `
attribute vec3 position;
attribute vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec2 vUv;
#ifdef USE_FOG
varying float vFogDepth;
#endif
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix[3];
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mvPosition.xy += position.xy * scale;
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SPRITE_FRAGMENT = `
uniform vec3 diffuse;
uniform float opacity;
#ifdef USE_MAP
uniform sampler2D map;
#endif
varying vec2 vUv;
${FOG_FRAGMENT_PARS}
void main() {
  vec4 c = vec4(diffuse, opacity);
  #ifdef USE_MAP
    c *= texture2D(map, vUv);
  #endif
  #ifdef ALPHATEST
    if (c.a < ALPHATEST) discard;
  #endif
  gl_FragColor = c;
${FOG_FRAGMENT}
${SNAP_FRAGMENT}
}
`;

const POINTS_VERTEX = `
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float size;
uniform float scale;
#ifdef USE_FOG
varying float vFogDepth;
#endif
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size;
  #ifdef SIZE_ATTENUATION
    gl_PointSize *= (scale / -mv.z);
    // Attenuation alone is unbounded, and a petal or a snowflake a couple of
    // metres from the eye then covers a fifth of the frame's height as one
    // hard square. Everything drawn this way is small and far by intent, so
    // it is capped — the same thing the fireflies' own shader does.
    gl_PointSize = clamp(gl_PointSize, 1.0, 5.0);
  #endif
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FRAGMENT = `
uniform vec3 diffuse;
uniform float opacity;
${FOG_FRAGMENT_PARS}
void main() {
  gl_FragColor = vec4(diffuse, opacity);
${FOG_FRAGMENT}
${SNAP_FRAGMENT}
}
`;

export interface ProgramSource {
  vertex: string;
  fragment: string;
}

export function buildSource(
  type: "basic" | "shader" | "sprite" | "points",
  defines: string,
  userVertex?: string,
  userFragment?: string,
): ProgramSource {
  if (type === "shader") {
    return {
      vertex: PRECISION + defines + SHADER_MATERIAL_VERTEX_PRELUDE + userVertex,
      fragment: PRECISION + defines + userFragment,
    };
  }
  const [v, f] =
    type === "basic"
      ? [BASIC_VERTEX, BASIC_FRAGMENT]
      : type === "sprite"
        ? [SPRITE_VERTEX, SPRITE_FRAGMENT]
        : [POINTS_VERTEX, POINTS_FRAGMENT];
  return { vertex: PRECISION + defines + v, fragment: PRECISION + defines + f };
}

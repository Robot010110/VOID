// Thin structures (rails, struts, tethers, the circles of a lattice), one instance per straight
// piece, drawn as ribbons that always face the camera and shaded as round tubes. A strand never
// draws narrower than uMinPixels: below that it keeps that width and lowers its cover instead,
// so a ring far away reads as a steady line rather than breaking into dashes.
// The base quad's x runs along the piece (0 to 1), its y across it (-1 to 1).
attribute vec3 aStart;
attribute vec3 aEnd;
attribute float aRadius;
// Light from within (0 for none), and where along its structure the piece lies (0 to 1).
attribute vec2 aGlow;

uniform vec2 uViewport;
uniform float uMinPixels;
uniform vec3 uCamObj;

varying vec3 vPos;
varying vec3 vSide;
varying vec3 vFacing;
varying float vAcross;
varying float vCover;
varying float vHalf;
varying vec2 vGlow;

void main() {
  vec3 point = mix(aStart, aEnd, position.x);
  vec3 axis = normalize(aEnd - aStart);
  vec3 toCamera = normalize(uCamObj - point);
  vec3 facing = toCamera - axis * dot(toCamera, axis);
  facing = length(facing) > 1e-5 ? normalize(facing) : vec3(0.0, 1.0, 0.0);
  vec3 side = cross(axis, facing);

  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec4 clip = mvp * vec4(point, 1.0);
  vec4 clipSide = mvp * vec4(point + side * aRadius, 1.0);
  vec2 halfViewport = uViewport * 0.5;
  vec2 across = (clipSide.xy / clipSide.w - clip.xy / clip.w) * halfViewport;
  float radiusPixels = length(across);
  vec2 normal = radiusPixels > 1e-6 ? across / radiusPixels : vec2(0.0, 1.0);
  float halfWidth = max(radiusPixels, uMinPixels * 0.5);

  vCover = radiusPixels / halfWidth;
  vHalf = halfWidth;
  vAcross = position.y;
  vPos = point;
  vSide = side;
  vFacing = facing;
  vGlow = aGlow;
  clip.xy += normal * position.y * halfWidth / halfViewport * clip.w;
  gl_Position = clip;
}
